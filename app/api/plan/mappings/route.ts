import { auth } from "@/auth";

import {
  supabaseAdmin,
} from "@/lib/supabase/admin";

import {
  NextRequest,
  NextResponse,
} from "next/server";

const VALID_TRANSACTION_TYPES =
  new Set([
    "EXPENSE",
    "INCOME",
    "CARD_SETTLEMENT",
    "DEBT_PAYMENT",
    "INVESTMENT_TRANSFER",
    "INTERNAL_TRANSFER",
    "REFUND",
    "REIMBURSEMENT",
    "OTHER",
  ]);

const VALID_SOURCE_TYPES =
  new Set([
    "BANK",
    "CARD",
  ]);

const VALID_AMOUNT_BASIS =
  new Set([
    "SIGNED_AMOUNT",
    "ABS_AMOUNT",
    "ABS_NET",
  ]);

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

function nullableText(
  value: unknown
) {
  const text =
    String(
      value ?? ""
    ).trim();

  return text || null;
}

/*
 * =========================================================
 * GET
 *
 * Plan 행 + 기존 Mapping + Actual에서 사용 가능한 분류
 * =========================================================
 */
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

  const requestedPlanId =
    request.nextUrl
      .searchParams
      .get("planId");

  /*
   * Plan 목록
   */
  const {
    data: plans,
    error: plansError,
  } =
    await supabaseAdmin
      .from(
        "financial_plan_versions"
      )
      .select(
        `
        id,
        plan_name,
        start_month,
        end_month,
        is_active
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (plansError) {
    return NextResponse.json(
      {
        success: false,
        error:
          plansError.message,
      },
      {
        status: 500,
      }
    );
  }

  const planList =
    plans ?? [];

  const selectedPlan =
    (
      requestedPlanId
        ? planList.find(
            (plan) =>
              plan.id ===
              requestedPlanId
          )
        : null
    ) ??
    planList.find(
      (plan) =>
        plan.is_active
    ) ??
    planList[0] ??
    null;

  if (!selectedPlan) {
    return NextResponse.json({
      success: true,
      plans: [],
      selectedPlan: null,
      rows: [],
      mappings: [],
      dimensions: [],
    });
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
        row_name,
        sort_order
        `
      )
      .eq(
        "plan_version_id",
        selectedPlan.id
      )
      .eq(
        "is_active",
        true
      )
      .order(
        "sort_order",
        {
          ascending: true,
        }
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
      (row) => row.id
    );

  /*
   * 기존 Mapping
   */
  let mappings: unknown[] =
    [];

  if (rowIds.length > 0) {
    const {
      data,
      error,
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
          multiplier,
          is_active
          `
        )
        .eq(
          "user_id",
          user.id
        )
        .in(
          "plan_row_id",
          rowIds
        )
        .eq(
          "is_active",
          true
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

    mappings =
      data ?? [];
  }

  /*
   * CLOSED 월 조회
   */
  const {
    data: closedMonths,
    error:
      closedMonthsError,
  } =
    await supabaseAdmin
      .from(
        "monthly_closes"
      )
      .select("id")
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "status",
        "CLOSED"
      );

  if (closedMonthsError) {
    return NextResponse.json(
      {
        success: false,
        error:
          closedMonthsError.message,
      },
      {
        status: 500,
      }
    );
  }

  const closeIds =
    (
      closedMonths ??
      []
    ).map(
      (close) => close.id
    );

  /*
   * Actual Snapshot에 실제 존재하는
   * 분류 조합을 불러온다.
   */
  let dimensions: {
    source_type: string;
    transaction_type: string;
    category_l1:
      string | null;
    category_l2:
      string | null;
  }[] = [];

  if (closeIds.length > 0) {
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
          source_type,
          transaction_type,
          category_l1,
          category_l2
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

    const map =
      new Map<
        string,
        {
          source_type: string;
          transaction_type: string;
          category_l1:
            string | null;
          category_l2:
            string | null;
        }
      >();

    for (
      const row
      of data ?? []
    ) {
      const key = [
        row.source_type,
        row.transaction_type,
        row.category_l1 ?? "",
        row.category_l2 ?? "",
      ].join("|");

      map.set(
        key,
        row
      );
    }

    dimensions =
      Array.from(
        map.values()
      ).sort(
        (a, b) =>
          [
            a.transaction_type,
            a.category_l1 ?? "",
            a.category_l2 ?? "",
          ]
            .join("|")
            .localeCompare(
              [
                b.transaction_type,
                b.category_l1 ?? "",
                b.category_l2 ?? "",
              ].join("|"),
              "ko"
            )
      );
  }

  return NextResponse.json({
    success: true,

    plans:
      planList,

    selectedPlan,

    rows:
      rows ?? [],

    mappings,

    dimensions,
  });
}

/*
 * =========================================================
 * POST
 *
 * Mapping 추가
 * =========================================================
 */
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

  const planRowId =
    String(
      body.planRowId ??
        ""
    ).trim();

  const sourceType =
    nullableText(
      body.sourceType
    );

  const transactionType =
    String(
      body.transactionType ??
        ""
    ).trim();

  const categoryL1 =
    nullableText(
      body.categoryL1
    );

  const categoryL2 =
    nullableText(
      body.categoryL2
    );

  const amountBasis =
    String(
      body.amountBasis ??
        "ABS_AMOUNT"
    ).trim();

  const multiplier =
    Number(
      body.multiplier ??
        1
    );

  if (!planRowId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Plan 행을 선택해주세요.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    sourceType &&
    !VALID_SOURCE_TYPES.has(
      sourceType
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "자료 구분이 올바르지 않습니다.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    !VALID_TRANSACTION_TYPES.has(
      transactionType
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "거래유형이 올바르지 않습니다.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    !VALID_AMOUNT_BASIS.has(
      amountBasis
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "금액 적용 방식이 올바르지 않습니다.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    !Number.isFinite(
      multiplier
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "반영 배수가 올바르지 않습니다.",
      },
      {
        status: 400,
      }
    );
  }

  /*
   * 현재 사용자 Plan Row인지 확인
   */
  const {
    data: planRow,
    error: rowError,
  } =
    await supabaseAdmin
      .from(
        "financial_plan_rows"
      )
      .select(
        `
        id,
        financial_plan_versions!inner (
          user_id
        )
        `
      )
      .eq(
        "id",
        planRowId
      )
      .maybeSingle();

  if (rowError) {
    return NextResponse.json(
      {
        success: false,
        error:
          rowError.message,
      },
      {
        status: 500,
      }
    );
  }

  const planRelation =
    planRow
      ?.financial_plan_versions;

  const relation =
    Array.isArray(
      planRelation
    )
      ? planRelation[0]
      : planRelation;

  if (
    !planRow ||
    !relation ||
    relation.user_id !==
      user.id
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "해당 Plan 행을 찾을 수 없습니다.",
      },
      {
        status: 404,
      }
    );
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "financial_plan_actual_mappings"
      )
      .upsert(
        {
          user_id:
            user.id,

          plan_row_id:
            planRowId,

          source_type:
            sourceType,

          transaction_type:
            transactionType,

          category_l1:
            categoryL1,

          category_l2:
            categoryL2,

          amount_basis:
            amountBasis,

          multiplier,

          is_active:
            true,

          updated_at:
            new Date()
              .toISOString(),
        },
        {
          onConflict:
            "plan_row_id,source_type,transaction_type,category_l1,category_l2",
        }
      )
      .select()
      .single();

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

  return NextResponse.json({
    success: true,
    mapping: data,
  });
}

/*
 * =========================================================
 * DELETE
 * =========================================================
 */
export async function DELETE(
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

  const mappingId =
    request.nextUrl
      .searchParams
      .get("mappingId");

  if (!mappingId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "삭제할 Mapping이 없습니다.",
      },
      {
        status: 400,
      }
    );
  }

  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "financial_plan_actual_mappings"
      )
      .delete()
      .eq(
        "id",
        mappingId
      )
      .eq(
        "user_id",
        user.id
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

  return NextResponse.json({
    success: true,
  });
}