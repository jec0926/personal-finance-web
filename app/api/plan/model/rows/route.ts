import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const VALID_SECTIONS = [
  "INCOME",
  "LIVING_EXPENSE",
  "DEBT_PAYMENT",
  "INVESTMENT",
  "OTHER_ALLOCATION",
];

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

async function userOwnsPlan(
  planId: string,
  userId: string
) {
  const { data } = await supabaseAdmin
    .from("financial_plan_versions")
    .select("id")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
}

async function getRowForUser(
  rowId: string,
  userId: string
) {
  const { data: row } =
    await supabaseAdmin
      .from("financial_plan_rows")
      .select(
        "id, plan_version_id, section, row_name"
      )
      .eq("id", rowId)
      .maybeSingle();

  if (!row) {
    return null;
  }

  const ownsPlan = await userOwnsPlan(
    row.plan_version_id,
    userId
  );

  return ownsPlan ? row : null;
}

//
// 행 추가
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

  const planVersionId = String(
    body.planVersionId ?? ""
  );

  const section = String(
    body.section ?? ""
  );

  const rowName = String(
    body.rowName ?? ""
  ).trim();

  if (!planVersionId) {
    return NextResponse.json(
      {
        success: false,
        error: "Plan ID가 없습니다.",
      },
      { status: 400 }
    );
  }

  if (
    !VALID_SECTIONS.includes(section)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "잘못된 구분입니다.",
      },
      { status: 400 }
    );
  }

  if (!rowName) {
    return NextResponse.json(
      {
        success: false,
        error: "항목명을 입력해주세요.",
      },
      { status: 400 }
    );
  }

  const ownsPlan = await userOwnsPlan(
    planVersionId,
    user.id
  );

  if (!ownsPlan) {
    return NextResponse.json(
      {
        success: false,
        error:
          "접근할 수 없는 Plan입니다.",
      },
      { status: 403 }
    );
  }

  //
  // 현재 가장 마지막 순서 계산
  //
  const { data: existingRows } =
    await supabaseAdmin
      .from("financial_plan_rows")
      .select("sort_order")
      .eq(
        "plan_version_id",
        planVersionId
      )
      .order("sort_order", {
        ascending: false,
      })
      .limit(1);

  const nextSortOrder =
    existingRows &&
    existingRows.length > 0
      ? existingRows[0].sort_order + 10
      : 10;

  const { data, error } =
    await supabaseAdmin
      .from("financial_plan_rows")
      .insert({
        plan_version_id:
          planVersionId,

        section,
        row_name: rowName,

        sort_order:
          body.sortOrder ??
          nextSortOrder,

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
    row: data,
  });
}

//
// 행 수정
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

  const rowId = String(
    body.id ?? ""
  );

  if (!rowId) {
    return NextResponse.json(
      {
        success: false,
        error: "행 ID가 없습니다.",
      },
      { status: 400 }
    );
  }

  const existingRow =
    await getRowForUser(
      rowId,
      user.id
    );

  if (!existingRow) {
    return NextResponse.json(
      {
        success: false,
        error:
          "접근할 수 없는 항목입니다.",
      },
      { status: 403 }
    );
  }

  const updateData: Record<
    string,
    unknown
  > = {};

  if (body.rowName != null) {
    const rowName = String(
      body.rowName
    ).trim();

    if (!rowName) {
      return NextResponse.json(
        {
          success: false,
          error:
            "항목명을 입력해주세요.",
        },
        { status: 400 }
      );
    }

    updateData.row_name = rowName;
  }

  if (body.section != null) {
    const section = String(
      body.section
    );

    if (
      !VALID_SECTIONS.includes(
        section
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "잘못된 구분입니다.",
        },
        { status: 400 }
      );
    }

    updateData.section = section;
  }

  if (body.sortOrder != null) {
    updateData.sort_order =
      Number(body.sortOrder);
  }

  const { data, error } =
    await supabaseAdmin
      .from("financial_plan_rows")
      .update(updateData)
      .eq("id", rowId)
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
    row: data,
  });
}

//
// 행 삭제
//
export async function DELETE(
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

  const rowId = String(
    body.id ?? ""
  );

  if (!rowId) {
    return NextResponse.json(
      {
        success: false,
        error: "행 ID가 없습니다.",
      },
      { status: 400 }
    );
  }

  const existingRow =
    await getRowForUser(
      rowId,
      user.id
    );

  if (!existingRow) {
    return NextResponse.json(
      {
        success: false,
        error:
          "접근할 수 없는 항목입니다.",
      },
      { status: 403 }
    );
  }

  //
  // FK ON DELETE CASCADE이므로
  // 해당 행의 월별 값도 함께 삭제됨
  //
  const { error } =
    await supabaseAdmin
      .from("financial_plan_rows")
      .delete()
      .eq("id", rowId);

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
  });
}