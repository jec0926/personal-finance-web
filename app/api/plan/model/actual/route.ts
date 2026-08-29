import { auth } from "@/auth";

import {
  supabaseAdmin,
} from "@/lib/supabase/admin";

import {
  NextRequest,
  NextResponse,
} from "next/server";

type Mapping = {
  id: string;

  plan_row_id: string;

  source_type:
    string | null;

  transaction_type:
    string;

  category_l1:
    string | null;

  category_l2:
    string | null;

  amount_basis:
    | "SIGNED_AMOUNT"
    | "ABS_AMOUNT"
    | "ABS_NET";

  multiplier:
    number | string;
};

type Snapshot = {
  id: string;

  year_month:
    string;

  source_type:
    string;

  transaction_type:
    string;

  category_l1:
    string | null;

  category_l2:
    string | null;

  amount_sum:
    number | string;

  net_amount_sum:
    number | string;
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

  if (
    error ||
    !data
  ) {
    return null;
  }

  return data;
}

function mappingMatches(
  mapping: Mapping,
  snapshot: Snapshot
) {
  if (
    mapping.source_type &&
    mapping.source_type !==
      snapshot.source_type
  ) {
    return false;
  }

  if (
    mapping.transaction_type !==
    snapshot.transaction_type
  ) {
    return false;
  }

  if (
    mapping.category_l1 &&
    mapping.category_l1 !==
      snapshot.category_l1
  ) {
    return false;
  }

  if (
    mapping.category_l2 &&
    mapping.category_l2 !==
      snapshot.category_l2
  ) {
    return false;
  }

  return true;
}

/*
 * 여러 Mapping이 한 Snapshot에 겹치는 경우
 * 가장 구체적인 Mapping 하나만 적용.
 *
 * 예:
 * EXPENSE / 식비 /*
 * EXPENSE / 식비 / 카페
 *
 * 카페 Snapshot은 두 규칙에 걸리지만
 * 더 구체적인 카페 규칙만 사용.
 */
function mappingSpecificity(
  mapping: Mapping
) {
  let score = 0;

  if (
    mapping.source_type
  ) {
    score += 1;
  }

  if (
    mapping.category_l1
  ) {
    score += 2;
  }

  if (
    mapping.category_l2
  ) {
    score += 4;
  }

  return score;
}

function calculateAmount(
  mapping: Mapping,
  snapshot: Snapshot
) {
  const amount =
    Number(
      snapshot.amount_sum ??
        0
    );

  const netAmount =
    Number(
      snapshot.net_amount_sum ??
        0
    );

  const multiplier =
    Number(
      mapping.multiplier ??
        1
    );

  if (
    mapping.amount_basis ===
    "SIGNED_AMOUNT"
  ) {
    return (
      amount *
      multiplier
    );
  }

  if (
    mapping.amount_basis ===
    "ABS_NET"
  ) {
    return (
      Math.abs(
        netAmount
      ) *
      multiplier
    );
  }

  return (
    Math.abs(
      amount
    ) *
    multiplier
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

  const planId =
    request.nextUrl
      .searchParams
      .get("planId");

  if (!planId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Plan ID가 필요합니다.",
      },
      {
        status: 400,
      }
    );
  }

  /*
   * Plan 소유권 / 기간
   */
  const {
    data: plan,
    error: planError,
  } =
    await supabaseAdmin
      .from(
        "financial_plan_versions"
      )
      .select(
        `
        id,
        start_month,
        end_month
        `
      )
      .eq(
        "id",
        planId
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

  if (
    planError ||
    !plan
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          planError?.message ??
          "Plan을 찾을 수 없습니다.",
      },
      {
        status:
          planError
            ? 500
            : 404,
      }
    );
  }

  /*
   * Plan Rows
   */
  const {
    data: rows,
    error: rowsError,
  } =
    await supabaseAdmin
      .from(
        "financial_plan_rows"
      )
      .select(
        `
        id,
        section,
        row_name
        `
      )
      .eq(
        "plan_version_id",
        planId
      )
      .eq(
        "is_active",
        true
      );

  if (rowsError) {
    return NextResponse.json(
      {
        success: false,
        error:
          rowsError.message,
      },
      {
        status: 500,
      }
    );
  }

  const rowIds =
    (rows ?? []).map(
      (row) =>
        row.id
    );

  if (
    rowIds.length === 0
  ) {
    return NextResponse.json({
      success: true,
      actuals: {},
      closedMonths: [],
    });
  }

  /*
   * Mapping
   */
  const {
    data: mappingData,
    error: mappingError,
  } =
    await supabaseAdmin
      .from(
        "financial_plan_actual_mappings"
      )
      .select(
        `
        id,
        plan_row_id,
        source_type,
        transaction_type,
        category_l1,
        category_l2,
        amount_basis,
        multiplier
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "is_active",
        true
      )
      .in(
        "plan_row_id",
        rowIds
      );

  if (mappingError) {
    return NextResponse.json(
      {
        success: false,
        error:
          mappingError.message,
      },
      {
        status: 500,
      }
    );
  }

  const mappings =
    (
      mappingData ??
      []
    ) as Mapping[];

  /*
   * Plan 기간 안의 CLOSED Month
   */
  const {
    data: closes,
    error: closeError,
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
      .gte(
        "year_month",
        plan.start_month
      )
      .lte(
        "year_month",
        plan.end_month
      )
      .order(
        "year_month",
        {
          ascending: true,
        }
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

  const closeIds =
    (
      closes ??
      []
    ).map(
      (close) =>
        close.id
    );

  if (
    closeIds.length === 0
  ) {
    return NextResponse.json({
      success: true,
      actuals: {},
      closedMonths: [],
    });
  }

  /*
   * Snapshot
   */
  const {
    data: snapshotData,
    error:
      snapshotError,
  } =
    await supabaseAdmin
      .from(
        "monthly_actual_snapshots"
      )
      .select(
        `
        id,
        year_month,
        source_type,
        transaction_type,
        category_l1,
        category_l2,
        amount_sum,
        net_amount_sum
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

  const snapshots =
    (
      snapshotData ??
      []
    ) as Snapshot[];

  /*
   * 결과:
   *
   * {
   *   planRowId: {
   *      "2026-08-01": 350000
   *   }
   * }
   */
  const actuals:
    Record<
      string,
      Record<
        string,
        number
      >
    > = {};

  for (
    const row
    of rows ?? []
  ) {
    const rowMappings =
      mappings.filter(
        (mapping) =>
          mapping.plan_row_id ===
          row.id
      );

    actuals[row.id] =
      {};

    if (
      rowMappings.length ===
      0
    ) {
      continue;
    }

    for (
      const snapshot
      of snapshots
    ) {
      const matchedMappings =
        rowMappings
          .filter(
            (mapping) =>
              mappingMatches(
                mapping,
                snapshot
              )
          )
          .sort(
            (
              left,
              right
            ) =>
              mappingSpecificity(
                right
              ) -
              mappingSpecificity(
                left
              )
          );

      const mapping =
        matchedMappings[0];

      if (!mapping) {
        continue;
      }

      const value =
        calculateAmount(
          mapping,
          snapshot
        );

      actuals[row.id][
        snapshot.year_month
      ] =
        (
          actuals[row.id][
            snapshot.year_month
          ] ??
          0
        ) + value;
    }
  }

  return NextResponse.json({
    success: true,

    actuals,

    closedMonths:
      (closes ?? []).map(
        (close) =>
          close.year_month
      ),
  });
}