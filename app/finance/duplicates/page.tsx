"use client";

import {
  useEffect,
  useState,
} from "react";

type Transaction = {
  id: string;

  transaction_date:
    string;

  source_type:
    | "BANK"
    | "CARD";

  account_name:
    | string
    | null;

  counterparty:
    | string
    | null;

  description:
    | string
    | null;

  transaction_type:
    string;

  category_l1:
    | string
    | null;

  category_l2:
    | string
    | null;

  amount:
    number | string;

  include_in_ledger:
    boolean;

  review_required:
    boolean;

  source_row:
    number | null;
};

type Candidate = {
  id: string;

  reason: string;

  score: number;

  status:
    | "NOT_REVIEWED"
    | "DUPLICATE"
    | "NOT_DUPLICATE";

  transactionA:
    Transaction;

  transactionB:
    Transaction;
};

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
) {
  const amount =
    Number(value);

  const sign =
    amount > 0
      ? "+"
      : amount < 0
        ? "-"
        : "";

  return `${sign}${Math.abs(
    amount
  ).toLocaleString(
    "ko-KR"
  )}원`;
}

function TransactionCard({
  title,
  transaction,
}: {
  title: string;
  transaction: Transaction;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-semibold text-gray-400">
        {title}
      </p>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">
            {
              transaction.transaction_date
            }
            {" · "}
            {transaction.source_type ===
            "BANK"
              ? "은행"
              : "카드"}
          </p>

          <h3 className="mt-1 text-lg font-bold text-gray-900">
            {transaction.counterparty ??
              "거래처 없음"}
          </h3>
        </div>

        <p className="text-lg font-bold tabular-nums text-gray-900">
          {formatWon(
            transaction.amount
          )}
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-gray-400">
          계좌/카드
        </dt>

        <dd className="text-gray-700">
          {transaction.account_name ??
            "-"}
        </dd>

        <dt className="text-gray-400">
          거래내용
        </dt>

        <dd className="break-all text-gray-700">
          {transaction.description ??
            "-"}
        </dd>

        <dt className="text-gray-400">
          분류
        </dt>

        <dd className="text-gray-700">
          {transaction.category_l1
            ? `${transaction.category_l1}${
                transaction.category_l2
                  ? ` / ${transaction.category_l2}`
                  : ""
              }`
            : "-"}
        </dd>

        <dt className="text-gray-400">
          Excel 행
        </dt>

        <dd className="text-gray-700">
          {transaction.source_row ??
            "-"}
        </dd>
      </dl>
    </div>
  );
}

