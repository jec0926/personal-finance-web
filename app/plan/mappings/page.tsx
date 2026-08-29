"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

type Plan = {
  id: string;

  plan_name: string;

  start_month: string;

  end_month: string;

  is_active: boolean;
};

type PlanRow = {
  id: string;

  section: string;

  row_name: string;

  sort_order: number;
};

type Mapping = {
  id: string;

  plan_row_id: string;

  source_type:
    string | null;

  transaction_type:
    string;

  category_l1:
    string | null;

  category_l2:
    string | null;

  amount_basis:
    string;

  multiplier:
    number | string;

  is_active: boolean;
};

type Dimension = {
  source_type: string;

  transaction_type: string;

  category_l1:
    string | null;

  category_l2:
    string | null;
};

const SECTION_LABEL:
  Record<string, string> = {
    INCOME:
      "수입",

    LIVING_EXPENSE:
      "생활·주거비",

    DEBT_PAYMENT:
      "대출상환",

    INVESTMENT:
      "투자",

    OTHER_ALLOCATION:
      "기타 자금배분",
  };

const TYPE_LABEL:
  Record<string, string> = {
    EXPENSE:
      "지출",

    INCOME:
      "수입",

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
  };

const TRANSACTION_TYPES =
  Object.entries(
    TYPE_LABEL
  );

function defaultTransactionType(
  section: string
) {
  if (
    section === "INCOME"
  ) {
    return "INCOME";
  }

  if (
    section ===
    "LIVING_EXPENSE"
  ) {
    return "EXPENSE";
  }

  if (
    section ===
    "DEBT_PAYMENT"
  ) {
    return "DEBT_PAYMENT";
  }

  if (
    section ===
    "INVESTMENT"
  ) {
    return "INVESTMENT_TRANSFER";
  }

  return "OTHER";
}

function defaultAmountBasis(
  section: string
) {
  return section ===
    "INCOME"
    ? "SIGNED_AMOUNT"
    : "ABS_AMOUNT";
}

