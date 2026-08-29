"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

type Scope =
  | "THIS_ONLY"
  | "FUTURE";

type MatchField =
  | "COUNTERPARTY"
  | "DESCRIPTION";

type MatchOperator =
  | "EXACT"
  | "CONTAINS";

type ExistingRule = {
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

  priority: number;

  is_active: boolean;
};

type Transaction = {
  id: string;

  transaction_id:
    string;

  transaction_date:
    string;

  source_type:
    | "BANK"
    | "CARD";

  account_name:
    string | null;

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

  amount:
    number | string;

  gross_amount:
    number | string | null;

  benefit_amount:
    number | string | null;

  fee_amount:
    number | string | null;

  net_amount:
    number | string | null;

  original_amount:
    number | string | null;

  original_currency:
    string | null;

  exchange_rate:
    number | string | null;

  review_required:
    boolean;

  source_row:
    number | null;

  existingRule:
    ExistingRule | null;
};

type MatchPoolRow = {
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

type FinanceCategory = {
  id: string;
  parent_id: string | null;
  name: string;
  is_active: boolean;
};

const TRANSACTION_TYPES = [
  {
    value: "EXPENSE",
    label: "지출",
  },
  {
    value: "INCOME",
    label: "수입",
  },
  {
    value:
      "CARD_SETTLEMENT",
    label:
      "카드대금 납부",
  },
  {
    value:
      "DEBT_PAYMENT",
    label:
      "대출 상환",
  },
  {
    value:
      "INVESTMENT_TRANSFER",
    label:
      "투자금 이체",
  },
  {
    value:
      "INTERNAL_TRANSFER",
    label:
      "계좌 간 이동",
  },
  {
    value: "REFUND",
    label: "환불",
  },
  {
    value:
      "REIMBURSEMENT",
    label:
      "비용 정산",
  },
  {
    value: "OTHER",
    label: "기타",
  },
];

const TYPE_LABEL:
  Record<string, string> = {
    EXPENSE: "지출",
    INCOME: "수입",

    CARD_SETTLEMENT:
      "카드대금 납부",

    DEBT_PAYMENT:
      "대출 상환",

    INVESTMENT_TRANSFER:
      "투자금 이체",

    INTERNAL_TRANSFER:
      "계좌 간 이동",

    REFUND:
      "환불",

    REIMBURSEMENT:
      "비용 정산",

    OTHER:
      "기타",

    REVIEW_REQUIRED:
      "확인 필요",
  };

/*
 * =========================================================
 * Utility
 * =========================================================
 */

function getCurrentMonth() {
  const now =
    new Date();

  return [
    now.getFullYear(),

    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    ),
  ].join("-");
}

