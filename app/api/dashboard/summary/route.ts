import { auth } from "@/auth";

import {
  supabaseAdmin,
} from "@/lib/supabase/admin";

import {
  NextRequest,
  NextResponse,
} from "next/server";

type MetricRow = {
  transactionType: string;

  categoryL1:
    string | null;

  amount: number;

  count: number;
};

async function getCurrentAppUser() {
  const session =
    await auth();

  if (
    !session?.user?.email
  ) {
    return null;
  }

  const email =
    session.user.email
      .trim()
      .toLowerCase();

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("app_users")
      .select("id")
      .eq(
        "email",
        email
      )
      .single();

  if (
    error ||
    !data
  ) {
    return null;
  }

  return data;
}

function getMonthRange(
  month: string
) {
  const [
    year,
    monthNumber,
  ] =
    month
      .split("-")
      .map(Number);

  return {
    start:
      `${month}-01`,

    end:
      new Date(
        Date.UTC(
          year,
          monthNumber,
          1
        )
      )
        .toISOString()
        .slice(
          0,
          10
        ),
  };
}

function aggregateMetrics(
  rows:
    MetricRow[]
) {
  let income = 0;

  let expense = 0;

  let refunds = 0;

  let reimbursements =
    0;

  let debtPayment = 0;

  let investmentTransfer =
    0;

  for (
    const row
    of rows
  ) {
    const amount =
      Number(
        row.amount ?? 0
      );

    switch (
      row.transactionType
    ) {
      case "INCOME":
        income +=
          amount;
        break;

      case "EXPENSE":
        expense +=
          Math.abs(
            amount
          );
        break;

      case "REFUND":
        refunds +=
          Math.abs(
            amount
          );
        break;

      case "REIMBURSEMENT":
        reimbursements +=
          Math.abs(
            amount
          );
        break;

      case "DEBT_PAYMENT":
        debtPayment +=
          Math.abs(
            amount
          );
        break;

      case "INVESTMENT_TRANSFER":
        investmentTransfer +=
          Math.abs(
            amount
          );
        break;
    }
  }

  /*
   * 카드대금 납부와 내부이체는
   * 관리회계 실적에서 다시 비용으로
   * 계산하지 않는다.
   */
  const livingExpense =
    expense -
    refunds -
    reimbursements;

  const managementSurplus =
    income -
    livingExpense;

  const residualCash =
    managementSurplus -
    debtPayment -
    investmentTransfer;

  return {
    income,
    expense,

    refunds,

    reimbursements,

    livingExpense,

    managementSurplus,

    debtPayment,

    investmentTransfer,

    residualCash,
  };
}

function buildCategoryBreakdown(
  rows:
    MetricRow[]
) {
  const categoryMap =
    new Map<
      string,
      number
    >();

  for (
    const row
    of rows
  ) {
    const category =
      row.categoryL1 ??
      "미분류";

    let change = 0;

    if (
      row.transactionType ===
      "EXPENSE"
    ) {
      change =
        Math.abs(
          row.amount
        );
    }

    if (
      row.transactionType ===
        "REFUND" ||
      row.transactionType ===
        "REIMBURSEMENT"
    ) {
      change =
        -Math.abs(
          row.amount
        );
    }

    if (
      change === 0
    ) {
      continue;
    }

    categoryMap.set(
      category,
      (
        categoryMap.get(
          category
        ) ?? 0
      ) + change
    );
  }

  return Array.from(
    categoryMap.entries()
  )
    .map(
      ([
        category,
        amount,
      ]) => ({
        category,
        amount:
          Math.max(
            amount,
            0
          ),
      })
    )
    .filter(
      (row) =>
        row.amount >
        0
    )
    .sort(
      (a, b) =>
        b.amount -
        a.amount
    );
}

