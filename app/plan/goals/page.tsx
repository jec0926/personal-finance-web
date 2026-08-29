"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

type Goal = {
  id: string;
  goal_name: string;
  target_amount: number | null;
  current_amount: number;
  target_date: string | null;

  priority:
    | "HIGH"
    | "MEDIUM"
    | "LOW";

  status:
    | "ACTIVE"
    | "PAUSED"
    | "COMPLETED";

  note: string | null;

  created_at: string;
  updated_at: string;
};

type GoalForm = {
  goalName: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string;

  priority:
    | "HIGH"
    | "MEDIUM"
    | "LOW";

  status:
    | "ACTIVE"
    | "PAUSED"
    | "COMPLETED";

  note: string;
};

const emptyForm: GoalForm = {
  goalName: "",
  targetAmount: "",
  currentAmount: "0",
  targetDate: "",
  priority: "MEDIUM",
  status: "ACTIVE",
  note: "",
};

function formatWon(
  value: number | null
) {
  if (value == null) return "-";

  return `${Number(value).toLocaleString(
    "ko-KR"
  )}원`;
}

export default function GoalsPage() {
  const [goals, setGoals] =
    useState<Goal[]>([]);

  const [form, setForm] =
    useState<GoalForm>(emptyForm);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function loadGoals() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/plan/goals",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "목표를 불러오지 못했습니다."
        );
      }

      setGoals(data.goals);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "알 수 없는 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGoals();
  }, []);

  function updateForm(
    key: keyof GoalForm,
    value: string
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleSubmit(
    event: FormEvent
  ) {
    event.preventDefault();

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/plan/goals",
        {
          method:
            editingId
              ? "PATCH"
              : "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            id: editingId,

            goalName:
              form.goalName,

            targetAmount:
              form.targetAmount,

            currentAmount:
              form.currentAmount,

            targetDate:
              form.targetDate,

            priority:
              form.priority,

            status:
              form.status,

            note:
              form.note,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "저장하지 못했습니다."
        );
      }

      setForm(emptyForm);
      setEditingId(null);

      await loadGoals();
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

  function startEdit(goal: Goal) {
    setEditingId(goal.id);

    setForm({
      goalName:
        goal.goal_name,

      targetAmount:
        goal.target_amount == null
          ? ""
          : String(
              goal.target_amount
            ),

      currentAmount:
        String(
          goal.current_amount ?? 0
        ),

      targetDate:
        goal.target_date ?? "",

      priority:
        goal.priority,

      status:
        goal.status,

      note:
        goal.note ?? "",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function deleteGoal(
    goal: Goal
  ) {
    const confirmed =
      window.confirm(
        `"${goal.goal_name}" 목표를 삭제할까요?`
      );

    if (!confirmed) return;

    setError(null);

    try {
      const response = await fetch(
        "/api/plan/goals",
        {
          method: "DELETE",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            id: goal.id,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "삭제하지 못했습니다."
        );
      }

      if (editingId === goal.id) {
        cancelEdit();
      }

      await loadGoals();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "삭제 중 오류가 발생했습니다."
      );
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div>
          <p className="text-sm font-medium text-gray-500">
            재무계획
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            재무목표
          </h1>

          <p className="mt-2 text-gray-500">
            중장기 재무목표를 직접 등록하고
            진행상황을 관리합니다.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingId
              ? "목표 수정"
              : "새 목표 추가"}
          </h2>

          <form
            onSubmit={handleSubmit}
            className="mt-6 grid gap-5 md:grid-cols-2"
          >
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                목표명
              </span>

              <input
                value={
                  form.goalName
                }
                onChange={(e) =>
                  updateForm(
                    "goalName",
                    e.target.value
                  )
                }
                placeholder="예: 주택 준비자금"
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-gray-500"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                목표일
              </span>

              <input
                type="date"
                value={
                  form.targetDate
                }
                onChange={(e) =>
                  updateForm(
                    "targetDate",
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-gray-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                목표금액
              </span>

              <input
                type="number"
                min="0"
                value={
                  form.targetAmount
                }
                onChange={(e) =>
                  updateForm(
                    "targetAmount",
                    e.target.value
                  )
                }
                placeholder="50000000"
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-gray-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                현재금액
              </span>

              <input
                type="number"
                min="0"
                value={
                  form.currentAmount
                }
                onChange={(e) =>
                  updateForm(
                    "currentAmount",
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-gray-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                우선순위
              </span>

              <select
                value={
                  form.priority
                }
                onChange={(e) =>
                  updateForm(
                    "priority",
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3"
              >
                <option value="HIGH">
                  높음
                </option>

                <option value="MEDIUM">
                  보통
                </option>

                <option value="LOW">
                  낮음
                </option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                상태
              </span>

              <select
                value={form.status}
                onChange={(e) =>
                  updateForm(
                    "status",
                    e.target.value
                  )
                }
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3"
              >
                <option value="ACTIVE">
                  진행 중
                </option>

                <option value="PAUSED">
                  보류
                </option>

                <option value="COMPLETED">
                  완료
                </option>
              </select>
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-gray-700">
                메모
              </span>

              <textarea
                value={form.note}
                onChange={(e) =>
                  updateForm(
                    "note",
                    e.target.value
                  )
                }
                rows={3}
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-gray-500"
              />
            </label>

            <div className="flex gap-3 md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving
                  ? "저장 중..."
                  : editingId
                  ? "수정 저장"
                  : "목표 저장"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={
                    cancelEdit
                  }
                  className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700"
                >
                  취소
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                등록된 목표
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                총 {goals.length}개
              </p>
            </div>
          </div>

          {loading ? (
            <div className="mt-4 rounded-2xl bg-white p-8 text-center text-gray-500 shadow-sm">
              불러오는 중...
            </div>
          ) : goals.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-white p-8 text-center text-gray-500 shadow-sm">
              등록된 재무목표가 없습니다.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {goals.map((goal) => {
                const target =
                  Number(
                    goal.target_amount
                  ) || 0;

                const current =
                  Number(
                    goal.current_amount
                  ) || 0;

                const progress =
                  target > 0
                    ? Math.min(
                        100,
                        (current /
                          target) *
                          100
                      )
                    : 0;

                return (
                  <article
                    key={goal.id}
                    className="rounded-2xl bg-white p-6 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {
                            goal.goal_name
                          }
                        </h3>

                        <p className="mt-1 text-sm text-gray-500">
                          목표일{" "}
                          {goal.target_date ??
                            "미설정"}
                        </p>
                      </div>

                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                        {goal.status ===
                        "ACTIVE"
                          ? "진행 중"
                          : goal.status ===
                            "PAUSED"
                          ? "보류"
                          : "완료"}
                      </span>
                    </div>

                    <div className="mt-6">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-xs text-gray-500">
                            현재
                          </p>

                          <p className="mt-1 text-xl font-bold text-gray-900">
                            {formatWon(
                              current
                            )}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-gray-500">
                            목표
                          </p>

                          <p className="mt-1 font-semibold text-gray-700">
                            {formatWon(
                              goal.target_amount
                            )}
                          </p>
                        </div>
                      </div>

                      {target > 0 && (
                        <>
                          <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-gray-900"
                              style={{
                                width: `${progress}%`,
                              }}
                            />
                          </div>

                          <p className="mt-2 text-right text-xs text-gray-500">
                            {progress.toFixed(
                              1
                            )}
                            %
                          </p>
                        </>
                      )}
                    </div>

                    {goal.note && (
                      <p className="mt-5 text-sm text-gray-500">
                        {goal.note}
                      </p>
                    )}

                    <div className="mt-6 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          startEdit(
                            goal
                          )
                        }
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
                      >
                        수정
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          deleteGoal(
                            goal
                          )
                        }
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}