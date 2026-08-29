import { auth } from "@/auth";

import {
  supabaseAdmin,
} from "@/lib/supabase/admin";

import {
  NextRequest,
  NextResponse,
} from "next/server";

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

  const requestedMonths =
    Number(
      request.nextUrl
        .searchParams
        .get("months") ??
        12
    );

  const monthCount =
    Math.min(
      Math.max(
        requestedMonths,
        1
      ),
      36
    );

  /*
   * 최근 CLOSED 월
   */
  const {
    data:
      closes,
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
        year_month
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "status",
        "CLOSED"
      )
      .order(
        "year_month",
        {
          ascending: false,
        }
      )
      .limit(
        monthCount
      );

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

  if (
    !closes ||
    closes.length ===
    0
  ) {
    return NextResponse.json({
      success: true,
      trend: [],
    });
  }

  const closeIds =
    closes.map(
      (close) =>
        close.id
    );

  const {
    data:
      snapshots,
    error:
      snapshotError,
  } =
    await supabaseAdmin
      .from(
        "monthly_actual_snapshots"
      )
      .select(
        `
        monthly_close_id,
        transaction_type,
        amount_sum
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .in(
        "monthly_close_id",
        closeIds
      );

  if (snapshotError) {
    return NextResponse.json(
      {
        success: false,

        error:
          snapshotError.message,
      },
      {
        status: 500,
      }
    );
  }

  const closeMap =
    new Map(
      closes.map(
        (close) => [
          close.id,
          close.year_month,
        ]
      )
    );

  type TrendValue = {
    month: string;

    income: number;

    expense: number;

    refund: number;

    reimbursement: number;

    livingExpense: number;

    managementSurplus: number;

    debtPayment: number;

    investmentTransfer: number;

    residualCash: number;
  };

  const trendMap =
    new Map<
      string,
      TrendValue
    >();

  for (
    const close
    of closes
  ) {
    trendMap.set(
      close.year_month,
      {
        month:
          close.year_month.slice(
            0,
            7
          ),

        income: 0,

        expense: 0,

        refund: 0,

        reimbursement: 0,

        livingExpense:
          0,

        managementSurplus:
          0,

        debtPayment:
          0,

        investmentTransfer:
          0,

        residualCash:
          0,
      }
    );
  }

  for (
    const snapshot
    of snapshots ?? []
  ) {
    const yearMonth =
      closeMap.get(
        snapshot.monthly_close_id
      );

    if (!yearMonth) {
      continue;
    }

    const trend =
      trendMap.get(
        yearMonth
      );

    if (!trend) {
      continue;
    }

    const amount =
      Number(
        snapshot.amount_sum ??
        0
      );

    switch (
      snapshot.transaction_type
    ) {
      case "INCOME":
        trend.income +=
          amount;
        break;

      case "EXPENSE":
        trend.expense +=
          Math.abs(
            amount
          );
        break;

      case "REFUND":
        trend.refund +=
          Math.abs(
            amount
          );
        break;

      case "REIMBURSEMENT":
        trend.reimbursement +=
          Math.abs(
            amount
          );
        break;

      case "DEBT_PAYMENT":
        trend.debtPayment +=
          Math.abs(
            amount
          );
        break;

      case "INVESTMENT_TRANSFER":
        trend.investmentTransfer +=
          Math.abs(
            amount
          );
        break;
    }
  }

  for (
    const trend
    of trendMap.values()
  ) {
    trend.livingExpense =
      trend.expense -
      trend.refund -
      trend.reimbursement;

    trend.managementSurplus =
      trend.income -
      trend.livingExpense;

    trend.residualCash =
      trend.managementSurplus -
      trend.debtPayment -
      trend.investmentTransfer;
  }

  const result =
    Array.from(
      trendMap.values()
    ).sort(
      (a, b) =>
        a.month.localeCompare(
          b.month
        )
    );

  return NextResponse.json({
    success: true,

    trend:
      result,
  });
}