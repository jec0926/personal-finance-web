import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

async function getCurrentAppUser() {
  const session = await auth();

  if (!session?.user?.email) {
    return null;
  }

  const email = session.user.email.trim().toLowerCase();

  const { data: user, error } = await supabaseAdmin
    .from("app_users")
    .select("id, email")
    .eq("email", email)
    .single();

  if (error || !user) {
    return null;
  }

  return user;
}

function monthToDate(yearMonth: string) {
  return `${yearMonth}-01`;
}

function addMonths(yearMonth: string, months: number) {
  const [year, month] = yearMonth.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1 + months, 1)
  );

  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
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

  const requestedPlanId =
    request.nextUrl.searchParams.get("planId");

  //
  // Plan 목록
  //
  const { data: plans, error: plansError } =
    await supabaseAdmin
      .from("financial_plan_versions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", {
        ascending: false,
      });

  if (plansError) {
    return NextResponse.json(
      {
        success: false,
        error: plansError.message,
      },
      { status: 500 }
    );
  }

  const planList = plans ?? [];

  if (planList.length === 0) {
    return NextResponse.json({
      success: true,
      plans: [],
      selectedPlan: null,
      rows: [],
    });
  }

  //
  // 조회할 Plan 선택
  //
  let selectedPlan =
    requestedPlanId
      ? planList.find(
          (plan) => plan.id === requestedPlanId
        )
      : undefined;

  if (!selectedPlan) {
    selectedPlan =
      planList.find((plan) => plan.is_active) ??
      planList[0];
  }

  //
  // Plan 행 조회
  //
  const { data: rows, error: rowsError } =
    await supabaseAdmin
      .from("financial_plan_rows")
      .select("*")
      .eq(
        "plan_version_id",
        selectedPlan.id
      )
      .eq("is_active", true)
      .order("sort_order", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
      });

  if (rowsError) {
    return NextResponse.json(
      {
        success: false,
        error: rowsError.message,
      },
      { status: 500 }
    );
  }

  const rowList = rows ?? [];
  const rowIds = rowList.map((row) => row.id);

  let values: any[] = [];

  if (rowIds.length > 0) {
    const {
      data: valueData,
      error: valuesError,
    } = await supabaseAdmin
      .from("financial_plan_values")
      .select(
        "id, plan_row_id, year_month, amount"
      )
      .in("plan_row_id", rowIds)
      .order("year_month", {
        ascending: true,
      });

    if (valuesError) {
      return NextResponse.json(
        {
          success: false,
          error: valuesError.message,
        },
        { status: 500 }
      );
    }

    values = valueData ?? [];
  }

  //
  // 행별 월 금액 묶기
  //
  const rowsWithValues = rowList.map(
    (row) => {
      const rowValues: Record<
        string,
        number
      > = {};

      values
        .filter(
          (value) =>
            value.plan_row_id === row.id
        )
        .forEach((value) => {
          rowValues[value.year_month] =
            Number(value.amount);
        });

      return {
        ...row,
        values: rowValues,
      };
    }
  );

  return NextResponse.json({
    success: true,
    plans: planList,
    selectedPlan,
    rows: rowsWithValues,
  });
}

//
// 새 Plan 생성
//
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

  const planName = String(
    body.planName ?? ""
  ).trim();

  const startMonth = String(
    body.startMonth ?? ""
  ).trim();

  if (!planName) {
    return NextResponse.json(
      {
        success: false,
        error: "Plan 이름을 입력해주세요.",
      },
      { status: 400 }
    );
  }

  if (
    !/^\d{4}-\d{2}$/.test(startMonth)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "시작월 형식이 올바르지 않습니다.",
      },
      { status: 400 }
    );
  }

  const startDate =
    monthToDate(startMonth);

  //
  // 시작월 포함 36개월
  //
  const endDate = addMonths(
    startMonth,
    35
  );

  //
  // 기존 Plan은 비활성화
  //
  await supabaseAdmin
    .from("financial_plan_versions")
    .update({
      is_active: false,
      updated_at:
        new Date().toISOString(),
    })
    .eq("user_id", user.id);

  const { data: plan, error } =
    await supabaseAdmin
      .from("financial_plan_versions")
      .insert({
        user_id: user.id,
        plan_name: planName,
        start_month: startDate,
        end_month: endDate,
        is_active: true,
      })
      .select()
      .single();

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
    plan,
  });
}

//
// Plan 이름 / 활성상태 수정
//
export async function PATCH(
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

  const planId = String(
    body.id ?? ""
  );

  if (!planId) {
    return NextResponse.json(
      {
        success: false,
        error: "Plan ID가 없습니다.",
      },
      { status: 400 }
    );
  }

  if (body.isActive === true) {
    await supabaseAdmin
      .from("financial_plan_versions")
      .update({
        is_active: false,
      })
      .eq("user_id", user.id);
  }

  const updateData: Record<
    string,
    unknown
  > = {
    updated_at:
      new Date().toISOString(),
  };

  if (body.planName != null) {
    updateData.plan_name = String(
      body.planName
    ).trim();
  }

  if (body.isActive != null) {
    updateData.is_active =
      Boolean(body.isActive);
  }

  const { data, error } =
    await supabaseAdmin
      .from("financial_plan_versions")
      .update(updateData)
      .eq("id", planId)
      .eq("user_id", user.id)
      .select()
      .single();

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
    plan: data,
  });
}