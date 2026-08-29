import {
  ClassificationResult,
  SourceType,
} from "./types";

type ClassifyInput = {
  sourceType: SourceType;

  amount: number;

  counterparty: string | null;
  description: string | null;

  transactionDate: string;
};

function normalize(
  value: string | null
) {
  return (
    value ?? ""
  )
    .trim()
    .toLowerCase();
}

export function classifyTransaction(
  input: ClassifyInput
): ClassificationResult {
  const text = normalize(
    [
      input.counterparty,
      input.description,
    ]
      .filter(Boolean)
      .join(" ")
  );

  /*
   * -----------------------------------------
   * 취소 / 환불
   * -----------------------------------------
   */
  if (
    text.includes("승인취소") ||
    text.includes("매입취소") ||
    text.includes("환불") ||
    text.includes("결제취소")
  ) {
    return {
      transactionType: "REFUND",

      categoryL1: null,
      categoryL2: null,

      fixedVariable: null,
      essentialOptional: null,

      reviewRequired: true,
    };
  }

  /*
   * -----------------------------------------
   * 도시가스
   * -----------------------------------------
   */
  if (text.includes("예스코")) {
    return {
      transactionType: "EXPENSE",

      categoryL1: "주거",
      categoryL2: "도시가스",

      fixedVariable: "VARIABLE",
      essentialOptional:
        "ESSENTIAL",

      reviewRequired: false,
    };
  }

  /*
   * -----------------------------------------
   * 통행료
   * -----------------------------------------
   */
  if (text.includes("통행료")) {
    return {
      transactionType: "EXPENSE",

      categoryL1: "교통",
      categoryL2: "통행료",

      fixedVariable: "VARIABLE",
      essentialOptional:
        "ESSENTIAL",

      reviewRequired: false,
    };
  }

  /*
   * -----------------------------------------
   * 전기요금
   * -----------------------------------------
   */
  if (
    text.includes("전기요금")
  ) {
    return {
      transactionType: "EXPENSE",

      categoryL1: "주거",
      categoryL2: "전기요금",

      fixedVariable: "VARIABLE",
      essentialOptional:
        "ESSENTIAL",

      reviewRequired: false,
    };
  }

  /*
   * -----------------------------------------
   * 휴대폰
   * -----------------------------------------
   */
  if (
    text.includes("kt통신요금")
  ) {
    return {
      transactionType: "EXPENSE",

      categoryL1: "통신",
      categoryL2: "휴대폰",

      fixedVariable: "FIXED",
      essentialOptional:
        "ESSENTIAL",

      reviewRequired: false,
    };
  }

  /*
   * -----------------------------------------
   * 월세
   * -----------------------------------------
   */
  if (
    input.amount < 0 &&
    text.includes("허영진")
  ) {
    return {
      transactionType: "EXPENSE",

      categoryL1: "주거",
      categoryL2: "월세",

      fixedVariable: "FIXED",
      essentialOptional:
        "ESSENTIAL",

      reviewRequired: false,
    };
  }

  /*
   * -----------------------------------------
   * 급여
   *
   * 회사 이름만으로는 급여 / 비용정산
   * 구분이 안 되므로 "급여" 표현이 있는
   * 경우에만 자동확정
   * -----------------------------------------
   */
  if (
    input.amount > 0 &&
    text.includes("투이컨설팅") &&
    (
      text.includes("급여") ||
      text.includes("월급")
    )
  ) {
    return {
      transactionType: "INCOME",

      categoryL1: "근로소득",
      categoryL2: "급여",

      fixedVariable: null,
      essentialOptional: null,

      reviewRequired: false,
    };
  }

  /*
   * -----------------------------------------
   * 회사 비용 정산
   * -----------------------------------------
   */
  if (
    input.amount > 0 &&
    text.includes("투이컨설팅") &&
    (
      text.includes("경비") ||
      text.includes("정산") ||
      text.includes("비용")
    )
  ) {
    return {
      transactionType:
        "REIMBURSEMENT",

      categoryL1: null,
      categoryL2: null,

      fixedVariable: null,
      essentialOptional: null,

      reviewRequired: false,
    };
  }

  /*
   * -----------------------------------------
   * 카드대금 납부
   * -----------------------------------------
   */
  if (
    input.sourceType === "BANK" &&
    input.amount < 0 &&
    (
      text.includes("카드대금") ||
      text.includes("카드결제") ||
      text.includes("신용카드")
    )
  ) {
    return {
      transactionType:
        "CARD_SETTLEMENT",

      categoryL1: null,
      categoryL2: null,

      fixedVariable: null,
      essentialOptional: null,

      reviewRequired: false,
    };
  }

  /*
   * -----------------------------------------
   * 투자계좌 이체
   * -----------------------------------------
   */
  if (
    input.sourceType === "BANK" &&
    input.amount < 0 &&
    (
      text.includes("업비트") ||
      text.includes("증권")
    )
  ) {
    return {
      transactionType:
        "INVESTMENT_TRANSFER",

      categoryL1: "투자",
      categoryL2: null,

      fixedVariable: null,
      essentialOptional: null,

      reviewRequired: true,
    };
  }

  /*
   * -----------------------------------------
   * 카드 사용은 기본적으로 지출.
   * 단 카테고리를 모르므로 검토 필요.
   * -----------------------------------------
   */
  if (
    input.sourceType === "CARD" &&
    input.amount < 0
  ) {
    return {
      transactionType: "EXPENSE",

      categoryL1: null,
      categoryL2: null,

      fixedVariable: null,
      essentialOptional: null,

      reviewRequired: true,
    };
  }

  /*
   * -----------------------------------------
   * 나머지는 섣불리 수입/지출 판단하지 않음
   * -----------------------------------------
   */
  return {
    transactionType:
      "REVIEW_REQUIRED",

    categoryL1: null,
    categoryL2: null,

    fixedVariable: null,
    essentialOptional: null,

    reviewRequired: true,
  };
}