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

type ReviewTransaction = {
  id: string;

  transaction_id:
    string;

  source_type:
    | "BANK"
    | "CARD";

  counterparty:
    string | null;

  description:
    string | null;

  transaction_type:
    string;

  category_l1:
    string | null;

  category_l2:
    string | null;

  fixed_variable:
    string | null;

  essential_optional:
    string | null;

  review_required:
    boolean;
};

/*
 * =========================================================
 * Validation Constants
 * =========================================================
 */

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

const VALID_FIXED_VARIABLE =
  new Set([
    "FIXED",
    "VARIABLE",
  ]);

const VALID_ESSENTIAL_OPTIONAL =
  new Set([
    "ESSENTIAL",
    "OPTIONAL",
  ]);

const VALID_SCOPE =
  new Set([
    "THIS_ONLY",
    "FUTURE",
  ]);

const VALID_MATCH_FIELDS =
  new Set([
    "COUNTERPARTY",
    "DESCRIPTION",
  ]);

const VALID_MATCH_OPERATORS =
  new Set([
    "EXACT",
    "CONTAINS",
  ]);

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

function nullableText(
  value: unknown
) {
  const text =
    String(
      value ?? ""
    ).trim();

  return text || null;
}

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

function getFieldValue(
  transaction:
    ReviewTransaction,
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

function matchesValue(
  transaction:
    ReviewTransaction,
  field:
    MatchField,
  operator:
    MatchOperator,
  normalizedValue:
    string
) {
  const sourceValue =
    normalizeText(
      getFieldValue(
        transaction,
        field
      )
    );

  if (
    !sourceValue ||
    !normalizedValue
  ) {
    return false;
  }

  if (
    operator ===
    "EXACT"
  ) {
    return (
      sourceValue ===
      normalizedValue
    );
  }

  return sourceValue.includes(
    normalizedValue
  );
}

/*
 * ---------------------------------------------------------
 * Override History 저장
 *
 * 실패해도 실제 거래 확정 자체를 롤백하지는 않는다.
 * ---------------------------------------------------------
 */

async function saveOverrideHistory(
  userId: string,
  transactions:
    ReviewTransaction[],
  scope:
    "THIS_ONLY"
    | "FUTURE",
  after: {
    transactionType: string;

    categoryL1:
      string | null;

    categoryL2:
      string | null;

    fixedVariable:
      string | null;

    essentialOptional:
      string | null;
  }
) {
  if (
    transactions.length ===
    0
  ) {
    return;
  }

  const payload =
    transactions.map(
      (
        transaction
      ) => ({
        user_id:
          userId,

        transaction_record_id:
          transaction.id,

        transaction_id:
          transaction.transaction_id,

        scope,

        before_transaction_type:
          transaction.transaction_type,

        before_category_l1:
          transaction.category_l1,

        before_category_l2:
          transaction.category_l2,

        before_fixed_variable:
          transaction.fixed_variable,

        before_essential_optional:
          transaction.essential_optional,

        after_transaction_type:
          after.transactionType,

        after_category_l1:
          after.categoryL1,

        after_category_l2:
          after.categoryL2,

        after_fixed_variable:
          after.fixedVariable,

        after_essential_optional:
          after.essentialOptional,
      })
    );

  const CHUNK_SIZE =
    500;

  for (
    let start = 0;
    start <
    payload.length;
    start +=
    CHUNK_SIZE
  ) {
    const chunk =
      payload.slice(
        start,
        start +
          CHUNK_SIZE
      );

    const {
      error,
    } =
      await supabaseAdmin
        .from(
          "transaction_overrides"
        )
        .insert(
          chunk
        );

    if (error) {
      console.error(
        "Override history insert failed:",
        error
      );
    }
  }
}

/*
 * =========================================================
 * 거래 확정
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

  const transactionRecordId =
    String(
      body.transactionId ??
        ""
    ).trim();

  const transactionType =
    String(
      body.transactionType ??
        ""
    ).trim();

  const scope =
    String(
      body.scope ??
        "THIS_ONLY"
    ).trim();

  const categoryL1 =
    nullableText(
      body.categoryL1
    );

  const categoryL2 =
    nullableText(
      body.categoryL2
    );

  const fixedVariable =
    nullableText(
      body.fixedVariable
    );

  const essentialOptional =
    nullableText(
      body.essentialOptional
    );

  const matchField =
    String(
      body.matchField ??
        ""
    ) as MatchField;

  const matchOperator =
    String(
      body.matchOperator ??
        ""
    ) as MatchOperator;

  const matchValue =
    nullableText(
      body.matchValue
    );

  const existingRuleId =
    nullableText(
      body.existingRuleId
    );

  const allowResolved = body.allowResolved === true;

  /*
   * =========================================================
   * Validation
   * =========================================================
   */

  if (!transactionRecordId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "거래 ID가 없습니다.",
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
    !VALID_SCOPE.has(
      scope
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "적용범위가 올바르지 않습니다.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    fixedVariable &&
    !VALID_FIXED_VARIABLE.has(
      fixedVariable
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "고정/변동 구분이 올바르지 않습니다.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    essentialOptional &&
    !VALID_ESSENTIAL_OPTIONAL.has(
      essentialOptional
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "필수/선택 구분이 올바르지 않습니다.",
      },
      {
        status: 400,
      }
    );
  }

  /*
   * =========================================================
   * 현재 거래 조회
   * =========================================================
   */

  const {
    data:
      selectedTransaction,
    error:
      transactionError,
  } =
    await supabaseAdmin
      .from("transactions")
      .select(
        `
        id,
        transaction_id,
        source_type,
        counterparty,
        description,
        transaction_type,
        category_l1,
        category_l2,
        fixed_variable,
        essential_optional,
        review_required
        `
      )
      .eq(
        "id",
        transactionRecordId
      )
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

  if (
    transactionError
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          transactionError.message,
      },
      {
        status: 500,
      }
    );
  }

  if (
    !selectedTransaction
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "해당 거래를 찾을 수 없습니다.",
      },
      {
        status: 404,
      }
    );
  }

  if (!selectedTransaction.review_required && !allowResolved) {
    return NextResponse.json(
      {
        success: false,
        error:
          "이미 분류가 완료된 거래입니다. 화면을 새로고침해주세요.",
      },
      {
        status: 409,
      }
    );
  }

  const selected =
    selectedTransaction as ReviewTransaction;

  /*
   * =========================================================
   * THIS_ONLY
   * =========================================================
   */

  if (
    scope ===
    "THIS_ONLY"
  ) {
    const {
      error:
        updateError,
    } =
      await supabaseAdmin
        .from("transactions")
        .update({
          transaction_type:
            transactionType,

          category_l1:
            categoryL1,

          category_l2:
            categoryL2,

          fixed_variable:
            fixedVariable,

          essential_optional:
            essentialOptional,

          review_required:
            false,

          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          selected.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error:
            updateError.message,
        },
        {
          status: 500,
        }
      );
    }

    await saveOverrideHistory(
      user.id,
      [selected],
      "THIS_ONLY",
      {
        transactionType,
        categoryL1,
        categoryL2,
        fixedVariable,
        essentialOptional,
      }
    );

    return NextResponse.json({
      success: true,

      scope:
        "THIS_ONLY",

      resolvedCount:
        1,

      ruleSaved:
        false,
    });
  }

  /*
   * =========================================================
   * FUTURE Validation
   * =========================================================
   */

  if (
    !VALID_MATCH_FIELDS.has(
      matchField
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "자동분류 기준 필드가 올바르지 않습니다.",
      },
      {
        status: 400,
      }
    );
  }

  if (
    !VALID_MATCH_OPERATORS.has(
      matchOperator
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "자동분류 일치 방식이 올바르지 않습니다.",
      },
      {
        status: 400,
      }
    );
  }

  if (!matchValue) {
    return NextResponse.json(
      {
        success: false,
        error:
          "자동분류 기준 문구를 입력해주세요.",
      },
      {
        status: 400,
      }
    );
  }

  const normalizedMatchValue =
    normalizeText(
      matchValue
    );

  /*
   * 사용자가 입력한 규칙이
   * 현재 선택 거래 자체와도 일치해야 한다.
   *
   * 오타 등으로 엉뚱한 규칙 생성 방지.
   */
  if (
    !matchesValue(
      selected,
      matchField,
      matchOperator,
      normalizedMatchValue
    )
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          "입력한 자동분류 기준이 현재 거래와 일치하지 않습니다. 기준 필드 또는 문구를 확인해주세요.",
      },
      {
        status: 400,
      }
    );
  }

  /*
   * =========================================================
   * FUTURE Rule 저장
   * =========================================================
   */

  const {
    data:
      savedRule,
    error:
      ruleError,
  } =
    await supabaseAdmin
      .from(
        "classification_rules"
      )
      .upsert(
        {
          user_id:
            user.id,

          source_type:
            selected.source_type,

          match_field:
            matchField,

          match_operator:
            matchOperator,

          match_value:
            matchValue,

          match_value_normalized:
            normalizedMatchValue,

          transaction_type:
            transactionType,

          category_l1:
            categoryL1,

          category_l2:
            categoryL2,

          fixed_variable:
            fixedVariable,

          essential_optional:
            essentialOptional,

          priority:
            100,

          is_active:
            true,

          updated_at:
            new Date()
              .toISOString(),
        },
        {
          onConflict:
            "user_id,source_type,match_field,match_operator,match_value_normalized",
        }
      )
      .select("id")
      .single();

  if (
    ruleError ||
    !savedRule
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          ruleError?.message ??
          "자동분류 규칙을 저장하지 못했습니다.",
      },
      {
        status: 500,
      }
    );
  }

  /*
   * 기존에 일치했던 규칙을 화면에서 불러온 뒤
   * 사용자가 기준 필드/문구를 수정했다면,
   *
   * 새 규칙을 저장한 뒤 이전 규칙은 비활성화.
   *
   * 동일 Rule ID라면 아무 것도 하지 않는다.
   */
  let replacedOldRule =
    false;

  if (
    existingRuleId &&
    existingRuleId !==
      savedRule.id
  ) {
    const {
      error:
        oldRuleError,
    } =
      await supabaseAdmin
        .from(
          "classification_rules"
        )
        .update({
          is_active:
            false,

          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          existingRuleId
        )
        .eq(
          "user_id",
          user.id
        );

    if (oldRuleError) {
      console.error(
        "Old classification rule deactivate failed:",
        oldRuleError
      );
    } else {
      replacedOldRule =
        true;
    }
  }

  /*
   * =========================================================
   * 현재 DB의 미분류 거래 조회
   * =========================================================
   */

  const {
    data:
      reviewTransactions,
    error:
      reviewTransactionsError,
  } =
    await supabaseAdmin
      .from("transactions")
      .select(
        `
        id,
        transaction_id,
        source_type,
        counterparty,
        description,
        transaction_type,
        category_l1,
        category_l2,
        fixed_variable,
        essential_optional,
        review_required
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "source_type",
        selected.source_type
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

  if (
    reviewTransactionsError
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          `규칙은 저장했지만 기존 미분류 거래 조회에 실패했습니다: ${reviewTransactionsError.message}`,
      },
      {
        status: 500,
      }
    );
  }

  const candidates =
    (
      reviewTransactions ??
      []
    ) as ReviewTransaction[];

  /*
   * 현재 선택 거래는 무조건 포함.
   *
   * 그 외 거래는
   * - FUTURE 조건 일치
   * - REFUND가 아님
   *
   * 인 경우 일괄 적용.
   */
  const targetTransactions =
    candidates.filter(
      (
        transaction
      ) => {
        if (
          transaction.id ===
          selected.id
        ) {
          return true;
        }

        /*
         * 기존 지출 규칙이 승인취소/환불을
         * EXPENSE로 덮는 것을 방지.
         */
        if (
          transaction.transaction_type ===
          "REFUND"
        ) {
          return false;
        }

        return matchesValue(
          transaction,
          matchField,
          matchOperator,
          normalizedMatchValue
        );
      }
    );

  /*
   * 혹시 조회 제한/경합 등으로
   * 선택 거래가 대상에서 빠지는 상황 방지.
   */
  if (
    !targetTransactions.some(
      (
        transaction
      ) =>
        transaction.id ===
        selected.id
    )
  ) {
    targetTransactions.unshift(
      selected
    );
  }

  const targetIds =
    Array.from(
      new Set(
        targetTransactions.map(
          (
            transaction
          ) =>
            transaction.id
        )
      )
    );

  /*
   * =========================================================
   * 기존 미분류 거래 일괄 Update
   * =========================================================
   */

  const CHUNK_SIZE =
    500;

  for (
    let start = 0;
    start <
    targetIds.length;
    start +=
    CHUNK_SIZE
  ) {
    const chunk =
      targetIds.slice(
        start,
        start +
          CHUNK_SIZE
      );

    const {
      error:
        bulkUpdateError,
    } =
      await supabaseAdmin
        .from("transactions")
        .update({
          transaction_type:
            transactionType,

          category_l1:
            categoryL1,

          category_l2:
            categoryL2,

          fixed_variable:
            fixedVariable,

          essential_optional:
            essentialOptional,

          review_required:
            false,

          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "user_id",
          user.id
        )
        .in(
          "id",
          chunk
        );

    if (bulkUpdateError) {
      return NextResponse.json(
        {
          success: false,

          error:
            `자동분류 규칙은 저장했지만 기존 거래 일괄 적용에 실패했습니다: ${bulkUpdateError.message}`,
        },
        {
          status: 500,
        }
      );
    }
  }

  /*
   * =========================================================
   * Override History
   * =========================================================
   */

  await saveOverrideHistory(
    user.id,
    targetTransactions,
    "FUTURE",
    {
      transactionType,
      categoryL1,
      categoryL2,
      fixedVariable,
      essentialOptional,
    }
  );

  return NextResponse.json({
    success: true,

    scope:
      "FUTURE",

    resolvedCount:
      targetIds.length,

    ruleSaved:
      true,

    ruleId:
      savedRule.id,

    replacedOldRule,
  });
}