export async function GET(
  request: NextRequest
) {
  const user =
    await getCurrentAppUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error:
          "로그인이 필요합니다.",
      },
      {
        status: 401,
      }
    );
  }

  const month =
    request.nextUrl
      .searchParams
      .get("month");

  if (
    !month ||
    !/^\d{4}-\d{2}$/.test(
      month
    )
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          "조회 월이 올바르지 않습니다.",
      },
      {
        status: 400,
      }
    );
  }

  const {
    start,
    end,
  } =
    getMonthRange(
      month
    );

  /*
   * =========================================================
   * 해당 월 마감 상태
   * =========================================================
   */

  const {
    data:
      monthlyClose,
    error:
      closeError,
  } =
    await supabaseAdmin
      .from(
        "monthly_closes"
      )
      .select(
        `
        id,
        status,
        closed_at
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "year_month",
        start
      )
      .maybeSingle();

  if (closeError) {
    return NextResponse.json(
      {
        success: false,

        error:
          closeError.message,
      },
      {
        status: 500,
      }
    );
  }

  const closed =
    monthlyClose?.status ===
    "CLOSED";

  let metricRows:
    MetricRow[] = [];

  /*
   * =========================================================
   * CLOSED → Snapshot
   * =========================================================
   */

  if (
    closed &&
    monthlyClose
  ) {
    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "monthly_actual_snapshots"
        )
        .select(
          `
          transaction_type,
          category_l1,
          transaction_count,
          amount_sum
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "monthly_close_id",
          monthlyClose.id
        );

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            error.message,
        },
        {
          status: 500,
        }
      );
    }

    metricRows =
      (
        data ??
        []
      ).map(
        (row) => ({
          transactionType:
            row.transaction_type,

          categoryL1:
            row.category_l1,

          amount:
            Number(
              row.amount_sum ??
              0
            ),

          count:
            Number(
              row.transaction_count ??
              0
            ),
        })
      );
  }

  /*
   * =========================================================
   * 미마감 → 현재 Transaction 잠정치
   * =========================================================
   */

  if (!closed) {
    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "transactions"
        )
        .select(
          `
          transaction_type,
          category_l1,
          amount
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "include_in_ledger",
          true
        )
        .gte(
          "transaction_date",
          start
        )
        .lt(
          "transaction_date",
          end
        );

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            error.message,
        },
        {
          status: 500,
        }
      );
    }

    metricRows =
      (
        data ??
        []
      ).map(
        (row) => ({
          transactionType:
            row.transaction_type,

          categoryL1:
            row.category_l1,

          amount:
            Number(
              row.amount ??
              0
            ),

          count:
            1,
        })
      );
  }

  const summary =
    aggregateMetrics(
      metricRows
    );

  const categories =
    buildCategoryBreakdown(
      metricRows
    );

  /*
   * =========================================================
   * 현재 월 Transaction 상태
   * =========================================================
   */

  const {
    data:
      monthTransactions,
    error:
      monthTransactionError,
  } =
    await supabaseAdmin
      .from(
        "transactions"
      )
      .select(
        `
        id,
        transaction_date,
        source_type,
        counterparty,
        description,
        transaction_type,
        category_l1,
        amount,
        review_required
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "include_in_ledger",
        true
      )
      .gte(
        "transaction_date",
        start
      )
      .lt(
        "transaction_date",
        end
      )
      .order(
        "transaction_date",
        {
          ascending: false,
        }
      );

  if (
    monthTransactionError
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          monthTransactionError.message,
      },
      {
        status: 500,
      }
    );
  }

  const transactions =
    monthTransactions ??
    [];

  const reviewRequiredCount =
    transactions.filter(
      (transaction) =>
        transaction.review_required
    ).length;

  /*
   * =========================================================
   * 중복 미검토
   * =========================================================
   */

  const transactionIds =
    new Set(
      transactions.map(
        (transaction) =>
          transaction.id
      )
    );

  let duplicateUnreviewedCount =
    0;

  if (
    transactionIds.size >
    0
  ) {
    const {
      data:
        duplicateCandidates,
      error:
        duplicateError,
    } =
      await supabaseAdmin
        .from(
          "transaction_duplicate_candidates"
        )
        .select(
          `
          transaction_a_id,
          transaction_b_id
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "status",
          "NOT_REVIEWED"
        );

    if (duplicateError) {
      return NextResponse.json(
        {
          success: false,
          error:
            duplicateError.message,
        },
        {
          status: 500,
        }
      );
    }

    duplicateUnreviewedCount =
      (
        duplicateCandidates ??
        []
      ).filter(
        (candidate) =>
          transactionIds.has(
            candidate.transaction_a_id
          ) ||
          transactionIds.has(
            candidate.transaction_b_id
          )
      ).length;
  }

  /*
   * =========================================================
   * Workflow 상태
   * =========================================================
   */

  let workflowStatus:
    "NO_DATA"
    | "REVIEW"
    | "DUPLICATES"
    | "READY_TO_CLOSE"
    | "CLOSED";

  let nextAction:
    {
      label: string;
      href: string;
    };

  if (
    transactions.length ===
    0
  ) {
    workflowStatus =
      "NO_DATA";

    nextAction = {
      label:
        "거래내역 업로드",
      href:
        "/finance/upload",
    };
  } else if (
    reviewRequiredCount >
    0
  ) {
    workflowStatus =
      "REVIEW";

    nextAction = {
      label:
        `${reviewRequiredCount}건 거래 검토`,
      href:
        `/finance/review`,
    };
  } else if (
    duplicateUnreviewedCount >
    0
  ) {
    workflowStatus =
      "DUPLICATES";

    nextAction = {
      label:
        `${duplicateUnreviewedCount}건 중복 검토`,
      href:
        `/finance/duplicates`,
    };
  } else if (closed) {
    workflowStatus =
      "CLOSED";

    nextAction = {
      label:
        "거래내역 보기",
      href:
        "/finance/transactions",
    };
  } else {
    workflowStatus =
      "READY_TO_CLOSE";

    nextAction = {
      label:
        "월마감 진행",
      href:
        "/finance/close",
    };
  }

  /*
   * =========================================================
   * 조회 가능한 월
   * =========================================================
   */

  const {
    data:
      dateRows,
  } =
    await supabaseAdmin
      .from(
        "transactions"
      )
      .select(
        "transaction_date"
      )
      .eq(
        "user_id",
        user.id
      )
      .order(
        "transaction_date",
        {
          ascending: false,
        }
      )
      .limit(5000);

  const availableMonths =
    Array.from(
      new Set(
        (
          dateRows ??
          []
        )
          .map(
            (row) =>
              row.transaction_date
                ?.slice(
                  0,
                  7
                )
          )
          .filter(Boolean)
      )
    );

  return NextResponse.json({
    success: true,

    month,

    basis:
      closed
        ? "CLOSED"
        : "PROVISIONAL",

    closeStatus:
      closed
        ? "CLOSED"
        : (
            monthlyClose?.status ??
            "PARTIAL"
          ),

    closedAt:
      monthlyClose?.closed_at ??
      null,

    summary,

    categories,

    transactionCount:
      transactions.length,

    reviewRequiredCount,

    duplicateUnreviewedCount,

    workflowStatus,

    nextAction,

    recentTransactions:
      transactions.slice(
        0,
        8
      ),

    availableMonths,
  });
}