function formatWon(
  value:
    | number
    | string
    | null
    | undefined
) {
  const amount =
    Number(
      value ?? 0
    );

  return `${Math.abs(
    amount
  ).toLocaleString(
    "ko-KR"
  )}원`;
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

function getDefaultTransactionType(
  transaction:
    Transaction
) {
  if (
    transaction.transaction_type &&
    transaction.transaction_type !==
      "REVIEW_REQUIRED"
  ) {
    return transaction.transaction_type;
  }

  return Number(
    transaction.amount
  ) < 0
    ? "EXPENSE"
    : "INCOME";
}

function getFieldValue(
  transaction:
    | Transaction
    | MatchPoolRow,
  field:
    MatchField
) {
  return field ===
    "COUNTERPARTY"
    ? transaction.counterparty
    : transaction.description;
}

function matchesValue(
  transaction:
    | Transaction
    | MatchPoolRow,
  field:
    MatchField,
  operator:
    MatchOperator,
  value: string
) {
  const source =
    normalizeText(
      getFieldValue(
        transaction,
        field
      )
    );

  const target =
    normalizeText(
      value
    );

  if (
    !source ||
    !target
  ) {
    return false;
  }

  if (
    operator ===
    "EXACT"
  ) {
    return (
      source ===
      target
    );
  }

  return source.includes(
    target
  );
}

/*
 * =========================================================
 * Page
 * =========================================================
 */

export default function FinanceReviewPage() {
  const [
    month,
    setMonth,
  ] =
    useState(
      getCurrentMonth()
    );

  const [
    transactions,
    setTransactions,
  ] =
    useState<
      Transaction[]
    >([]);

  const [
    matchPool,
    setMatchPool,
  ] =
    useState<
      MatchPoolRow[]
    >([]);

  const [
    selectedId,
    setSelectedId,
  ] =
    useState<
      string | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    resolving,
    setResolving,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    message,
    setMessage,
  ] =
    useState<
      string | null
    >(null);

  /*
   * ---------------------------------------------------------
   * 분류 입력
   * ---------------------------------------------------------
   */

  const [
    transactionType,
    setTransactionType,
  ] =
    useState("");

  const [
    categoryL1,
    setCategoryL1,
  ] =
    useState("");

  const [
    categoryL2,
    setCategoryL2,
  ] =
    useState("");

  const [categories, setCategories] = useState<FinanceCategory[]>([]);

  useEffect(() => {
    fetch("/api/finance/categories", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { if (data.success) setCategories(data.categories ?? []); })
      .catch(() => undefined);
  }, []);

  const categoryRoots = categories.filter((category) => !category.parent_id && category.is_active);
  const selectedCategoryRoot = categoryRoots.find((category) => category.name === categoryL1);
  const categoryChildren = categories.filter((category) => category.parent_id === selectedCategoryRoot?.id && category.is_active);

  const [
    fixedVariable,
    setFixedVariable,
  ] =
    useState("");

  const [
    essentialOptional,
    setEssentialOptional,
  ] =
    useState("");

  /*
   * ---------------------------------------------------------
   * Rule 입력
   * ---------------------------------------------------------
   */

  const [
    scope,
    setScope,
  ] =
    useState<Scope>(
      "THIS_ONLY"
    );

  const [
    matchField,
    setMatchField,
  ] =
    useState<MatchField>(
      "COUNTERPARTY"
    );

  const [
    matchOperator,
    setMatchOperator,
  ] =
    useState<MatchOperator>(
      "EXACT"
    );

  const [
    matchValue,
    setMatchValue,
  ] =
    useState("");

  const [
    existingRuleId,
    setExistingRuleId,
  ] =
    useState<
      string | null
    >(null);

  const selectedTransaction =
    useMemo(
      () =>
        transactions.find(
          (
            transaction
          ) =>
            transaction.id ===
            selectedId
        ) ??
        null,
      [
        transactions,
        selectedId,
      ]
    );

  /*
   * =========================================================
   * 선택 거래 변경
   * =========================================================
   */

  useEffect(() => {
    if (
      !selectedTransaction
    ) {
      return;
    }

    const rule =
      selectedTransaction.existingRule;

    /*
     * 이미 등록된 규칙이 현재 거래에
     * 일치한다면 그 규칙을 그대로 편집 화면에 로드.
     */
    if (rule) {
      setTransactionType(
        rule.transaction_type
      );

      setCategoryL1(
        rule.category_l1 ??
          ""
      );

      setCategoryL2(
        rule.category_l2 ??
          ""
      );

      setFixedVariable(
        rule.fixed_variable ??
          ""
      );

      setEssentialOptional(
        rule.essential_optional ??
          ""
      );

      setScope(
        "FUTURE"
      );

      setMatchField(
        rule.match_field
      );

      setMatchOperator(
        rule.match_operator
      );

      setMatchValue(
        rule.match_value
      );

      setExistingRuleId(
        rule.id
      );

      setError(null);

      return;
    }

    /*
     * 등록된 규칙이 없는 일반 Review 거래
     */
    setTransactionType(
      getDefaultTransactionType(
        selectedTransaction
      )
    );

    setCategoryL1(
      selectedTransaction.category_l1 ??
        ""
    );

    setCategoryL2(
      selectedTransaction.category_l2 ??
        ""
    );

    setFixedVariable(
      selectedTransaction.fixed_variable ??
        ""
    );

    setEssentialOptional(
      selectedTransaction.essential_optional ??
        ""
    );

    setScope(
      "THIS_ONLY"
    );

    const defaultField:
      MatchField =
        selectedTransaction.counterparty
          ? "COUNTERPARTY"
          : "DESCRIPTION";

    setMatchField(
      defaultField
    );

    setMatchOperator(
      "EXACT"
    );

    setMatchValue(
      getFieldValue(
        selectedTransaction,
        defaultField
      ) ?? ""
    );

    setExistingRuleId(
      null
    );

    setError(null);
  }, [
    selectedTransaction,
  ]);

  /*
   * =========================================================
   * FUTURE Rule Preview
   * =========================================================
   */

  const currentRuleMatches =
    useMemo(
      () => {
        if (
          !selectedTransaction
        ) {
          return false;
        }

        return matchesValue(
          selectedTransaction,
          matchField,
          matchOperator,
          matchValue
        );
      },
      [
        selectedTransaction,
        matchField,
        matchOperator,
        matchValue,
      ]
    );

  const futureTargetCount =
    useMemo(
      () => {
        if (
          !selectedTransaction ||
          !currentRuleMatches
        ) {
          return 0;
        }

        const matchedIds =
          new Set<string>();

        for (
          const transaction
          of matchPool
        ) {
          if (
            transaction.source_type !==
            selectedTransaction.source_type
          ) {
            continue;
          }

          /*
           * 현재 선택 거래는 항상 포함
           */
          if (
            transaction.id ===
            selectedTransaction.id
          ) {
            matchedIds.add(
              transaction.id
            );

            continue;
          }

          /*
           * 환불/취소 보호
           */
          if (
            transaction.transaction_type ===
            "REFUND"
          ) {
            continue;
          }

          if (
            matchesValue(
              transaction,
              matchField,
              matchOperator,
              matchValue
            )
          ) {
            matchedIds.add(
              transaction.id
            );
          }
        }

        /*
         * matchPool 조회 제한 등으로
         * 현재 거래가 빠지는 경우 보호
         */
        matchedIds.add(
          selectedTransaction.id
        );

        return matchedIds.size;
      },
      [
        selectedTransaction,
        matchPool,
        matchField,
        matchOperator,
        matchValue,
        currentRuleMatches,
      ]
    );

  /*
   * =========================================================
   * Queue 조회
   * =========================================================
   */

  async function loadReviewQueue() {
    setLoading(true);
    setError(null);

    try {
      const params =
        new URLSearchParams();

      if (month) {
        params.set(
          "month",
          month
        );
      }

      const response =
        await fetch(
          `/api/finance/review?${params.toString()}`,
          {
            cache:
              "no-store",
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ??
            "확인 필요 거래를 불러오지 못했습니다."
        );
      }

      const loadedTransactions:
        Transaction[] =
          data.transactions ??
          [];

      setTransactions(
        loadedTransactions
      );

      setMatchPool(
        data.matchPool ??
          []
      );

      setSelectedId(
        (
          currentId
        ) => {
          if (
            currentId &&
            loadedTransactions.some(
              (
                transaction
              ) =>
                transaction.id ===
                currentId
            )
          ) {
            return currentId;
          }

          return (
            loadedTransactions[
              0
            ]?.id ??
            null
          );
        }
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReviewQueue();
  }, [month]);

  /*
   * =========================================================
   * Match Field 변경
   * =========================================================
   */

  function changeMatchField(
    field:
      MatchField
  ) {
    setMatchField(
      field
    );

    if (
      selectedTransaction
    ) {
      setMatchValue(
        getFieldValue(
          selectedTransaction,
          field
        ) ?? ""
      );
    }
  }

  /*
   * =========================================================
   * 거래 확정
   * =========================================================
   */

  async function resolveTransaction() {
    if (
      !selectedTransaction
    ) {
      return;
    }

    if (!transactionType) {
      setError(
        "거래유형을 선택해주세요."
      );

      return;
    }

    if (
      scope ===
        "FUTURE" &&
      !matchValue.trim()
    ) {
      setError(
        "자동분류 기준 문구를 입력해주세요."
      );

      return;
    }

    if (
      scope ===
        "FUTURE" &&
      !currentRuleMatches
    ) {
      setError(
        "자동분류 기준이 현재 거래와 일치하지 않습니다."
      );

      return;
    }

    setResolving(true);
    setError(null);
    setMessage(null);

    try {
      const response =
        await fetch(
          "/api/finance/review/resolve",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                transactionId:
                  selectedTransaction.id,

                transactionType,

                categoryL1,

                categoryL2,

                fixedVariable,

                essentialOptional,

                scope,

                matchField,

                matchOperator,

                matchValue,

                existingRuleId,
              }),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ??
            "거래 확정에 실패했습니다."
        );
      }

      /*
       * FUTURE는 여러 거래가 한꺼번에
       * Queue에서 빠질 수 있으므로
       * 로컬에서 한 건만 삭제하지 않고
       * 서버 데이터를 다시 조회한다.
       */
      await loadReviewQueue();

      if (
        scope ===
        "FUTURE"
      ) {
        setMessage(
          `동일 조건의 확인 필요 거래 ${data.resolvedCount}건을 분류하고 자동분류 규칙을 저장했습니다.`
        );
      } else {
        setMessage(
          "현재 거래 1건을 확정했습니다."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "거래 확정 중 오류가 발생했습니다."
      );
    } finally {
      setResolving(false);
    }
  }

  /*
   * =========================================================
   * UI
   * =========================================================
   */

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-[1500px]">

        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">
              생활금융
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              거래 검토
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              미분류 거래를 확정하고 반복 거래의 자동분류 규칙을 관리합니다.
            </p>
          </div>

          <div className="flex gap-2">
            <a
              href="/finance/transactions"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
            >
              전체 거래내역
            </a>

            <a
              href="/finance/upload"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              데이터 업로드
            </a>
          </div>
        </header>

        {error && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            {message}
          </div>
        )}

        {/* Month */}
        <section className="mt-6 flex items-end justify-between gap-4 border border-gray-200 bg-white p-5">
          <label>
            <span className="block text-xs font-medium text-gray-500">
              검토 월
            </span>

            <input
              type="month"
              value={month}
              onChange={(
                event
              ) =>
                setMonth(
                  event.target
                    .value
                )
              }
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <div className="text-right">
            <p className="text-xs text-gray-500">
              이 월의 확인 필요
            </p>

            <p className="mt-1 text-2xl font-bold text-gray-900">
              {
                transactions.length
              }
              건
            </p>
          </div>
        </section>

        {loading ? (
          <section className="mt-5 border border-gray-200 bg-white p-10 text-center text-gray-500">
            확인 필요 거래를 불러오는 중...
          </section>
        ) : transactions.length ===
          0 ? (
          <section className="mt-5 border border-gray-200 bg-white p-12 text-center">
            <p className="text-2xl">
              ✓
            </p>

            <h2 className="mt-3 text-lg font-semibold text-gray-900">
              확인할 거래가 없습니다.
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              해당 월의 모든 거래가 분류된 상태입니다.
            </p>
          </section>
        ) : (
          <section className="mt-5 grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">

            {/* Queue */}
            <div className="overflow-hidden border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="font-semibold text-gray-900">
                  확인 필요 거래
                </h2>
              </div>

              <div className="max-h-[760px] overflow-y-auto">
                {transactions.map(
                  (
                    transaction
                  ) => {
                    const amount =
                      Number(
                        transaction.amount
                      );

                    const selected =
                      transaction.id ===
                      selectedId;

                    return (
                      <button
                        type="button"
                        key={
                          transaction.id
                        }
                        onClick={() =>
                          setSelectedId(
                            transaction.id
                          )
                        }
                        className={
                          selected
                            ? "block w-full border-b border-gray-100 bg-gray-100 px-5 py-4 text-left"
                            : "block w-full border-b border-gray-100 px-5 py-4 text-left hover:bg-gray-50"
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs text-gray-400">
                              {
                                transaction.transaction_date
                              }
                              {" · "}
                              {transaction.source_type ===
                              "BANK"
                                ? "은행"
                                : "카드"}
                            </p>

                            <p className="mt-1 truncate font-semibold text-gray-900">
                              {transaction.counterparty ??
                                transaction.description ??
                                "거래처 없음"}
                            </p>

                            {transaction.existingRule && (
                              <p className="mt-2 inline-block rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
                                등록된 자동분류 규칙 있음
                              </p>
                            )}
                          </div>

                          <p className="shrink-0 font-semibold tabular-nums text-gray-800">
                            {amount >=
                            0
                              ? "+"
                              : "-"}
                            {formatWon(
                              amount
                            )}
                          </p>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Editor */}
            {selectedTransaction && (
              <div className="border border-gray-200 bg-white p-6">

                {/* Transaction Info */}
                <div className="border-b border-gray-200 pb-6">
                  <div className="flex flex-wrap items-start justify-between gap-5">

                    <div>
                      <p className="text-sm text-gray-500">
                        {
                          selectedTransaction.transaction_date
                        }
                        {" · "}
                        {selectedTransaction.source_type ===
                        "BANK"
                          ? "은행 거래"
                          : "카드 이용"}
                      </p>

                      <h2 className="mt-2 text-2xl font-bold text-gray-900">
                        {selectedTransaction.counterparty ??
                          "거래처 없음"}
                      </h2>

                      {selectedTransaction.description && (
                        <p className="mt-2 text-sm text-gray-500">
                          {
                            selectedTransaction.description
                          }
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        거래금액
                      </p>

                      <p className="mt-1 text-2xl font-bold tabular-nums">
                        {Number(
                          selectedTransaction.amount
                        ) >= 0
                          ? "+"
                          : "-"}
                        {formatWon(
                          selectedTransaction.amount
                        )}
                      </p>
                    </div>

                  </div>

                  {selectedTransaction.existingRule && (
                    <div className="mt-5 border border-blue-200 bg-blue-50 p-4">
                      <p className="text-sm font-semibold text-blue-900">
                        이미 등록된 자동분류 규칙과 일치합니다.
                      </p>

                      <p className="mt-1 text-xs leading-5 text-blue-700">
                        기존 규칙을 불러왔습니다. 그대로 확정하면 새 규칙을 중복 생성하지 않고 기존 규칙을 사용해 현재 남아 있는 동일 거래까지 함께 처리합니다.
                      </p>
                    </div>
                  )}
                </div>

                {/* Classification */}
                <div className="mt-6">
                  <h3 className="font-semibold text-gray-900">
                    거래 분류
                  </h3>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">

                    <label>
                      <span className="text-sm font-medium text-gray-700">
                        거래유형
                      </span>

                      <select
                        value={
                          transactionType
                        }
                        onChange={(
                          event
                        ) =>
                          setTransactionType(
                            event.target
                              .value
                          )
                        }
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                      >
                        {TRANSACTION_TYPES.map(
                          (
                            type
                          ) => (
                            <option
                              key={
                                type.value
                              }
                              value={
                                type.value
                              }
                            >
                              {
                                type.label
                              }
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label>
                      <span className="text-sm font-medium text-gray-700">
                        대분류
                      </span>

                      <select
                        value={
                          categoryL1
                        }
                        onChange={(
                          event
                        ) =>
                          { setCategoryL1(event.target.value); setCategoryL2(""); }
                        }
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                      >
                        <option value="">미분류</option>
                        {categoryRoots.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                        {categoryL1 && !categoryRoots.some((category) => category.name === categoryL1) && <option value={categoryL1}>{categoryL1} (기존)</option>}
                      </select>
                    </label>

                    <label>
                      <span className="text-sm font-medium text-gray-700">
                        소분류
                      </span>

                      <select
                        value={
                          categoryL2
                        }
                        onChange={(
                          event
                        ) =>
                          setCategoryL2(
                            event.target
                              .value
                          )
                        }
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                      >
                        <option value="">선택 안 함</option>
                        {categoryChildren.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                        {categoryL2 && !categoryChildren.some((category) => category.name === categoryL2) && <option value={categoryL2}>{categoryL2} (기존)</option>}
                      </select>
                    </label>

                    <label>
                      <span className="text-sm font-medium text-gray-700">
                        고정/변동
                      </span>

                      <select
                        value={
                          fixedVariable
                        }
                        onChange={(
                          event
                        ) =>
                          setFixedVariable(
                            event.target
                              .value
                          )
                        }
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                      >
                        <option value="">
                          미지정
                        </option>

                        <option value="FIXED">
                          고정비
                        </option>

                        <option value="VARIABLE">
                          변동비
                        </option>
                      </select>
                    </label>

                    <label>
                      <span className="text-sm font-medium text-gray-700">
                        필수/선택
                      </span>

                      <select
                        value={
                          essentialOptional
                        }
                        onChange={(
                          event
                        ) =>
                          setEssentialOptional(
                            event.target
                              .value
                          )
                        }
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                      >
                        <option value="">
                          미지정
                        </option>

                        <option value="ESSENTIAL">
                          필수
                        </option>

                        <option value="OPTIONAL">
                          선택
                        </option>
                      </select>
                    </label>

                  </div>
                </div>

                {/* Scope */}
                <div className="mt-8 border-t border-gray-200 pt-6">
                  <h3 className="font-semibold text-gray-900">
                    적용 범위
                  </h3>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">

                    <button
                      type="button"
                      onClick={() =>
                        setScope(
                          "THIS_ONLY"
                        )
                      }
                      className={
                        scope ===
                        "THIS_ONLY"
                          ? "border-2 border-gray-900 bg-gray-50 p-4 text-left"
                          : "border border-gray-200 p-4 text-left"
                      }
                    >
                      <p className="font-medium text-gray-900">
                        이 거래만
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        현재 선택한 1건만 분류합니다.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setScope(
                          "FUTURE"
                        )
                      }
                      className={
                        scope ===
                        "FUTURE"
                          ? "border-2 border-gray-900 bg-gray-50 p-4 text-left"
                          : "border border-gray-200 p-4 text-left"
                      }
                    >
                      <p className="font-medium text-gray-900">
                        같은 거래 모두 + 앞으로
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        현재 동일 미분류 거래와 이후 업로드에 함께 적용합니다.
                      </p>
                    </button>

                  </div>

                  {scope ===
                    "FUTURE" && (
                    <div className="mt-5 border border-gray-200 bg-gray-50 p-5">
                      <div className="grid gap-4 md:grid-cols-2">

                        <label>
                          <span className="text-sm font-medium text-gray-700">
                            기준 필드
                          </span>

                          <select
                            value={
                              matchField
                            }
                            onChange={(
                              event
                            ) =>
                              changeMatchField(
                                event.target
                                  .value as MatchField
                              )
                            }
                            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                          >
                            <option value="COUNTERPARTY">
                              거래처
                            </option>

                            <option value="DESCRIPTION">
                              거래내용
                            </option>
                          </select>
                        </label>

                        <label>
                          <span className="text-sm font-medium text-gray-700">
                            일치 방식
                          </span>

                          <select
                            value={
                              matchOperator
                            }
                            onChange={(
                              event
                            ) =>
                              setMatchOperator(
                                event.target
                                  .value as MatchOperator
                              )
                            }
                            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                          >
                            <option value="EXACT">
                              정확히 일치
                            </option>

                            <option value="CONTAINS">
                              문구 포함
                            </option>
                          </select>
                        </label>

                        <label className="md:col-span-2">
                          <span className="text-sm font-medium text-gray-700">
                            기준 문구
                          </span>

                          <input
                            value={
                              matchValue
                            }
                            onChange={(
                              event
                            ) =>
                              setMatchValue(
                                event.target
                                  .value
                              )
                            }
                            placeholder="예: 스타벅스"
                            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                          />

                          {matchOperator ===
                            "CONTAINS" && (
                            <p className="mt-2 text-xs text-gray-500">
                              반복되는 지점명·결제번호 등을 제외하고 공통 문구만 남기면 활용도가 높습니다.
                            </p>
                          )}
                        </label>

                      </div>

                      {!currentRuleMatches ? (
                        <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          입력한 기준 문구가 현재 거래와 일치하지 않습니다.
                        </div>
                      ) : (
                        <div className="mt-4 border border-gray-200 bg-white p-4">
                          <p className="text-sm text-gray-600">
                            현재 DB의 확인 필요 거래 중
                          </p>

                          <p className="mt-1 text-xl font-bold text-gray-900">
                            {
                              futureTargetCount
                            }
                            건
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            에 현재 분류를 함께 적용하고, 이후 업로드에도 같은 규칙을 적용합니다.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Save */}
                <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 pt-6">
                  <div className="text-sm text-gray-500">
                    {scope ===
                    "FUTURE"
                      ? existingRuleId
                        ? "기존 자동분류 규칙을 갱신합니다."
                        : "새 자동분류 규칙을 저장합니다."
                      : "현재 선택 거래만 변경합니다."}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void resolveTransaction()
                    }
                    disabled={
                      resolving ||
                      (
                        scope ===
                          "FUTURE" &&
                        (
                          !matchValue.trim() ||
                          !currentRuleMatches
                        )
                      )
                    }
                    className="rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {resolving
                      ? "처리 중..."
                      : scope ===
                          "FUTURE"
                        ? existingRuleId
                          ? `등록 규칙 적용 · ${futureTargetCount}건`
                          : `일괄 적용 + 규칙 저장 · ${futureTargetCount}건`
                        : "거래 확정"}
                  </button>
                </div>

              </div>
            )}
          </section>
        )}

      </div>
    </main>
  );
}
