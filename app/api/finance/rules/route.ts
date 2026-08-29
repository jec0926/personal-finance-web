import { auth } from "@/auth";
import { normalizeRuleText } from "@/lib/finance/classification-rules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const SOURCES = new Set(["BANK", "CARD"]);
const FIELDS = new Set(["COUNTERPARTY", "DESCRIPTION"]);
const OPERATORS = new Set(["EXACT", "CONTAINS"]);
const TYPES = new Set(["EXPENSE", "INCOME", "CARD_SETTLEMENT", "DEBT_PAYMENT", "INVESTMENT_TRANSFER", "INTERNAL_TRANSFER", "REFUND", "REIMBURSEMENT", "OTHER"]);
const FIXED = new Set(["", "FIXED", "VARIABLE"]);
const ESSENTIAL = new Set(["", "ESSENTIAL", "OPTIONAL"]);

async function currentUserId() {
  const email = (await auth())?.user?.email?.trim().toLowerCase();
  if (!email) return null;
  const { data } = await supabaseAdmin.from("app_users").select("id").eq("email", email).maybeSingle();
  return data?.id ?? null;
}

function nullable(value: unknown) {
  const valueText = String(value ?? "").trim();
  return valueText || null;
}

export async function GET(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
  const search = request.nextUrl.searchParams.get("search")?.trim();
  let query = supabaseAdmin.from("classification_rules").select("id,source_type,match_field,match_operator,match_value,match_value_normalized,transaction_type,category_l1,category_l2,fixed_variable,essential_optional,priority,is_active,created_at,updated_at")
    .eq("user_id", userId);
  if (search) query = query.ilike("match_value", `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  const { data, error } = await query.order("is_active", { ascending: false }).order("priority").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, rules: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json();
  const id = String(body.id ?? "").trim();
  const sourceType = String(body.sourceType ?? "");
  const matchField = String(body.matchField ?? "");
  const matchOperator = String(body.matchOperator ?? "");
  const matchValue = String(body.matchValue ?? "").trim();
  const transactionType = String(body.transactionType ?? "");
  const fixedVariable = String(body.fixedVariable ?? "");
  const essentialOptional = String(body.essentialOptional ?? "");
  const priority = Number(body.priority ?? 100);
  if (!id || !SOURCES.has(sourceType) || !FIELDS.has(matchField) || !OPERATORS.has(matchOperator) || !matchValue || matchValue.length > 200 || !TYPES.has(transactionType) || !FIXED.has(fixedVariable) || !ESSENTIAL.has(essentialOptional) || !Number.isInteger(priority) || priority < 0 || typeof body.isActive !== "boolean") {
    return NextResponse.json({ success: false, error: "규칙 입력값을 확인해주세요." }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin.from("classification_rules").update({
    source_type: sourceType, match_field: matchField, match_operator: matchOperator,
    match_value: matchValue, match_value_normalized: normalizeRuleText(matchValue), transaction_type: transactionType,
    category_l1: nullable(body.categoryL1), category_l2: nullable(body.categoryL2),
    fixed_variable: nullable(fixedVariable), essential_optional: nullable(essentialOptional),
    priority, is_active: body.isActive, updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", userId).select("id").maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.code === "23505" ? "동일한 조건의 규칙이 이미 있습니다." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  if (!data) return NextResponse.json({ success: false, error: "규칙을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "규칙 ID가 필요합니다." }, { status: 400 });
  const { error } = await supabaseAdmin.from("classification_rules").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
