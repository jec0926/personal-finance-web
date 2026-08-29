"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";

type Section =
  | "INCOME"
  | "LIVING_EXPENSE"
  | "DEBT_PAYMENT"
  | "INVESTMENT"
  | "OTHER_ALLOCATION";

type Plan = {
  id: string;
  plan_name: string;
  start_month: string;
  end_month: string;
  is_active: boolean;
};

type PlanRow = {
  id: string;
  plan_version_id: string;
  section: Section;
  row_name: string;
  sort_order: number;
  values: Record<string, number>;
};

const SECTION_ORDER: Section[] = [
  "INCOME",
  "LIVING_EXPENSE",
  "DEBT_PAYMENT",
  "INVESTMENT",
  "OTHER_ALLOCATION",
];

const SECTION_LABEL: Record<Section, string> = {
  INCOME: "수입",
  LIVING_EXPENSE: "생활·주거비",
  DEBT_PAYMENT: "대출상환",
  INVESTMENT: "투자",
  OTHER_ALLOCATION: "기타 자금배분",
};

function createMonths(
  startDate: string,
  endDate: string
) {
  const months: string[] = [];

  const start = new Date(
    `${startDate}T00:00:00Z`
  );

  const end = new Date(
    `${endDate}T00:00:00Z`
  );

  const current = new Date(start);

  while (current <= end) {
    months.push(
      current.toISOString().slice(0, 10)
    );

    current.setUTCMonth(
      current.getUTCMonth() + 1
    );
  }

  return months;
}

function monthLabel(date: string) {
  const [year, month] = date.split("-");

  return `${year.slice(2)}.${month}`;
}

