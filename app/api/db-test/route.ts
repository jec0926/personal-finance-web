import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  // 1. Google 로그인 세션 확인
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json(
      {
        success: false,
        stage: "auth",
        error: "로그인이 필요합니다.",
      },
      { status: 401 }
    );
  }

  const email = session.user.email
    .trim()
    .toLowerCase();

  const displayName =
    session.user.name ?? null;

  // 2. 로그인 사용자를 DB에 저장
  // 이미 같은 이메일이 있으면 갱신
  const { data: user, error } =
    await supabaseAdmin
      .from("app_users")
      .upsert(
        {
          email,
          display_name: displayName,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "email",
        }
      )
      .select(
        "id, email, display_name, created_at, updated_at"
      )
      .single();

  if (error) {
    console.error(
      "Supabase DB Test Error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        stage: "database",
        error: error.message,
      },
      { status: 500 }
    );
  }

  // 3. 테스트 성공
  return NextResponse.json({
    success: true,
    database: "Supabase PostgreSQL",
    message:
      "Auth.js → Next.js → Supabase 저장 및 조회가 정상입니다.",

    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
  });
}