import {
  EssentialOptional,
  FixedVariable,
  ParsedTransaction,
  SourceType,
  TransactionType,
} from "./types";

export type RuleMatchField =
  | "COUNTERPARTY"
  | "DESCRIPTION";

export type RuleMatchOperator =
  | "EXACT"
  | "CONTAINS";

export type StoredClassificationRule = {
  id: string;

  source_type: SourceType;

  match_field:
    RuleMatchField;

  match_operator:
    RuleMatchOperator;

  match_value: string;

  match_value_normalized:
    string;

  transaction_type:
    TransactionType;

  category_l1:
    string | null;

  category_l2:
    string | null;

  fixed_variable:
    FixedVariable;

  essential_optional:
    EssentialOptional;

  priority: number;

  is_active: boolean;
};

export type RuleApplicationResult = {
  transaction:
    ParsedTransaction;

  matchedRule:
    StoredClassificationRule | null;
};

/*
 * DB의 match_value_normalized와
 * 동일한 규칙으로 문자열을 정규화한다.
 */
export function normalizeRuleText(
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

/*
 * 규칙이 실제 거래와 일치하는지 판단.
 */
function matchesRule(
  transaction:
    ParsedTransaction,

  rule:
    StoredClassificationRule
) {
  if (
    transaction.sourceType !==
    rule.source_type
  ) {
    return false;
  }

  const sourceValue =
    rule.match_field ===
    "COUNTERPARTY"
      ? transaction.counterparty
      : transaction.description;

  const normalizedSource =
    normalizeRuleText(
      sourceValue
    );

  if (!normalizedSource) {
    return false;
  }

  const normalizedRule =
    rule.match_value_normalized ||
    normalizeRuleText(
      rule.match_value
    );

  if (!normalizedRule) {
    return false;
  }

  if (
    rule.match_operator ===
    "EXACT"
  ) {
    return (
      normalizedSource ===
      normalizedRule
    );
  }

  if (
    rule.match_operator ===
    "CONTAINS"
  ) {
    return normalizedSource.includes(
      normalizedRule
    );
  }

  return false;
}

/*
 * 여러 규칙이 동시에 일치할 경우의
 * 우선순위.
 *
 * 1. priority 숫자가 작은 규칙
 * 2. EXACT
 * 3. 더 긴 match_value
 *
 * 예:
 *
 * priority 10 > priority 100
 *
 * EXACT > CONTAINS
 *
 * "스타벅스 강남역점"
 * >
 * "스타벅스"
 */
function sortMatchedRules(
  left:
    StoredClassificationRule,
  right:
    StoredClassificationRule
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
    if (
      left.match_operator ===
      "EXACT"
    ) {
      return -1;
    }

    return 1;
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
 * 사용자 FUTURE 규칙 적용.
 */
export function applyClassificationRules(
  transaction:
    ParsedTransaction,

  rules:
    StoredClassificationRule[]
): RuleApplicationResult {
  /*
   * 환불은 같은 가맹점의 일반 소비 규칙이
   * EXPENSE로 덮어쓰지 않도록 보호한다.
   *
   * 예:
   * 스타벅스 소비 → FUTURE 식비
   * 이후 스타벅스 승인취소
   * → REFUND 유지
   */
  if (
    transaction.transactionType ===
    "REFUND"
  ) {
    return {
      transaction,
      matchedRule: null,
    };
  }

  const matchedRules =
    rules
      .filter(
        (rule) =>
          rule.is_active &&
          matchesRule(
            transaction,
            rule
          )
      )
      .sort(
        sortMatchedRules
      );

  const matchedRule =
    matchedRules[0];

  if (!matchedRule) {
    return {
      transaction,
      matchedRule: null,
    };
  }

  return {
    transaction: {
      ...transaction,

      transactionType:
        matchedRule.transaction_type,

      categoryL1:
        matchedRule.category_l1,

      categoryL2:
        matchedRule.category_l2,

      fixedVariable:
        matchedRule.fixed_variable,

      essentialOptional:
        matchedRule.essential_optional,

      /*
       * 사용자 규칙이 일치했다면
       * 사람이 이미 확정해둔 규칙이므로
       * Review Queue에 다시 보내지 않는다.
       */
      reviewRequired: false,
    },

    matchedRule,
  };
}