export default function DuplicateReviewPage() {
  const [
    month,
    setMonth,
  ] =
    useState(
      getCurrentMonth()
    );

  const [
    candidates,
    setCandidates,
  ] =
    useState<
      Candidate[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    scanning,
    setScanning,
  ] =
    useState(false);

  const [
    resolvingId,
    setResolvingId,
  ] =
    useState<
      string | null
    >(null);

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

  async function loadCandidates() {
    setLoading(true);
    setError(null);

    try {
      const params =
        new URLSearchParams();

      params.set(
        "month",
        month
      );

      const response =
        await fetch(
          `/api/finance/duplicates?${params.toString()}`,
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
            "중복 후보를 불러오지 못했습니다."
        );
      }

      setCandidates(
        data.candidates ??
          []
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
    void loadCandidates();
  }, [month]);

  async function scanDuplicates() {
    setScanning(true);
    setError(null);
    setMessage(null);

    try {
      const response =
        await fetch(
          "/api/finance/duplicates",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                month,
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
            "중복 후보 검색에 실패했습니다."
        );
      }

      setMessage(
        `${data.scannedCount}건을 검사해 ${data.detectedCount}개의 중복 후보 조합을 확인했습니다.`
      );

      await loadCandidates();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "검색 중 오류가 발생했습니다."
      );
    } finally {
      setScanning(false);
    }
  }

  async function resolveCandidate(
    candidateId: string,
    action:
      | "NOT_DUPLICATE"
      | "KEEP_A"
      | "KEEP_B"
  ) {
    setResolvingId(
      candidateId
    );

    setError(null);
    setMessage(null);

    try {
      const response =
        await fetch(
          "/api/finance/duplicates/resolve",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                candidateId,
                action,
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
            "중복 처리에 실패했습니다."
        );
      }

      setMessage(
        action ===
          "NOT_DUPLICATE"
          ? "두 거래를 모두 정상 거래로 확정했습니다."
          : "중복 거래를 원장에서 제외했습니다."
      );

      await loadCandidates();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "처리 중 오류가 발생했습니다."
      );
    } finally {
      setResolvingId(
        null
      );
    }
  }

  const unresolved =
    candidates.filter(
      (candidate) =>
        candidate.status ===
        "NOT_REVIEWED"
    );

  const resolved =
    candidates.filter(
      (candidate) =>
        candidate.status !==
        "NOT_REVIEWED"
    );

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">
              생활금융
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              중복 거래 검토
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              서로 다른 업로드
              파일에서 중복될 가능성이
              있는 거래를 확인합니다.
            </p>
          </div>

          <a
            href="/finance/transactions"
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
          >
            거래내역
          </a>
        </header>

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
            {message}
          </div>
        )}

        <section className="mt-6 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-end gap-3">
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

            <button
              type="button"
              onClick={
                scanDuplicates
              }
              disabled={
                scanning
              }
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {scanning
                ? "검사 중..."
                : "중복 후보 검색"}
            </button>
          </div>

          <div className="text-right">
            <p className="text-xs text-gray-500">
              미검토 후보
            </p>

            <p className="mt-1 text-2xl font-bold">
              {
                unresolved.length
              }
              건
            </p>
          </div>
        </section>

        {loading ? (
          <div className="mt-5 rounded-2xl bg-white p-10 text-center text-gray-500">
            불러오는 중...
          </div>
        ) : unresolved.length ===
          0 ? (
          <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-semibold text-gray-900">
              미검토 중복 후보가
              없습니다.
            </p>

            <p className="mt-2 text-sm text-gray-500">
              필요하면 중복 후보 검색을
              실행해주세요.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {unresolved.map(
              (candidate) => (
                <section
                  key={
                    candidate.id
                  }
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        중복 가능성{" "}
                        {
                          candidate.score
                        }
                        점
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        {
                          candidate.reason
                        }
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <TransactionCard
                      title="거래 A"
                      transaction={
                        candidate.transactionA
                      }
                    />

                    <TransactionCard
                      title="거래 B"
                      transaction={
                        candidate.transactionB
                      }
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={
                        resolvingId ===
                        candidate.id
                      }
                      onClick={() =>
                        void resolveCandidate(
                          candidate.id,
                          "NOT_DUPLICATE"
                        )
                      }
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium"
                    >
                      둘 다 정상
                    </button>

                    <button
                      type="button"
                      disabled={
                        resolvingId ===
                        candidate.id
                      }
                      onClick={() =>
                        void resolveCandidate(
                          candidate.id,
                          "KEEP_A"
                        )
                      }
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium"
                    >
                      A 유지 · B 중복
                    </button>

                    <button
                      type="button"
                      disabled={
                        resolvingId ===
                        candidate.id
                      }
                      onClick={() =>
                        void resolveCandidate(
                          candidate.id,
                          "KEEP_B"
                        )
                      }
                      className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                    >
                      B 유지 · A 중복
                    </button>
                  </div>
                </section>
              )
            )}
          </div>
        )}

        {resolved.length >
          0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">
              처리 완료
            </h2>

            <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-4 py-3">
                      거래
                    </th>

                    <th className="px-4 py-3">
                      판단
                    </th>

                    <th className="px-4 py-3">
                      근거
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {resolved.map(
                    (
                      candidate
                    ) => (
                      <tr
                        key={
                          candidate.id
                        }
                        className="border-t"
                      >
                        <td className="px-4 py-3">
                          {candidate.transactionA.counterparty ??
                            "-"}
                          {" / "}
                          {candidate.transactionB.counterparty ??
                            "-"}
                        </td>

                        <td className="px-4 py-3 font-medium">
                          {candidate.status ===
                          "DUPLICATE"
                            ? "중복"
                            : "둘 다 정상"}
                        </td>

                        <td className="px-4 py-3 text-gray-500">
                          {
                            candidate.reason
                          }
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}