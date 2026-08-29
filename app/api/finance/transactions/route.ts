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

  if (
    !session?.user?.email
  ) {
    return null;
  }

  const email =
    session.user.email
      .trim()
      .toLowerCase();

  const {
    data,
  } =
    await supabaseAdmin
      .from("app_users")
      .select("id")
      .eq("email", email)
      .single();

  return data ?? null;
}

function getNextMonth(
  yearMonth: string
) {
  const [
    year,
    month,
  ] =
    yearMonth
      .split("-")
      .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month,
        1
      )
    );

  return date
    .toISOString()
    .slice(0, 10);
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

  const params =
    request.nextUrl
      .searchParams;

  const month =
    params.get("month");

  const sourceType =
    params.get(
      "sourceType"
    );

  const transactionType =
    params.get(
      "transactionType"
    );

  const review =
    params.get("review");

  const search = params.get("search")?.trim();
  const categoryL1 = params.get("categoryL1")?.trim();
  const categoryL2 = params.get("categoryL2")?.trim();

  let query =
    supabaseAdmin
      .from("transactions")
      .select(
        `
        id,
        transaction_id,
        transaction_date,
        source_type,
        account_name,
        counterparty,
        description,
        transaction_type,
        category_l1,
        category_l2,
        fixed_variable,
        essential_optional,
        amount,
        gross_amount,
        benefit_amount,
        fee_amount,
        net_amount,
        original_amount,
        original_currency,
        exchange_rate,
        include_in_ledger,
        review_required,
        source_row,
        created_at
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "include_in_ledger",
        true
      );

  if (
    month &&
    /^\d{4}-\d{2}$/.test(
      month
    )
  ) {
    const start =
      `${month}-01`;

    const end =
      getNextMonth(
        month
      );

    query =
      query
        .gte(
          "transaction_date",
          start
        )
        .lt(
          "transaction_date",
          end
        );
  }

  if (
    sourceType === "BANK" ||
    sourceType === "CARD"
  ) {
    query =
      query.eq(
        "source_type",
        sourceType
      );
  }

  if (
    transactionType &&
    transactionType !==
      "ALL"
  ) {
    query =
      query.eq(
        "transaction_type",
        transactionType
      );
  }

  if (
    review === "true"
  ) {
    query =
      query.eq(
        "review_required",
        true
      );
  }

  if (categoryL1) query = query.eq("category_l1", categoryL1);
  if (categoryL2) query = query.eq("category_l2", categoryL2);

  if (search) {
    const escaped = search.replaceAll("%", "\\%").replaceAll("_", "\\_");
    query = query.or(`counterparty.ilike.%${escaped}%,description.ilike.%${escaped}%`);
  }

  const {
    data,
    error,
  } =
    await query
      .order(
        "transaction_date",
        {
          ascending: false,
        }
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(1000);

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }

  return NextResponse.json({
    success: true,
    transactions:
      data ?? [],
  });
}
