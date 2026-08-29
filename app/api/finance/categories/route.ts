import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

async function currentUserId() {
  const email = (await auth())?.user?.email?.trim().toLowerCase();
  if (!email) return null;
  const { data } = await supabaseAdmin.from("app_users").select("id").eq("email", email).maybeSingle();
  return data?.id ?? null;
}

function text(value: unknown) {
  const result = String(value ?? "").trim();
  return result || null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("finance_categories")
    .select("id,parent_id,name,sort_order,is_active,created_at,updated_at")
    .eq("user_id", userId).order("sort_order").order("name");
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, categories: data ?? [] });
}

export async function POST(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json();
  const name = text(body.name);
  const parentId = text(body.parentId);
  const sortOrder = Number(body.sortOrder ?? 100);
  if (!name || name.length > 80 || !Number.isInteger(sortOrder) || sortOrder < 0) {
    return NextResponse.json({ success: false, error: "카테고리 이름과 정렬순서를 확인해주세요." }, { status: 400 });
  }
  if (parentId) {
    const { data: parent } = await supabaseAdmin.from("finance_categories").select("id,parent_id")
      .eq("id", parentId).eq("user_id", userId).eq("is_active", true).maybeSingle();
    if (!parent || parent.parent_id) return NextResponse.json({ success: false, error: "활성 대분류를 선택해주세요." }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin.from("finance_categories").insert({
    user_id: userId, parent_id: parentId, name, sort_order: sortOrder, is_active: true,
  }).select("id,parent_id,name,sort_order,is_active").single();
  if (error) return NextResponse.json({ success: false, error: error.code === "23505" ? "같은 이름의 카테고리가 이미 있습니다." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ success: true, category: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json();
  const id = text(body.id);
  const name = text(body.name);
  const sortOrder = Number(body.sortOrder);
  if (!id || !name || name.length > 80 || !Number.isInteger(sortOrder) || sortOrder < 0 || typeof body.isActive !== "boolean") {
    return NextResponse.json({ success: false, error: "수정할 값을 확인해주세요." }, { status: 400 });
  }
  const { data: target } = await supabaseAdmin.from("finance_categories").select("id,parent_id")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (!target) return NextResponse.json({ success: false, error: "카테고리를 찾을 수 없습니다." }, { status: 404 });
  if (!body.isActive && !target.parent_id) {
    await supabaseAdmin.from("finance_categories").update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("parent_id", id).eq("user_id", userId);
  }
  const { data, error } = await supabaseAdmin.from("finance_categories").update({
    name, sort_order: sortOrder, is_active: body.isActive, updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", userId).select("id,parent_id,name,sort_order,is_active").single();
  if (error) return NextResponse.json({ success: false, error: error.code === "23505" ? "같은 이름의 카테고리가 이미 있습니다." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ success: true, category: data });
}
