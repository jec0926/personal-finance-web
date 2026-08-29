import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

async function getCurrentAppUser() {
  const session = await auth();

  if (!session?.user?.email) {
    return null;
  }

  const email = session.user.email
    .trim()
    .toLowerCase();

  const { data } = await supabaseAdmin
    .from("app_users")
    .select("id")
    .eq("email", email)
    .single();

  return data ?? null;
}

export async function POST(
  request: NextRequest
) {
  const user = await getCurrentAppUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: "로그인이 필요합니다.",
      },
      { status: 401 }
    );
  }

  const body = await request.json();

  const planVersionId = String(
    body.planVersionId ?? ""
  );

  const values = Array.isArray(
    body.values
  )
    ? body.values
    : [];

  if (!planVersionId) {
    return NextResponse.json(
      {
        success: false,
        error: "Plan ID가 없습니다.",
      },
      { status: 400 }
    );
  }

  //
  // Plan 소유권 확인
  //
  const { data: plan } =
    await supabaseAdmin
      .from(
        "financial_plan_versions"
      )
      .select("id")
      .eq("id", planVersionId)
      .eq("user_id", user.id)
      .maybeSingle();

  if (!plan) {
    return NextResponse.json(
      {
        success: false,
        error:
          "접근할 수 없는 Plan입니다.",
      },
      { status: 403 }
    );
  }

  if (values.length === 0) {
    return NextResponse.json({
      success: true,
      savedCount: 0,
    });
  }

  if (values.length > 5000) {
    return NextResponse.json(
      {
        success: false,
        error:
          "한 번에 저장할 수 있는 셀이 너무 많습니다.",
      },
      { status: 400 }
    );
  }

  const rowIds = Array.from(
    new Set(
      values.map((value: any) =>
        String(value.rowId)
      )
    )
  );

  //
  // 모든 row가 해당 Plan 소속인지 검증
  //
  const { data: allowedRows } =
    await supabaseAdmin
      .from("financial_plan_rows")
      .select("id")
      .eq(
        "plan_version_id",
        planVersionId
      )
      .in("id", rowIds);

  const allowedRowIds = new Set(
    (allowedRows ?? []).map(
      (row) => row.id
    )
  );

  const hasInvalidRow =
    rowIds.some(
      (id) =>
        !allowedRowIds.has(id)
    );

  if (hasInvalidRow) {
    return NextResponse.json(
      {
        success: false,
        error:
          "다른 Plan의 항목이 포함되어 있습니다.",
      },
      { status: 403 }
    );
  }

  const payload = values.map(
    (value: any) => {
      const amount = Number(
        value.amount ?? 0
      );

      if (!Number.isFinite(amount)) {
        throw new Error(
          "올바르지 않은 금액이 있습니다."
        );
      }

      return {
        plan_row_id:
          String(value.rowId),

        year_month:
          String(value.yearMonth),

        amount,

        updated_at:
          new Date().toISOString(),
      };
    }
  );

  try {
    const { error } =
      await supabaseAdmin
        .from(
          "financial_plan_values"
        )
        .upsert(payload, {
          onConflict:
            "plan_row_id,year_month",
        });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      savedCount:
        payload.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "저장 중 오류가 발생했습니다.",
      },
      { status: 400 }
    );
  }
}