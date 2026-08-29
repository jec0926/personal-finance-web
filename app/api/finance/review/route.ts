import { auth } from "@/auth";

import {
  supabaseAdmin,
} from "@/lib/supabase/admin";

import {
  NextRequest,
  NextResponse,
} from "next/server";

type MatchField =
  | "COUNTERPARTY"
  | "DESCRIPTION";

type MatchOperator =
  | "EXACT"
  | "CONTAINS";

type ClassificationRule = {
  id: string;

  source_type:
    | "BANK"
    | "CARD";

  match_field:
    MatchField;

  match_operator:
    MatchOperator;

  match_value: string;

  match_value_normalized:
    string;

  transaction_type: string;

  category_l1:
    string | null;

  category_l2:
    string | null;

  fixed_variable:
    string | null;

  essential_optional:
    string | null;

  priority: number;

  is_active: boolean;
};

type MatchableTransaction = {
  id: string;

  source_type:
    | "BANK"
    | "CARD";

  counterparty:
    string | null;

  description:
    string | null;

  transaction_type:
    string;
};

/*
 * =========================================================
 * 사용자
 * =========================================================
 */

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

/*
 * =========================================================
 * Utility
 * =========================================================
 */

function normalizeText(
  value:
    | string
    | null
    | undefined
) {
  return (
    value ?? ""
  )
    .trim()
    .replace(
      /\s+/g,
      " "
    )
    .toLowerCase();
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

  return new Date(
    Date.UTC(
      year,
      month,
      1
    )
  )
    .toISOString()
    .slice(0, 10);
}

function getTransactionFieldValue(
  transaction:
    MatchableTransaction,
  field:
    MatchField
) {
  if (
    field ===
    "COUNTERPARTY"
  ) {
    return transaction.counterparty;
  }

  return transaction.description;
}

function matchesRule(
  transaction:
    MatchableTransaction,
  rule:
    ClassificationRule
) {
  if (
    transaction.source_type !==
    rule.source_type
  ) {
    return false;
  }

  const sourceValue =
    normalizeText(
      getTransactionFieldValue(
        transaction,
        rule.match_field
      )
    );

  const ruleValue =
    rule.match_value_normalized ||
    normalizeText(
      rule.match_value
    );

  if (
    !sourceValue ||
    !ruleValue
  ) {
    return false;
  }

  if (
    rule.match_operator ===
    "EXACT"
  ) {
    return (
      sourceValue ===
      ruleValue
    );
  }

  return sourceValue.includes(
    ruleValue
  );
}

/*
 * 여러 규칙이 동시에 일치할 경우
 *
 * 1. priority 작은 값
 * 2. EXACT
 * 3. 더 구체적인 긴 문자열
 */
function sortRules(
  left:
    ClassificationRule,
  right:
    ClassificationRule
) {
  if (
    left.priority !==
    right.priority
  ) {
    return (
      left.priority -
      right.priority
    );
  }

  if (
    left.match_operator !==
    right.match_operator
  ) {
    return left.match_operator ===
      "EXACT"
      ? -1
      : 1;
  }

  return (
    right
      .match_value_normalized
      .length -
    left
      .match_value_normalized
      .length
  );
}

/*
 * =========================================================
 * Review Queue 조회
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

  const month =
    request.nextUrl
      .searchParams
      .get("month");

  /*
   * ---------------------------------------------------------
   * 화면에 표시할 Review Queue
   * ---------------------------------------------------------
   */

  let queueQuery =
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
        review_required,
        source_row,
        created_at
        `,
        {
          count: "exact",
        }
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "include_in_ledger",
        true
      )
      .eq(
        "review_required",
        true
      );

  if (
    month &&
    /^\d{4}-\d{2}$/.test(
      month
    )
  ) {
    queueQuery =
      queueQuery
        .gte(
          "transaction_date",
          `${month}-01`
        )
        .lt(
          "transaction_date",
          getNextMonth(
            month
          )
        );
  }

  const {
    data:
      queueTransactions,
    error:
      queueError,
    count:
      reviewCount,
  } =
    await queueQuery
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
      .limit(500);

  if (queueError) {
    return NextResponse.json(
      {
        success: false,
        error:
          queueError.message,
      },
      {
        status: 500,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * 현재 DB 전체의 미분류 거래
   *
   * FUTURE 선택 시 "현재 몇 건에 적용되는지"
   * 화면에서 실시간 계산하기 위해 제공.
   * ---------------------------------------------------------
   */

  const {
    data:
      reviewPool,
    error:
      poolError,
  } =
    await supabaseAdmin
      .from("transactions")
      .select(
        `
        id,
        source_type,
        counterparty,
        description,
        transaction_type
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "include_in_ledger",
        true
      )
      .eq(
        "review_required",
        true
      )
      .limit(5000);

  if (poolError) {
    return NextResponse.json(
      {
        success: false,
        error:
          poolError.message,
      },
      {
        status: 500,
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * 기존 FUTURE 규칙
   * ---------------------------------------------------------
   */

  const {
    data:
      rules,
    error:
      rulesError,
  } =
    await supabaseAdmin
      .from(
        "classification_rules"
      )
      .select(
        `
        id,
        source_type,
        match_field,
        match_operator,
        match_value,
        match_value_normalized,
        transaction_type,
        category_l1,
        category_l2,
        fixed_variable,
        essential_optional,
        priority,
        is_active
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
      .order(
        "priority",
        {
          ascending: true,
        }
      );

  if (rulesError) {
    return NextResponse.json(
      {
        success: false,
        error:
          rulesError.message,
      },
      {
        status: 500,
      }
    );
  }

  const activeRules =
    (
      rules ??
      []
    ) as ClassificationRule[];

  /*
   * ---------------------------------------------------------
   * 각 Review 거래에 이미 일치하는 규칙이
   * 존재하는지 확인.
   * ---------------------------------------------------------
   */

  const transactionsWithRule =
    (
      queueTransactions ??
      []
    ).map(
      (
        transaction
      ) => {
        const matchedRule =
          activeRules
            .filter(
              (rule) =>
                matchesRule(
                  transaction,
                  rule
                )
            )
            .sort(
              sortRules
            )[0] ??
          null;

        return {
          ...transaction,

          existingRule:
            matchedRule,
        };
      }
    );

  return NextResponse.json({
    success: true,

    reviewCount:
      reviewCount ?? 0,

    transactions:
      transactionsWithRule,

    /*
     * UI에서 실시간 적용건수 계산용
     */
    matchPool:
      reviewPool ?? [],
  });
}