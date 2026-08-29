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

  const nextMonth =
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
    end: nextMonth,
  };
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
          "조회할 월을 선택해주세요.",
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
    getMonthRange(month);

  /*
   * =========================================================
   * 월 거래 조회
   * =========================================================
   */

  const {
    data: transactions,
    error:
      transactionError,
  } =
    await supabaseAdmin
      .from("transactions")
      .select(
        `
        id,
        source_type,
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
      );

  if (transactionError) {
    return NextResponse.json(
      {
        success: false,
        error:
          transactionError.message,
      },
      {
        status: 500,
      }
    );
  }

  const rows =
    transactions ?? [];

  const transactionIds =
    new Set(
      rows.map(
        (row) => row.id
      )
    );

  const ledgerTransactionCount =
    rows.length;

  const bankTransactionCount =
    rows.filter(
      (row) =>
        row.source_type ===
        "BANK"
    ).length;

  const cardTransactionCount =
    rows.filter(
      (row) =>
        row.source_type ===
        "CARD"
    ).length;

  const reviewRequiredCount =
    rows.filter(
      (row) =>
        row.review_required
    ).length;

  /*
   * =========================================================
   * 미검토 중복 후보 조회
   * =========================================================
   */

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
        id,
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

  /*
   * =========================================================
   * 기존 마감정보
   * =========================================================
   */

  const {
    data: existingClose,
    error: closeError,
  } =
    await supabaseAdmin
      .from(
        "monthly_closes"
      )
      .select(
        `
        id,
        status,
        closed_at,
        reopened_at
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

  /*
   * 이미 CLOSED면 상태 고정.
   *
   * 그렇지 않은 경우 현재 데이터 상태로
   * 마감 가능 여부 계산.
   */
  let status:
    | "PARTIAL"
    | "CLOSE_READY"
    | "CLOSED";

  if (
    existingClose?.status ===
    "CLOSED"
  ) {
    status =
      "CLOSED";
  } else if (
    ledgerTransactionCount >
      0 &&
    reviewRequiredCount ===
      0 &&
    duplicateUnreviewedCount ===
      0
  ) {
    status =
      "CLOSE_READY";
  } else {
    status =
      "PARTIAL";
  }

  /*
   * Actual Snapshot 집계행 수
   */
  let snapshotCount = 0;

  if (existingClose?.id) {
    const {
      count,
      error:
        snapshotError,
    } =
      await supabaseAdmin
        .from(
          "monthly_actual_snapshots"
        )
        .select(
          "id",
          {
            count: "exact",
            head: true,
          }
        )
        .eq(
          "monthly_close_id",
          existingClose.id
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

    snapshotCount =
      count ?? 0;
  }

  return NextResponse.json({
    success: true,

    month,

    status,

    ledgerTransactionCount,

    bankTransactionCount,

    cardTransactionCount,

    reviewRequiredCount,

    duplicateUnreviewedCount,

    snapshotCount,

    closedAt:
      existingClose?.closed_at ??
      null,

    reopenedAt:
      existingClose?.reopened_at ??
      null,
  });
}