export default function PlanMappingsPage() {
  const [
    plans,
    setPlans,
  ] =
    useState<
      Plan[]
    >([]);

  const [
    selectedPlan,
    setSelectedPlan,
  ] =
    useState<
      Plan | null
    >(null);

  const [
    rows,
    setRows,
  ] =
    useState<
      PlanRow[]
    >([]);

  const [
    mappings,
    setMappings,
  ] =
    useState<
      Mapping[]
    >([]);

  const [
    dimensions,
    setDimensions,
  ] =
    useState<
      Dimension[]
    >([]);

  const [
    selectedRowId,
    setSelectedRowId,
  ] =
    useState("");

  const [
    sourceType,
    setSourceType,
  ] =
    useState("");

  const [
    transactionType,
    setTransactionType,
  ] =
    useState(
      "EXPENSE"
    );

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

  const [
    amountBasis,
    setAmountBasis,
  ] =
    useState(
      "ABS_AMOUNT"
    );

  const [
    multiplier,
    setMultiplier,
  ] =
    useState("1");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
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

  async function loadData(
    planId?: string
  ) {
    setLoading(true);
    setError(null);

    try {
      const params =
        new URLSearchParams();

      if (planId) {
        params.set(
          "planId",
          planId
        );
      }

      const response =
        await fetch(
          `/api/plan/mappings?${params.toString()}`,
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
            "Actual Mapping 정보를 불러오지 못했습니다."
        );
      }

      setPlans(
        data.plans ??
          []
      );

      setSelectedPlan(
        data.selectedPlan ??
          null
      );

      setRows(
        data.rows ??
          []
      );

      setMappings(
        data.mappings ??
          []
      );

      setDimensions(
        data.dimensions ??
          []
      );

      if (
        data.rows?.length
      ) {
        setSelectedRowId(
          (
            current
          ) =>
            data.rows.some(
              (
                row: PlanRow
              ) =>
                row.id ===
                current
            )
              ? current
              : data.rows[0].id
        );
      }
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
    void loadData();
  }, []);

  const selectedRow =
    useMemo(
      () =>
        rows.find(
          (row) =>
            row.id ===
            selectedRowId
        ) ??
        null,
      [
        rows,
        selectedRowId,
      ]
    );

  /*
   * 행을 바꾸면 Section에 맞는
   * 기본 거래유형/금액방식 제안
   */
  useEffect(() => {
    if (!selectedRow) {
      return;
    }

    setTransactionType(
      defaultTransactionType(
        selectedRow.section
      )
    );

    setAmountBasis(
      defaultAmountBasis(
        selectedRow.section
      )
    );

    setSourceType("");
    setCategoryL1("");
    setCategoryL2("");
    setMultiplier("1");
  }, [
    selectedRow,
  ]);

  /*
   * Actual Snapshot에 실제 존재하는
   * 카테고리 후보
   */
  const categoryL1Options =
    useMemo(
      () =>
        Array.from(
          new Set(
            dimensions
              .filter(
                (
                  dimension
                ) =>
                  dimension.transaction_type ===
                    transactionType &&
                  (
                    !sourceType ||
                    dimension.source_type ===
                      sourceType
                  )
              )
              .map(
                (
                  dimension
                ) =>
                  dimension.category_l1
              )
              .filter(
                (
                  value
                ): value is string =>
                  Boolean(
                    value
                  )
              )
          )
        ).sort(
          (
            a,
            b
          ) =>
            a.localeCompare(
              b,
              "ko"
            )
        ),
      [
        dimensions,
        transactionType,
        sourceType,
      ]
    );

  const categoryL2Options =
    useMemo(
      () =>
        Array.from(
          new Set(
            dimensions
              .filter(
                (
                  dimension
                ) =>
                  dimension.transaction_type ===
                    transactionType &&
                  (
                    !sourceType ||
                    dimension.source_type ===
                      sourceType
                  ) &&
                  (
                    !categoryL1 ||
                    dimension.category_l1 ===
                      categoryL1
                  )
              )
              .map(
                (
                  dimension
                ) =>
                  dimension.category_l2
              )
              .filter(
                (
                  value
                ): value is string =>
                  Boolean(
                    value
                  )
              )
          )
        ).sort(
          (
            a,
            b
          ) =>
            a.localeCompare(
              b,
              "ko"
            )
        ),
      [
        dimensions,
        transactionType,
        sourceType,
        categoryL1,
      ]
    );

  async function saveMapping() {
    if (
      !selectedRow
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response =
        await fetch(
          "/api/plan/mappings",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                planRowId:
                  selectedRow.id,

                sourceType,

                transactionType,

                categoryL1,

                categoryL2,

                amountBasis,

                multiplier:
                  Number(
                    multiplier
                  ),
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
            "Mapping 저장에 실패했습니다."
        );
      }

      setMessage(
        `${selectedRow.row_name}의 Actual 연결 기준을 저장했습니다.`
      );

      await loadData(
        selectedPlan?.id
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "저장 중 오류가 발생했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteMapping(
    mappingId: string
  ) {
    const confirmed =
      window.confirm(
        "이 Actual 연결 기준을 삭제하시겠습니까?"
      );

    if (!confirmed) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const params =
        new URLSearchParams();

      params.set(
        "mappingId",
        mappingId
      );

      const response =
        await fetch(
          `/api/plan/mappings?${params.toString()}`,
          {
            method:
              "DELETE",
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
            "Mapping 삭제에 실패했습니다."
        );
      }

      await loadData(
        selectedPlan?.id
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "삭제 중 오류가 발생했습니다."
      );
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-7xl text-gray-500">
          Actual Mapping을 불러오는 중...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">
              재무계획
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Plan · Actual 연결
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              재무계획 항목과 월마감 Actual 분류를 연결합니다.
            </p>
          </div>

          <a
            href="/plan/model"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium"
          >
            재무 모델
          </a>
        </header>

        {error && (
          <div className="mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            {message}
          </div>
        )}

        <section className="mt-6 border border-gray-200 bg-white p-5">

          <label>
            <span className="text-xs font-medium text-gray-500">
              Plan
            </span>

            <select
              value={
                selectedPlan?.id ??
                ""
              }
              onChange={(
                event
              ) =>
                void loadData(
                  event.target
                    .value
                )
              }
              className="mt-2 block min-w-64 rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              {plans.map(
                (plan) => (
                  <option
                    key={
                      plan.id
                    }
                    value={
                      plan.id
                    }
                  >
                    {
                      plan.plan_name
                    }
                  </option>
                )
              )}
            </select>
          </label>

        </section>

        {!selectedPlan ? (
          <section className="mt-5 border border-gray-200 bg-white p-10 text-center text-gray-500">
            먼저 재무 Plan을 생성해주세요.
          </section>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">

            {/* Plan rows */}
            <section className="overflow-hidden border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="font-semibold">
                  Plan 항목
                </h2>
              </div>

              <div className="max-h-[700px] overflow-y-auto">
                {rows.map(
                  (row) => {
                    const rowMappings =
                      mappings.filter(
                        (
                          mapping
                        ) =>
                          mapping.plan_row_id ===
                          row.id
                      );

                    return (
                      <button
                        type="button"
                        key={
                          row.id
                        }
                        onClick={() =>
                          setSelectedRowId(
                            row.id
                          )
                        }
                        className={
                          row.id ===
                          selectedRowId
                            ? "block w-full border-b border-gray-100 bg-gray-100 px-5 py-4 text-left"
                            : "block w-full border-b border-gray-100 px-5 py-4 text-left hover:bg-gray-50"
                        }
                      >
                        <p className="text-xs text-gray-400">
                          {SECTION_LABEL[
                            row.section
                          ] ??
                            row.section}
                        </p>

                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="font-semibold text-gray-900">
                            {
                              row.row_name
                            }
                          </p>

                          <span className="text-xs text-gray-500">
                            {
                              rowMappings.length
                            }
                            개 연결
                          </span>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            </section>

            {/* Editor */}
            {selectedRow && (
              <section className="border border-gray-200 bg-white p-6">

                <div className="border-b border-gray-200 pb-5">
                  <p className="text-sm text-gray-500">
                    {SECTION_LABEL[
                      selectedRow.section
                    ] ??
                      selectedRow.section}
                  </p>

                  <h2 className="mt-1 text-2xl font-bold">
                    {
                      selectedRow.row_name
                    }
                  </h2>
                </div>

                <div className="mt-6">
                  <h3 className="font-semibold">
                    Actual 연결 추가
                  </h3>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">

                    <label>
                      <span className="text-sm text-gray-700">
                        자료
                      </span>

                      <select
                        value={
                          sourceType
                        }
                        onChange={(
                          event
                        ) =>
                          setSourceType(
                            event.target
                              .value
                          )
                        }
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                      >
                        <option value="">
                          은행 + 카드 전체
                        </option>

                        <option value="BANK">
                          은행
                        </option>

                        <option value="CARD">
                          카드
                        </option>
                      </select>
                    </label>

                    <label>
                      <span className="text-sm text-gray-700">
                        거래유형
                      </span>

                      <select
                        value={
                          transactionType
                        }
                        onChange={(
                          event
                        ) => {
                          setTransactionType(
                            event.target
                              .value
                          );

                          setCategoryL1(
                            ""
                          );

                          setCategoryL2(
                            ""
                          );
                        }}
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                      >
                        {TRANSACTION_TYPES.map(
                          ([
                            value,
                            label,
                          ]) => (
                            <option
                              key={
                                value
                              }
                              value={
                                value
                              }
                            >
                              {
                                label
                              }
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label>
                      <span className="text-sm text-gray-700">
                        대분류
                      </span>

                      <select
                        value={
                          categoryL1
                        }
                        onChange={(
                          event
                        ) => {
                          setCategoryL1(
                            event.target
                              .value
                          );

                          setCategoryL2(
                            ""
                          );
                        }}
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                      >
                        <option value="">
                          전체
                        </option>

                        {categoryL1Options.map(
                          (
                            value
                          ) => (
                            <option
                              key={
                                value
                              }
                              value={
                                value
                              }
                            >
                              {
                                value
                              }
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label>
                      <span className="text-sm text-gray-700">
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
                        <option value="">
                          전체
                        </option>

                        {categoryL2Options.map(
                          (
                            value
                          ) => (
                            <option
                              key={
                                value
                              }
                              value={
                                value
                              }
                            >
                              {
                                value
                              }
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label>
                      <span className="text-sm text-gray-700">
                        금액 적용
                      </span>

                      <select
                        value={
                          amountBasis
                        }
                        onChange={(
                          event
                        ) =>
                          setAmountBasis(
                            event.target
                              .value
                          )
                        }
                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3"
                      >
                        <option value="ABS_AMOUNT">
                          절대값
                        </option>

                        <option value="SIGNED_AMOUNT">
                          부호 유지
                        </option>

                        <option value="ABS_NET">
                          카드 실제 부담액
                        </option>
                      </select>
                    </label>

                    <label>
                      <span className="text-sm text-gray-700">
                        반영 배수
                      </span>

                      <input
                        type="number"
                        step="0.1"
                        value={
                          multiplier
                        }
                        onChange={(
                          event
                        ) =>
                          setMultiplier(
                            event.target
                              .value
                          )
                        }
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-3"
                      />

                      <p className="mt-1 text-xs text-gray-400">
                        일반적으로 1, 환불 차감 등은 -1
                      </p>
                    </label>

                  </div>

                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      disabled={
                        saving
                      }
                      onClick={() =>
                        void saveMapping()
                      }
                      className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {saving
                        ? "저장 중..."
                        : "Actual 연결 추가"}
                    </button>
                  </div>
                </div>

                {/* Existing */}
                <div className="mt-8 border-t border-gray-200 pt-6">
                  <h3 className="font-semibold">
                    연결된 Actual 기준
                  </h3>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left text-gray-500">
                        <tr>
                          <th className="px-3 py-3">
                            자료
                          </th>

                          <th className="px-3 py-3">
                            유형
                          </th>

                          <th className="px-3 py-3">
                            분류
                          </th>

                          <th className="px-3 py-3">
                            금액
                          </th>

                          <th className="px-3 py-3">
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {mappings
                          .filter(
                            (
                              mapping
                            ) =>
                              mapping.plan_row_id ===
                              selectedRow.id
                          )
                          .map(
                            (
                              mapping
                            ) => (
                              <tr
                                key={
                                  mapping.id
                                }
                                className="border-t border-gray-100"
                              >
                                <td className="px-3 py-3">
                                  {mapping.source_type ??
                                    "전체"}
                                </td>

                                <td className="px-3 py-3">
                                  {TYPE_LABEL[
                                    mapping.transaction_type
                                  ] ??
                                    mapping.transaction_type}
                                </td>

                                <td className="px-3 py-3">
                                  {mapping.category_l1 ??
                                    "전체"}

                                  {mapping.category_l2
                                    ? ` / ${mapping.category_l2}`
                                    : ""}
                                </td>

                                <td className="px-3 py-3">
                                  {mapping.amount_basis ===
                                  "SIGNED_AMOUNT"
                                    ? "부호 유지"
                                    : mapping.amount_basis ===
                                        "ABS_NET"
                                      ? "실제 부담"
                                      : "절대값"}

                                  {Number(
                                    mapping.multiplier
                                  ) !==
                                    1 &&
                                    ` × ${mapping.multiplier}`}
                                </td>

                                <td className="px-3 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void deleteMapping(
                                        mapping.id
                                      )
                                    }
                                    className="text-xs text-red-600"
                                  >
                                    삭제
                                  </button>
                                </td>
                              </tr>
                            )
                          )}

                        {mappings.filter(
                          (
                            mapping
                          ) =>
                            mapping.plan_row_id ===
                            selectedRow.id
                        ).length ===
                          0 && (
                          <tr>
                            <td
                              colSpan={
                                5
                              }
                              className="px-3 py-8 text-center text-gray-400"
                            >
                              아직 연결된 Actual 기준이 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </section>
            )}

          </div>
        )}

      </div>
    </main>
  );
}