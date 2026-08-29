import { auth } from "@/auth";

import {
  supabaseAdmin,
} from "@/lib/supabase/admin";

import {
  NextRequest,
  NextResponse,
} from "next/server";

type MonthlyTransaction = {
  id: string;

  source_type:
    | "BANK"
    | "CARD";

  transaction_type:
    string;

  category_l1:
    string | null;

  category_l2:
    string | null;

  fixed_variable:
    string | null;

  essential_optional:
    string | null;

  amount:
    number | string;

  gross_amount:
    number | string | null;

  benefit_amount:
    number | string | null;

  fee_amount:
    number | string | null;

  net_amount:
    number | string | null;

  review_required:
    boolean;
};

async function getCurrentAppUser() {
  const session =
    await auth();

  if (!session?.user?.email) {
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
      .eq("email", email)
      .single();

  if (error || !data) {
    return null;
  }

  return data;
}

function getMonthRange(
  yearMonth: string
) {
  const [
    year,
    month,
  ] =
    yearMonth
      .split("-")
      .map(Number);

  const start =
    `${yearMonth}-01`;

  const end =
    new Date(
      Date.UTC(
        year,
        month,
        1
      )
    )
      .toISOString()
      .slice(0, 10);

  return {
    start,
    end,
  };
}

function numberValue(
  value:
    | number
    | string
    | null
    | undefined
) {
  const parsed =
    Number(
      value ?? 0
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

async function loadMonthlyState(
  userId: string,
  month: string
) {
  const {
    start,
    end,
  } =
    getMonthRange(month);

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("transactions")
      .select(
        `
        id,
        source_type,
        transaction_type,
        category_l1,
        category_l2,
        fixed_variable,
        essential_optional,
        amount,
        gross_amount,
        benefit_amount,
        fee_amount,
        net_amount,
        review_required
        `
      )
      .eq(
        "user_id",
        userId
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
    throw new Error(
      error.message
    );
  }

  const transactions =
    (
      data ??
      []
    ) as MonthlyTransaction[];

  const transactionIds =
    new Set(
      transactions.map(
        (transaction) =>
          transaction.id
      )
    );

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
        userId
      )
      .eq(
        "status",
        "NOT_REVIEWED"
      );

  if (duplicateError) {
    throw new Error(
      duplicateError.message
    );
  }

  const duplicateUnreviewedCount =
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

  const reviewRequiredCount =
    transactions.filter(
      (transaction) =>
        transaction.review_required
    ).length;

  const bankTransactionCount =
    transactions.filter(
      (transaction) =>
        transaction.source_type ===
        "BANK"
    ).length;

  const cardTransactionCount =
    transactions.filter(
      (transaction) =>
        transaction.source_type ===
        "CARD"
    ).length;

  return {
    start,

    transactions,

    ledgerTransactionCount:
      transactions.length,

    bankTransactionCount,

    cardTransactionCount,

    reviewRequiredCount,

    duplicateUnreviewedCount,
  };
}

function buildActualSnapshots(
  userId: string,
  closeId: string,
  yearMonth: string,
  transactions:
    MonthlyTransaction[]
) {
  type Aggregate = {
    user_id: string;
    monthly_close_id: string;
    year_month: string;

    source_type:
      "BANK" | "CARD";

    transaction_type:
      string;

    category_l1:
      string | null;

    category_l2:
      string | null;

    fixed_variable:
      string | null;

    essential_optional:
      string | null;

    transaction_count:
      number;

    amount_sum:
      number;

    gross_amount_sum:
      number;

    benefit_amount_sum:
      number;

    fee_amount_sum:
      number;

    net_amount_sum:
      number;
  };

  const map =
    new Map<
      string,
      Aggregate
    >();

  for (
    const transaction
    of transactions
  ) {
    const key = [
      transaction.source_type,
      transaction.transaction_type,

      transaction.category_l1 ??
        "",

      transaction.category_l2 ??
        "",

      transaction.fixed_variable ??
        "",

      transaction.essential_optional ??
        "",
    ].join("|");

    const existing =
      map.get(key);

    if (existing) {
      existing.transaction_count +=
        1;

      existing.amount_sum +=
        numberValue(
          transaction.amount
        );

      existing.gross_amount_sum +=
        numberValue(
          transaction.gross_amount
        );

      existing.benefit_amount_sum +=
        numberValue(
          transaction.benefit_amount
        );

      existing.fee_amount_sum +=
        numberValue(
          transaction.fee_amount
        );

      existing.net_amount_sum +=
        numberValue(
          transaction.net_amount
        );

      continue;
    }

    map.set(
      key,
      {
        user_id:
          userId,

        monthly_close_id:
          closeId,

        year_month:
          yearMonth,

        source_type:
          transaction.source_type,

        transaction_type:
          transaction.transaction_type,

        category_l1:
          transaction.category_l1,

        category_l2:
          transaction.category_l2,

        fixed_variable:
          transaction.fixed_variable,

        essential_optional:
          transaction.essential_optional,

        transaction_count:
          1,

        amount_sum:
          numberValue(
            transaction.amount
          ),

        gross_amount_sum:
          numberValue(
            transaction.gross_amount
          ),

        benefit_amount_sum:
          numberValue(
            transaction.benefit_amount
          ),

        fee_amount_sum:
          numberValue(
            transaction.fee_amount
          ),

        net_amount_sum:
          numberValue(
            transaction.net_amount
          ),
      }
    );
  }

  return Array.from(
    map.values()
  );
}

export async function POST(
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

  const body =
    await request.json();

  const month =
    String(
      body.month ?? ""
    );

  const action =
    String(
      body.action ?? ""
    );

  if (
    !/^\d{4}-\d{2}$/.test(
      month
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "월 형식이 올바르지 않습니다.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    action !== "CLOSE" &&
    action !== "REOPEN"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "올바르지 않은 마감 작업입니다.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    /*
     * =========================================================
     * REOPEN
     * =========================================================
     */

    if (
      action ===
      "REOPEN"
    ) {
      const {
        start,
      } =
        getMonthRange(
          month
        );

      const {
        data:
          existingClose,
        error:
          existingError,
      } =
        await supabaseAdmin
          .from(
            "monthly_closes"
          )
          .select(
            "id, status"
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

      if (existingError) {
        throw new Error(
          existingError.message
        );
      }

      if (
        !existingClose ||
        existingClose.status !==
          "CLOSED"
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "마감된 월만 다시 열 수 있습니다.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * Actual Snapshot 삭제.
       *
       * 재마감할 때 현재 거래 상태로
       * 새 Snapshot을 생성한다.
       */
      const {
        error:
          snapshotDeleteError,
      } =
        await supabaseAdmin
          .from(
            "monthly_actual_snapshots"
          )
          .delete()
          .eq(
            "monthly_close_id",
            existingClose.id
          );

      if (
        snapshotDeleteError
      ) {
        throw new Error(
          snapshotDeleteError.message
        );
      }

      const state =
        await loadMonthlyState(
          user.id,
          month
        );

      const nextStatus =
        state.ledgerTransactionCount >
          0 &&
        state.reviewRequiredCount ===
          0 &&
        state.duplicateUnreviewedCount ===
          0
          ? "CLOSE_READY"
          : "PARTIAL";

      const {
        error:
          reopenError,
      } =
        await supabaseAdmin
          .from(
            "monthly_closes"
          )
          .update({
            status:
              nextStatus,

            ledger_transaction_count:
              state.ledgerTransactionCount,

            bank_transaction_count:
              state.bankTransactionCount,

            card_transaction_count:
              state.cardTransactionCount,

            review_required_count:
              state.reviewRequiredCount,

            duplicate_unreviewed_count:
              state.duplicateUnreviewedCount,

            closed_at:
              null,

            reopened_at:
              new Date()
                .toISOString(),

            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "id",
            existingClose.id
          )
          .eq(
            "user_id",
            user.id
          );

      if (reopenError) {
        throw new Error(
          reopenError.message
        );
      }

      return NextResponse.json({
        success: true,

        action:
          "REOPEN",

        status:
          nextStatus,
      });
    }

    /*
     * =========================================================
     * CLOSE
     * =========================================================
     */

    const state =
      await loadMonthlyState(
        user.id,
        month
      );

    if (
      state.ledgerTransactionCount ===
      0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "마감할 거래내역이 없습니다.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      state.reviewRequiredCount >
      0
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            `확인 필요 거래 ${state.reviewRequiredCount}건을 먼저 처리해주세요.`,
        },
        {
          status: 400,
        }
      );
    }

    if (
      state.duplicateUnreviewedCount >
      0
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            `미검토 중복 후보 ${state.duplicateUnreviewedCount}건을 먼저 처리해주세요.`,
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ---------------------------------------------------------
     * monthly_closes 생성 또는 재사용
     * ---------------------------------------------------------
     */

    const {
      data:
        closeRow,
      error:
        closeUpsertError,
    } =
      await supabaseAdmin
        .from(
          "monthly_closes"
        )
        .upsert(
          {
            user_id:
              user.id,

            year_month:
              state.start,

            status:
              "CLOSE_READY",

            ledger_transaction_count:
              state.ledgerTransactionCount,

            bank_transaction_count:
              state.bankTransactionCount,

            card_transaction_count:
              state.cardTransactionCount,

            review_required_count:
              0,

            duplicate_unreviewed_count:
              0,

            updated_at:
              new Date()
                .toISOString(),
          },
          {
            onConflict:
              "user_id,year_month",
          }
        )
        .select(
          "id"
        )
        .single();

    if (
      closeUpsertError ||
      !closeRow
    ) {
      throw new Error(
        closeUpsertError?.message ??
        "월마감 정보를 생성하지 못했습니다."
      );
    }

    /*
     * ---------------------------------------------------------
     * 기존 Snapshot 제거
     *
     * 재시도 안전성을 위해 먼저 초기화.
     * ---------------------------------------------------------
     */

    const {
      error:
        deleteSnapshotError,
    } =
      await supabaseAdmin
        .from(
          "monthly_actual_snapshots"
        )
        .delete()
        .eq(
          "monthly_close_id",
          closeRow.id
        );

    if (
      deleteSnapshotError
    ) {
      throw new Error(
        deleteSnapshotError.message
      );
    }

    /*
     * ---------------------------------------------------------
     * Actual Snapshot 생성
     * ---------------------------------------------------------
     */

    const snapshots =
      buildActualSnapshots(
        user.id,
        closeRow.id,
        state.start,
        state.transactions
      );

    const CHUNK_SIZE =
      500;

    for (
      let startIndex = 0;
      startIndex <
      snapshots.length;
      startIndex +=
      CHUNK_SIZE
    ) {
      const chunk =
        snapshots.slice(
          startIndex,
          startIndex +
            CHUNK_SIZE
        );

      const {
        error:
          snapshotInsertError,
      } =
        await supabaseAdmin
          .from(
            "monthly_actual_snapshots"
          )
          .insert(
            chunk
          );

      if (
        snapshotInsertError
      ) {
        throw new Error(
          snapshotInsertError.message
        );
      }
    }

    /*
     * ---------------------------------------------------------
     * 최종 CLOSED
     * ---------------------------------------------------------
     */

    const closedAt =
      new Date()
        .toISOString();

    const {
      error:
        closeError,
    } =
      await supabaseAdmin
        .from(
          "monthly_closes"
        )
        .update({
          status:
            "CLOSED",

          closed_at:
            closedAt,

          reopened_at:
            null,

          updated_at:
            closedAt,
        })
        .eq(
          "id",
          closeRow.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (closeError) {
      throw new Error(
        closeError.message
      );
    }

    return NextResponse.json({
      success: true,

      action:
        "CLOSE",

      status:
        "CLOSED",

      snapshotCount:
        snapshots.length,

      closedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "월마감 처리 중 오류가 발생했습니다.",
      },
      {
        status: 500,
      }
    );
  }
}