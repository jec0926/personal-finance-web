import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

async function getCurrentAppUser() {
  const session = await auth();

  if (!session?.user?.email) {
    return {
      error: "로그인이 필요합니다.",
      user: null,
    };
  }

  const email = session.user.email
    .trim()
    .toLowerCase();

  const { data: user, error } =
    await supabaseAdmin
      .from("app_users")
      .select("id, email")
      .eq("email", email)
      .single();

  if (error || !user) {
    return {
      error: "앱 사용자 정보를 찾을 수 없습니다.",
      user: null,
    };
  }

  return {
    error: null,
    user,
  };
}

//
// GET
// 현재 사용자의 모든 재무목표 조회
//
export async function GET() {
  const { user, error } =
    await getCurrentAppUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error,
      },
      { status: 401 }
    );
  }

  const { data, error: dbError } =
    await supabaseAdmin
      .from("financial_goals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", {
        ascending: false,
      });

  if (dbError) {
    return NextResponse.json(
      {
        success: false,
        error: dbError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    goals: data ?? [],
  });
}

//
// POST
// 새 재무목표 등록
//
export async function POST(
  request: NextRequest
) {
  const { user, error } =
    await getCurrentAppUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error,
      },
      { status: 401 }
    );
  }

  const body = await request.json();

  const goalName =
    String(body.goalName ?? "").trim();

  if (!goalName) {
    return NextResponse.json(
      {
        success: false,
        error: "목표명을 입력해주세요.",
      },
      { status: 400 }
    );
  }

  const targetAmount =
    body.targetAmount === "" ||
    body.targetAmount == null
      ? null
      : Number(body.targetAmount);

  const currentAmount =
    body.currentAmount === "" ||
    body.currentAmount == null
      ? 0
      : Number(body.currentAmount);

  if (
    targetAmount !== null &&
    (!Number.isFinite(targetAmount) ||
      targetAmount < 0)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "목표금액이 올바르지 않습니다.",
      },
      { status: 400 }
    );
  }

  if (
    !Number.isFinite(currentAmount) ||
    currentAmount < 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "현재금액이 올바르지 않습니다.",
      },
      { status: 400 }
    );
  }

  const { data, error: dbError } =
    await supabaseAdmin
      .from("financial_goals")
      .insert({
        user_id: user.id,
        goal_name: goalName,
        target_amount: targetAmount,
        current_amount: currentAmount,

        target_date:
          body.targetDate || null,

        priority:
          body.priority ?? "MEDIUM",

        status:
          body.status ?? "ACTIVE",

        note:
          String(body.note ?? "").trim() ||
          null,
      })
      .select()
      .single();

  if (dbError) {
    return NextResponse.json(
      {
        success: false,
        error: dbError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    goal: data,
  });
}

//
// PATCH
// 기존 재무목표 수정
//
export async function PATCH(
  request: NextRequest
) {
  const { user, error } =
    await getCurrentAppUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error,
      },
      { status: 401 }
    );
  }

  const body = await request.json();

  if (!body.id) {
    return NextResponse.json(
      {
        success: false,
        error: "목표 ID가 없습니다.",
      },
      { status: 400 }
    );
  }

  const goalName =
    String(body.goalName ?? "").trim();

  if (!goalName) {
    return NextResponse.json(
      {
        success: false,
        error: "목표명을 입력해주세요.",
      },
      { status: 400 }
    );
  }

  const targetAmount =
    body.targetAmount === "" ||
    body.targetAmount == null
      ? null
      : Number(body.targetAmount);

  const currentAmount =
    body.currentAmount === "" ||
    body.currentAmount == null
      ? 0
      : Number(body.currentAmount);

  const { data, error: dbError } =
    await supabaseAdmin
      .from("financial_goals")
      .update({
        goal_name: goalName,
        target_amount: targetAmount,
        current_amount: currentAmount,

        target_date:
          body.targetDate || null,

        priority:
          body.priority ?? "MEDIUM",

        status:
          body.status ?? "ACTIVE",

        note:
          String(body.note ?? "").trim() ||
          null,

        updated_at:
          new Date().toISOString(),
      })
      .eq("id", body.id)
      .eq("user_id", user.id)
      .select()
      .single();

  if (dbError) {
    return NextResponse.json(
      {
        success: false,
        error: dbError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    goal: data,
  });
}

//
// DELETE
// 목표 삭제
//
export async function DELETE(
  request: NextRequest
) {
  const { user, error } =
    await getCurrentAppUser();

  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error,
      },
      { status: 401 }
    );
  }

  const body = await request.json();

  if (!body.id) {
    return NextResponse.json(
      {
        success: false,
        error: "목표 ID가 없습니다.",
      },
      { status: 400 }
    );
  }

  const { error: dbError } =
    await supabaseAdmin
      .from("financial_goals")
      .delete()
      .eq("id", body.id)
      .eq("user_id", user.id);

  if (dbError) {
    return NextResponse.json(
      {
        success: false,
        error: dbError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
  });
}