function parseAmount(
  value: string | number | undefined
) {
  if (
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatAmount(value: number) {
  return Math.round(value).toLocaleString(
    "ko-KR"
  );
}

export default function FinancialModelPage() {
  const [plans, setPlans] =
    useState<Plan[]>([]);

  const [
    selectedPlan,
    setSelectedPlan,
  ] = useState<Plan | null>(null);

  const [rows, setRows] =
    useState<PlanRow[]>([]);

  /*
   * 셀 편집값
   *
   * key 예:
   * rowId|2026-09-01
   */
  const [
    draftValues,
    setDraftValues,
  ] = useState<Record<string, string>>(
    {}
  );

  /*
   * 저장되지 않은 셀 목록
   */
  const [
    dirtyKeys,
    setDirtyKeys,
  ] = useState<Set<string>>(
    new Set()
  );

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState<string | null>(null);

  /*
   * 새 Plan
   */
  const [
    showCreatePlan,
    setShowCreatePlan,
  ] = useState(false);

  const [
    newPlanName,
    setNewPlanName,
  ] = useState("Plan V1");

  const [
    newPlanStartMonth,
    setNewPlanStartMonth,
  ] = useState("");

  /*
   * 새 재무항목
   */
  const [
    newRowSection,
    setNewRowSection,
  ] = useState<Section>("INCOME");

  const [
    newRowName,
    setNewRowName,
  ] = useState("");

  /*
   * 기간 일괄입력
   */
  const [
    bulkRowId,
    setBulkRowId,
  ] = useState("");

  const [
    bulkStartMonth,
    setBulkStartMonth,
  ] = useState("");

  const [
    bulkEndMonth,
    setBulkEndMonth,
  ] = useState("");

  const [
    bulkAmount,
    setBulkAmount,
  ] = useState("");

  /*
   * 선택된 Plan의 월 목록
   */
  const months = useMemo(() => {
    if (!selectedPlan) {
      return [];
    }

    return createMonths(
      selectedPlan.start_month,
      selectedPlan.end_month
    );
  }, [selectedPlan]);

  /*
   * =========================================================
   * 데이터 조회
   * =========================================================
   */

  async function loadModel(
    planId?: string
  ) {
    setLoading(true);
    setError(null);

    try {
      const url = planId
        ? `/api/plan/model?planId=${encodeURIComponent(
            planId
          )}`
        : "/api/plan/model";

      const response = await fetch(
        url,
        {
          cache: "no-store",
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
            "재무모델을 불러오지 못했습니다."
        );
      }

      const loadedPlans: Plan[] =
        data.plans ?? [];

      const loadedPlan: Plan | null =
        data.selectedPlan ?? null;

      const loadedRows: PlanRow[] =
        data.rows ?? [];

      setPlans(loadedPlans);
      setSelectedPlan(loadedPlan);
      setRows(loadedRows);

      /*
       * DB 값을 화면 편집용 구조로 변환
       */
      const nextValues: Record<
        string,
        string
      > = {};

      loadedRows.forEach((row) => {
        Object.entries(
          row.values ?? {}
        ).forEach(
          ([month, amount]) => {
            nextValues[
              `${row.id}|${month}`
            ] = String(amount);
          }
        );
      });

      setDraftValues(nextValues);
      setDirtyKeys(new Set());

      if (loadedRows.length > 0) {
        setBulkRowId(
          loadedRows[0].id
        );
      } else {
        setBulkRowId("");
      }

      /*
       * 일괄입력 기간 기본값
       */
      if (loadedPlan) {
        setBulkStartMonth(
          loadedPlan.start_month.slice(
            0,
            7
          )
        );

        setBulkEndMonth(
          loadedPlan.end_month.slice(
            0,
            7
          )
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
    void loadModel();
  }, []);

  /*
   * =========================================================
   * 셀 처리
   * =========================================================
   */

  function getCellValue(
    rowId: string,
    month: string
  ) {
    return (
      draftValues[
        `${rowId}|${month}`
      ] ?? ""
    );
  }

  function updateCell(
    rowId: string,
    month: string,
    value: string
  ) {
    const key =
      `${rowId}|${month}`;

    setDraftValues(
      (previous) => ({
        ...previous,
        [key]: value,
      })
    );

    setDirtyKeys(
      (previous) => {
        const next =
          new Set(previous);

        next.add(key);

        return next;
      }
    );

    setMessage(null);
  }

  function getRowAmount(
    row: PlanRow,
    month: string
  ) {
    return parseAmount(
      getCellValue(
        row.id,
        month
      )
    );
  }

  /*
   * =========================================================
   * 재무 계산
   * =========================================================
   */

  function getSectionTotal(
    section: Section,
    month: string
  ) {
    return rows
      .filter(
        (row) =>
          row.section === section
      )
      .reduce(
        (total, row) =>
          total +
          getRowAmount(
            row,
            month
          ),
        0
      );
  }

  function getManagementSurplus(
    month: string
  ) {
    const income =
      getSectionTotal(
        "INCOME",
        month
      );

    const livingExpense =
      getSectionTotal(
        "LIVING_EXPENSE",
        month
      );

    return income - livingExpense;
  }

  function getRemainingCash(
    month: string
  ) {
    const managementSurplus =
      getManagementSurplus(month);

    const debtPayment =
      getSectionTotal(
        "DEBT_PAYMENT",
        month
      );

    const investment =
      getSectionTotal(
        "INVESTMENT",
        month
      );

    const otherAllocation =
      getSectionTotal(
        "OTHER_ALLOCATION",
        month
      );

    return (
      managementSurplus -
      debtPayment -
      investment -
      otherAllocation
    );
  }

  /*
   * =========================================================
   * Plan 생성
   * =========================================================
   */

  async function createPlan() {
    setError(null);
    setMessage(null);

    if (!newPlanName.trim()) {
      setError(
        "Plan 이름을 입력해주세요."
      );

      return;
    }

    if (!newPlanStartMonth) {
      setError(
        "시작월을 선택해주세요."
      );

      return;
    }

    try {
      const response = await fetch(
        "/api/plan/model",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            planName:
              newPlanName.trim(),

            startMonth:
              newPlanStartMonth,
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
            "Plan 생성에 실패했습니다."
        );
      }

      setShowCreatePlan(false);

      setMessage(
        "새 Plan을 생성했습니다."
      );

      await loadModel(
        data.plan.id
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Plan 생성 중 오류가 발생했습니다."
      );
    }
  }

  /*
   * =========================================================
   * 행 추가
   * =========================================================
   */

  async function addRow() {
    if (!selectedPlan) {
      return;
    }

    if (!newRowName.trim()) {
      setError(
        "항목명을 입력해주세요."
      );

      return;
    }

    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/plan/model/rows",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            planVersionId:
              selectedPlan.id,

            section:
              newRowSection,

            rowName:
              newRowName.trim(),
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
            "항목 추가에 실패했습니다."
        );
      }

      setNewRowName("");

      setMessage(
        "재무 항목을 추가했습니다."
      );

      await loadModel(
        selectedPlan.id
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "항목 추가 중 오류가 발생했습니다."
      );
    }
  }

  /*
   * =========================================================
   * 행 수정
   * =========================================================
   */

  async function editRow(
    row: PlanRow
  ) {
    const newName =
      window.prompt(
        "새 항목명을 입력하세요.",
        row.row_name
      );

    if (
      newName === null ||
      !newName.trim()
    ) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/plan/model/rows",
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            id: row.id,
            rowName:
              newName.trim(),
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
            "항목 수정에 실패했습니다."
        );
      }

      setMessage(
        "항목명을 수정했습니다."
      );

      await loadModel(
        selectedPlan?.id
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "항목 수정 중 오류가 발생했습니다."
      );
    }
  }

  /*
   * =========================================================
   * 행 삭제
   * =========================================================
   */

  async function deleteRow(
    row: PlanRow
  ) {
    const confirmed =
      window.confirm(
        `"${row.row_name}" 항목을 삭제할까요?\n\n해당 항목에 저장된 월별 Plan 값도 함께 삭제됩니다.`
      );

    if (!confirmed) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/plan/model/rows",
        {
          method: "DELETE",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            id: row.id,
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
            "항목 삭제에 실패했습니다."
        );
      }

      setMessage(
        "재무 항목을 삭제했습니다."
      );

      await loadModel(
        selectedPlan?.id
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "항목 삭제 중 오류가 발생했습니다."
      );
    }
  }

  /*
   * =========================================================
   * 셀 저장
   * =========================================================
   */

  async function saveValues() {
    if (!selectedPlan) {
      return;
    }

    if (dirtyKeys.size === 0) {
      setMessage(
        "변경된 값이 없습니다."
      );

      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const values =
        Array.from(
          dirtyKeys
        ).map((key) => {
          const divider =
            key.indexOf("|");

          const rowId =
            key.slice(
              0,
              divider
            );

          const yearMonth =
            key.slice(
              divider + 1
            );

          return {
            rowId,
            yearMonth,

            amount:
              parseAmount(
                draftValues[key]
              ),
          };
        });

      const response = await fetch(
        "/api/plan/model/values",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            planVersionId:
              selectedPlan.id,

            values,
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
            "저장에 실패했습니다."
        );
      }

      setDirtyKeys(
        new Set()
      );

      setMessage(
        `${data.savedCount}개 셀을 저장했습니다.`
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

  /*
   * =========================================================
   * 기간 일괄입력
   * =========================================================
   */

  function applyBulkValues() {
    if (!bulkRowId) {
      setError(
        "일괄입력할 항목을 선택해주세요."
      );

      return;
    }

    if (
      !bulkStartMonth ||
      !bulkEndMonth
    ) {
      setError(
        "적용 시작월과 종료월을 선택해주세요."
      );

      return;
    }

    if (bulkAmount === "") {
      setError(
        "적용할 금액을 입력해주세요."
      );

      return;
    }

    if (
      bulkStartMonth >
      bulkEndMonth
    ) {
      setError(
        "종료월이 시작월보다 빠릅니다."
      );

      return;
    }

    const amount =
      parseAmount(bulkAmount);

    const start =
      `${bulkStartMonth}-01`;

    const end =
      `${bulkEndMonth}-01`;

    const targetMonths =
      months.filter(
        (month) =>
          month >= start &&
          month <= end
      );

    if (
      targetMonths.length === 0
    ) {
      setError(
        "Plan 기간 안의 월을 선택해주세요."
      );

      return;
    }

    setDraftValues(
      (previous) => {
        const next = {
          ...previous,
        };

        targetMonths.forEach(
          (month) => {
            next[
              `${bulkRowId}|${month}`
            ] = String(amount);
          }
        );

        return next;
      }
    );

    setDirtyKeys(
      (previous) => {
        const next =
          new Set(previous);

        targetMonths.forEach(
          (month) => {
            next.add(
              `${bulkRowId}|${month}`
            );
          }
        );

        return next;
      }
    );

    setError(null);

    setMessage(
      `${targetMonths.length}개월에 일괄 적용했습니다. 저장 버튼을 눌러 확정하세요.`
    );
  }

  /*
   * =========================================================
   * 요약행 렌더링
   * =========================================================
   */

  function SummaryRow({
    label,
    calculate,
    strong = false,
  }: {
    label: string;
    calculate: (
      month: string
    ) => number;
    strong?: boolean;
  }) {
    return (
      <tr
        className={
          strong
            ? "bg-gray-200 font-bold"
            : "bg-gray-100 font-semibold"
        }
      >
        <td
          className={
            strong
              ? "sticky left-0 z-20 border-b border-r bg-gray-200 px-3 py-2"
              : "sticky left-0 z-20 border-b border-r bg-gray-100 px-3 py-2"
          }
        />

        <td
          className={
            strong
              ? "sticky left-[110px] z-20 min-w-[190px] border-b border-r bg-gray-200 px-3 py-2 text-gray-900"
              : "sticky left-[110px] z-20 min-w-[190px] border-b border-r bg-gray-100 px-3 py-2 text-gray-800"
          }
        >
          {label}
        </td>

        {months.map(
          (month) => (
            <td
              key={month}
              className="min-w-[120px] border-b border-r px-3 py-2 text-right tabular-nums"
            >
              {formatAmount(
                calculate(month)
              )}
            </td>
          )
        )}
      </tr>
    );
  }

  /*
   * =========================================================
   * Loading
   * =========================================================
   */

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <p className="text-gray-500">
          재무모델을 불러오는 중...
        </p>
      </main>
    );
  }

  /*
   * =========================================================
   * 화면
   * =========================================================
   */

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-[1800px]">
        {/* 상단 제목 */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">
              재무계획
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              3개년 재무모델
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              36개월 재무계획을
              스프레드시트 형태로
              편집하고 관리합니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setShowCreatePlan(
                  (previous) =>
                    !previous
                )
              }
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              새 Plan
            </button>

            <button
              type="button"
              onClick={
                saveValues
              }
              disabled={
                saving ||
                !selectedPlan
              }
              className="rounded-xl bg-gray-900 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving
                ? "저장 중..."
                : dirtyKeys.size >
                    0
                  ? `저장 (${dirtyKeys.size})`
                  : "저장"}
            </button>
          </div>
        </header>

        {/* 오류 */}
        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 안내 메시지 */}
        {message && (
          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            {message}
          </div>
        )}

        {/* 새 Plan 생성 */}
        {showCreatePlan && (
          <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900">
              새 3개년 Plan
            </h2>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label>
                <span className="block text-xs font-medium text-gray-500">
                  Plan 이름
                </span>

                <input
                  value={
                    newPlanName
                  }
                  onChange={(event) =>
                    setNewPlanName(
                      event.target.value
                    )
                  }
                  className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </label>

              <label>
                <span className="block text-xs font-medium text-gray-500">
                  시작월
                </span>

                <input
                  type="month"
                  value={
                    newPlanStartMonth
                  }
                  onChange={(event) =>
                    setNewPlanStartMonth(
                      event.target.value
                    )
                  }
                  className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </label>

              <button
                type="button"
                onClick={
                  createPlan
                }
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
              >
                생성
              </button>
            </div>
          </section>
        )}

        {/* Plan 선택 */}
        {plans.length > 0 && (
          <section className="mt-6 flex flex-wrap items-end gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <label>
              <span className="block text-xs font-medium text-gray-500">
                Plan
              </span>

              <select
                value={
                  selectedPlan?.id ??
                  ""
                }
                onChange={(
                  event
                ) => {
                  if (
                    dirtyKeys.size >
                    0
                  ) {
                    const confirmed =
                      window.confirm(
                        "저장하지 않은 값이 있습니다.\nPlan을 변경할까요?"
                      );

                    if (
                      !confirmed
                    ) {
                      return;
                    }
                  }

                  void loadModel(
                    event.target
                      .value
                  );
                }}
                className="mt-1 min-w-[220px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {plans.map(
                  (plan) => (
                    <option
                      key={plan.id}
                      value={plan.id}
                    >
                      {
                        plan.plan_name
                      }
                    </option>
                  )
                )}
              </select>
            </label>

            {selectedPlan && (
              <div>
                <span className="block text-xs font-medium text-gray-500">
                  Plan 기간
                </span>

                <p className="mt-2 text-sm text-gray-700">
                  {selectedPlan.start_month.slice(
                    0,
                    7
                  )}
                  {" ~ "}
                  {selectedPlan.end_month.slice(
                    0,
                    7
                  )}
                </p>
              </div>
            )}

            <div>
              <span className="block text-xs font-medium text-gray-500">
                기간
              </span>

              <p className="mt-2 text-sm text-gray-700">
                36개월
              </p>
            </div>
          </section>
        )}

        {/* Plan 존재 */}
        {selectedPlan && (
          <>
            {/* 편집 도구 */}
            <section className="mt-6 grid gap-4 xl:grid-cols-2">
              {/* 항목 추가 */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-gray-900">
                  재무 항목 추가
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  수입, 비용,
                  대출상환, 투자 등의
                  행을 자유롭게 추가합니다.
                </p>

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label>
                    <span className="block text-xs font-medium text-gray-500">
                      구분
                    </span>

                    <select
                      value={
                        newRowSection
                      }
                      onChange={(
                        event
                      ) =>
                        setNewRowSection(
                          event.target
                            .value as Section
                        )
                      }
                      className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      {SECTION_ORDER.map(
                        (
                          section
                        ) => (
                          <option
                            key={
                              section
                            }
                            value={
                              section
                            }
                          >
                            {
                              SECTION_LABEL[
                                section
                              ]
                            }
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="min-w-[180px] flex-1">
                    <span className="block text-xs font-medium text-gray-500">
                      항목명
                    </span>

                    <input
                      value={
                        newRowName
                      }
                      onChange={(
                        event
                      ) =>
                        setNewRowName(
                          event.target
                            .value
                        )
                      }
                      placeholder="예: 급여"
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={addRow}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    항목 추가
                  </button>
                </div>
              </div>

              {/* 기간 일괄입력 */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-gray-900">
                  기간 일괄입력
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  같은 값을 여러 달에
                  한 번에 적용합니다.
                </p>

                <div className="mt-4 flex flex-wrap items-end gap-2">
                  <label>
                    <span className="block text-xs font-medium text-gray-500">
                      항목
                    </span>

                    <select
                      value={
                        bulkRowId
                      }
                      onChange={(
                        event
                      ) =>
                        setBulkRowId(
                          event.target
                            .value
                        )
                      }
                      className="mt-1 max-w-[180px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">
                        항목 선택
                      </option>

                      {rows.map(
                        (row) => (
                          <option
                            key={
                              row.id
                            }
                            value={
                              row.id
                            }
                          >
                            {
                              SECTION_LABEL[
                                row
                                  .section
                              ]
                            }{" "}
                            /{" "}
                            {
                              row.row_name
                            }
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label>
                    <span className="block text-xs font-medium text-gray-500">
                      시작월
                    </span>

                    <input
                      type="month"
                      value={
                        bulkStartMonth
                      }
                      onChange={(
                        event
                      ) =>
                        setBulkStartMonth(
                          event.target
                            .value
                        )
                      }
                      className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>

                  <label>
                    <span className="block text-xs font-medium text-gray-500">
                      종료월
                    </span>

                    <input
                      type="month"
                      value={
                        bulkEndMonth
                      }
                      onChange={(
                        event
                      ) =>
                        setBulkEndMonth(
                          event.target
                            .value
                        )
                      }
                      className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>

                  <label>
                    <span className="block text-xs font-medium text-gray-500">
                      금액
                    </span>

                    <input
                      type="number"
                      step="1"
                      value={
                        bulkAmount
                      }
                      onChange={(
                        event
                      ) =>
                        setBulkAmount(
                          event.target
                            .value
                        )
                      }
                      placeholder="0"
                      className="mt-1 w-36 rounded-lg border border-gray-300 bg-white px-3 py-2 text-right text-sm"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={
                      applyBulkValues
                    }
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    적용
                  </button>
                </div>
              </div>
            </section>

            {/* 재무모델 Grid */}
            <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      36개월 Plan
                    </h2>

                    <p className="mt-1 text-xs text-gray-500">
                      흰색 셀은 직접
                      입력하고, 회색 행은
                      자동 계산됩니다.
                    </p>
                  </div>

                  {dirtyKeys.size >
                    0 && (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                      저장되지 않은 셀{" "}
                      {
                        dirtyKeys.size
                      }
                      개
                    </span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-max border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-900 text-white">
                      <th className="sticky left-0 z-30 min-w-[110px] border-r border-gray-700 bg-gray-900 px-3 py-3 text-left font-medium">
                        구분
                      </th>

                      <th className="sticky left-[110px] z-30 min-w-[190px] border-r border-gray-700 bg-gray-900 px-3 py-3 text-left font-medium">
                        항목
                      </th>

                      {months.map(
                        (month) => (
                          <th
                            key={
                              month
                            }
                            className="min-w-[120px] border-r border-gray-700 px-3 py-3 text-right font-medium"
                          >
                            {monthLabel(
                              month
                            )}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {SECTION_ORDER.map(
                      (
                        section
                      ) => {
                        const sectionRows =
                          rows.filter(
                            (
                              row
                            ) =>
                              row.section ===
                              section
                          );

                        return (
                          <Fragment
                            key={
                              section
                            }
                          >
                            {/* 구분 헤더 */}
                            <tr className="bg-gray-50">
                              <td
                                colSpan={
                                  2 +
                                  months.length
                                }
                                className="border-b border-gray-200 px-3 py-2 font-bold text-gray-700"
                              >
                                {
                                  SECTION_LABEL[
                                    section
                                  ]
                                }
                              </td>
                            </tr>

                            {/* 사용자 입력 행 */}
                            {sectionRows.map(
                              (
                                row,
                                index
                              ) => (
                                <tr
                                  key={
                                    row.id
                                  }
                                  className="bg-white"
                                >
                                  <td className="sticky left-0 z-20 min-w-[110px] border-b border-r border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
                                    {index ===
                                    0
                                      ? SECTION_LABEL[
                                          section
                                        ]
                                      : ""}
                                  </td>

                                  <td className="sticky left-[110px] z-20 min-w-[190px] border-b border-r border-gray-200 bg-white px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="font-medium text-gray-800">
                                        {
                                          row.row_name
                                        }
                                      </span>

                                      <div className="flex shrink-0 gap-2 text-xs">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void editRow(
                                              row
                                            )
                                          }
                                          className="text-gray-400 hover:text-gray-900"
                                        >
                                          수정
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            void deleteRow(
                                              row
                                            )
                                          }
                                          className="text-gray-400 hover:text-red-600"
                                        >
                                          삭제
                                        </button>
                                      </div>
                                    </div>
                                  </td>

                                  {months.map(
                                    (
                                      month
                                    ) => {
                                      const cellKey =
                                        `${row.id}|${month}`;

                                      const dirty =
                                        dirtyKeys.has(
                                          cellKey
                                        );

                                      return (
                                        <td
                                          key={
                                            month
                                          }
                                          className="border-b border-r border-gray-200 p-0"
                                        >
                                          <input
                                            type="number"
                                            step="1"
                                            value={getCellValue(
                                              row.id,
                                              month
                                            )}
                                            onChange={(
                                              event
                                            ) =>
                                              updateCell(
                                                row.id,
                                                month,
                                                event
                                                  .target
                                                  .value
                                              )
                                            }
                                            placeholder="0"
                                            className={
                                              dirty
                                                ? "h-10 w-[120px] border-0 bg-amber-50 px-3 text-right tabular-nums text-gray-900 outline-none focus:bg-blue-50"
                                                : "h-10 w-[120px] border-0 bg-white px-3 text-right tabular-nums text-gray-900 outline-none focus:bg-blue-50"
                                            }
                                          />
                                        </td>
                                      );
                                    }
                                  )}
                                </tr>
                              )
                            )}

                            {/* 구분별 계산행 */}
                            {section ===
                              "INCOME" && (
                              <SummaryRow
                                label="총수입"
                                calculate={(
                                  month
                                ) =>
                                  getSectionTotal(
                                    "INCOME",
                                    month
                                  )
                                }
                              />
                            )}

                            {section ===
                              "LIVING_EXPENSE" && (
                              <>
                                <SummaryRow
                                  label="생활·주거비 합계"
                                  calculate={(
                                    month
                                  ) =>
                                    getSectionTotal(
                                      "LIVING_EXPENSE",
                                      month
                                    )
                                  }
                                />

                                <SummaryRow
                                  label="관리잉여"
                                  calculate={
                                    getManagementSurplus
                                  }
                                  strong
                                />
                              </>
                            )}

                            {section ===
                              "DEBT_PAYMENT" && (
                              <SummaryRow
                                label="대출상환 합계"
                                calculate={(
                                  month
                                ) =>
                                  getSectionTotal(
                                    "DEBT_PAYMENT",
                                    month
                                  )
                                }
                              />
                            )}

                            {section ===
                              "INVESTMENT" && (
                              <SummaryRow
                                label="투자 합계"
                                calculate={(
                                  month
                                ) =>
                                  getSectionTotal(
                                    "INVESTMENT",
                                    month
                                  )
                                }
                              />
                            )}

                            {section ===
                              "OTHER_ALLOCATION" && (
                              <>
                                <SummaryRow
                                  label="기타 자금배분 합계"
                                  calculate={(
                                    month
                                  ) =>
                                    getSectionTotal(
                                      "OTHER_ALLOCATION",
                                      month
                                    )
                                  }
                                />

                                <SummaryRow
                                  label="잔여자금"
                                  calculate={
                                    getRemainingCash
                                  }
                                  strong
                                />
                              </>
                            )}
                          </Fragment>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* Plan 없는 경우 */}
        {!selectedPlan && (
          <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              아직 재무 Plan이
              없습니다.
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              시작월을 지정하면
              36개월 재무계획을
              생성합니다.
            </p>

            <button
              type="button"
              onClick={() =>
                setShowCreatePlan(
                  true
                )
              }
              className="mt-5 rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white"
            >
              첫 Plan 만들기
            </button>
          </section>
        )}
      </div>
    </main>
  );
}