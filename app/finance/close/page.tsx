"use client";

import {
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { PageHeader, StatusBadge } from "@/components/ui/finance-ui";

type CloseStatus =
  | "PARTIAL"
  | "CLOSE_READY"
  | "CLOSED";

type CloseInfo = {
  month: string;

  status:
    CloseStatus;

  ledgerTransactionCount:
    number;

  bankTransactionCount:
    number;

  cardTransactionCount:
    number;

  reviewRequiredCount:
    number;

  duplicateUnreviewedCount:
    number;

  snapshotCount:
    number;

  closedAt:
    string | null;

  reopenedAt:
    string | null;
};

const STATUS_LABEL:
  Record<
    CloseStatus,
    string
  > = {
    PARTIAL:
      "검토 중",

    CLOSE_READY:
      "마감 가능",

    CLOSED:
      "마감 완료",
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

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return "-";
  }

  return new Date(
    value
  ).toLocaleString(
    "ko-KR"
  );
}

export default function FinanceClosePage() {
  const [
    month,
    setMonth,
  ] =
    useState(
      getCurrentMonth()
    );

  const [
    closeInfo,
    setCloseInfo,
  ] =
    useState<
      CloseInfo | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    processing,
    setProcessing,
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

  async function loadCloseInfo() {
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
          `/api/finance/close?${params.toString()}`,
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
            "월마감 상태를 불러오지 못했습니다."
        );
      }

      setCloseInfo(
        data
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
    const timer = window.setTimeout(() => { void loadCloseInfo(); }, 0);
    return () => window.clearTimeout(timer);
  }, [month]);

  async function runAction(
    action:
      | "CLOSE"
      | "REOPEN"
  ) {
    setProcessing(true);
    setError(null);
    setMessage(null);

    try {
      const response =
        await fetch(
          "/api/finance/close/action",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                month,
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
            "월마감 처리에 실패했습니다."
        );
      }

      setMessage(
        action ===
          "CLOSE"
          ? `월마감이 완료되었습니다. Actual Snapshot ${data.snapshotCount ?? 0}개 집계행을 생성했습니다.`
          : "월마감을 다시 열었습니다."
      );

      await loadCloseInfo();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "처리 중 오류가 발생했습니다."
      );
    } finally {
      setProcessing(false);
    }
  }

  return (
    <main className="finance-page">
      <div className="mx-auto w-full max-w-5xl">

        <PageHeader eyebrow="내 돈 관리" title="월마감" description="거래와 예외 처리를 마친 뒤 이번 달 실적을 확정합니다." actions={<Link href="/finance/transactions" className="finance-secondary">거래내역</Link>} />

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

        <section className="mt-7 border border-gray-200 bg-white">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 p-5">

            <label>
              <span className="block text-xs font-medium text-gray-500">
                마감 월
              </span>

              <input
                type="month"
                value={month}
                onChange={(
                  event
                ) =>
                  setMonth(
                    event.target.value
                  )
                }
                className="finance-control mt-1"
              />
            </label>

            {closeInfo && (
              <div className="text-right">
                <p className="text-xs text-gray-500">
                  상태
                </p>

                <p className="mt-1 text-xl font-bold text-gray-900">
                  {
                    STATUS_LABEL[
                      closeInfo.status
                    ]
                  }
                </p>
              </div>
            )}
          </div>

          {closeInfo && <div className="grid gap-px border-b border-gray-200 bg-gray-200 sm:grid-cols-4">
            <WorkflowStep label="거래 업로드" detail={`${closeInfo.ledgerTransactionCount}건`} ready={closeInfo.ledgerTransactionCount > 0} href="/finance/upload" />
            <WorkflowStep label="확인 필요 거래" detail={`${closeInfo.reviewRequiredCount}건`} ready={closeInfo.reviewRequiredCount === 0} href="/finance/review" />
            <WorkflowStep label="중복 검토" detail={`${closeInfo.duplicateUnreviewedCount}건`} ready={closeInfo.duplicateUnreviewedCount === 0} href="/finance/duplicates" />
            <WorkflowStep label="월 실적 확정" detail={STATUS_LABEL[closeInfo.status]} ready={closeInfo.status === "CLOSED"} current={closeInfo.status === "CLOSE_READY"} />
          </div>}

          {loading ? (
            <div className="p-10 text-center text-gray-500">
              마감 상태를 확인하는 중...
            </div>
          ) : closeInfo ? (
            <>
              <table className="w-full text-sm">
                <tbody>

                  <tr className="border-b border-gray-100">
                    <td className="px-5 py-4 text-gray-500">
                      전체 원장 거래
                    </td>

                    <td className="px-5 py-4 text-right font-semibold">
                      {
                        closeInfo.ledgerTransactionCount
                      }
                      건
                    </td>
                  </tr>

                  <tr className="border-b border-gray-100">
                    <td className="px-5 py-4 text-gray-500">
                      은행 거래
                    </td>

                    <td className="px-5 py-4 text-right">
                      {
                        closeInfo.bankTransactionCount
                      }
                      건
                    </td>
                  </tr>

                  <tr className="border-b border-gray-100">
                    <td className="px-5 py-4 text-gray-500">
                      카드 거래
                    </td>

                    <td className="px-5 py-4 text-right">
                      {
                        closeInfo.cardTransactionCount
                      }
                      건
                    </td>
                  </tr>

                  <tr className="border-b border-gray-100">
                    <td className="px-5 py-4 text-gray-500">
                      확인 필요 거래
                    </td>

                    <td className="px-5 py-4 text-right">
                      <span
                        className={
                          closeInfo.reviewRequiredCount ===
                          0
                            ? "font-semibold text-gray-900"
                            : "font-semibold text-red-600"
                        }
                      >
                        {
                          closeInfo.reviewRequiredCount
                        }
                        건
                      </span>
                    </td>
                  </tr>

                  <tr className="border-b border-gray-100">
                    <td className="px-5 py-4 text-gray-500">
                      미검토 중복 후보
                    </td>

                    <td className="px-5 py-4 text-right">
                      <span
                        className={
                          closeInfo.duplicateUnreviewedCount ===
                          0
                            ? "font-semibold text-gray-900"
                            : "font-semibold text-red-600"
                        }
                      >
                        {
                          closeInfo.duplicateUnreviewedCount
                        }
                        건
                      </span>
                    </td>
                  </tr>

                  {closeInfo.status ===
                    "CLOSED" && (
                    <>
                      <tr className="border-b border-gray-100">
                        <td className="px-5 py-4 text-gray-500">
                          Actual Snapshot
                        </td>

                        <td className="px-5 py-4 text-right">
                          {
                            closeInfo.snapshotCount
                          }
                          개 집계행
                        </td>
                      </tr>

                      <tr>
                        <td className="px-5 py-4 text-gray-500">
                          마감 일시
                        </td>

                        <td className="px-5 py-4 text-right">
                          {formatDateTime(
                            closeInfo.closedAt
                          )}
                        </td>
                      </tr>
                    </>
                  )}

                </tbody>
              </table>

              <div className="border-t border-gray-200 p-5">

                {closeInfo.status ===
                  "PARTIAL" && (
                  <div>
                    <p className="font-medium text-gray-900">
                      아직 마감할 수 없습니다.
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      확인 필요 거래와 미검토 중복 후보를 모두 처리해주세요.
                    </p>

                    <div className="mt-4 flex gap-2">
                      <a
                        href="/finance/review"
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium"
                      >
                        거래 검토
                      </a>

                      <a
                        href="/finance/duplicates"
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium"
                      >
                        중복 검토
                      </a>
                    </div>
                  </div>
                )}

                {closeInfo.status ===
                  "CLOSE_READY" && (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        마감 가능한 상태입니다.
                      </p>

                      <p className="mt-1 text-sm text-gray-500">
                        마감하면 현재 거래 분류를 기준으로 Actual Snapshot이 생성됩니다.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={
                        processing
                      }
                      onClick={() =>
                        void runAction(
                          "CLOSE"
                        )
                      }
                      className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {processing
                        ? "마감 중..."
                        : `${month} 월마감`}
                    </button>
                  </div>
                )}

                {closeInfo.status ===
                  "CLOSED" && (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        마감 완료
                      </p>

                      <p className="mt-1 text-sm text-gray-500">
                        해당 월의 Actual이 확정되어 있습니다.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={
                        processing
                      }
                      onClick={() => {
                        const confirmed =
                          window.confirm(
                            "월마감을 다시 열면 기존 Actual Snapshot이 삭제됩니다. 계속하시겠습니까?"
                          );

                        if (
                          confirmed
                        ) {
                          void runAction(
                            "REOPEN"
                          );
                        }
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-700 disabled:opacity-50"
                    >
                      {processing
                        ? "처리 중..."
                        : "마감 다시 열기"}
                    </button>
                  </div>
                )}

              </div>
            </>
          ) : null}
        </section>

      </div>
    </main>
  );
}

function WorkflowStep({ label, detail, ready, current = false, href }: { label: string; detail: string; ready: boolean; current?: boolean; href?: string }) {
  const content = <div className="flex min-h-20 items-center justify-between gap-3 bg-white px-4 py-4 sm:block sm:min-h-24">
    <StatusBadge tone={ready ? "success" : current ? "info" : "warning"}>{ready ? "완료" : current ? "진행 가능" : "확인 필요"}</StatusBadge>
    <div className="sm:mt-3"><p className="text-sm font-semibold text-gray-900">{label}</p><p className="mt-0.5 text-xs text-gray-500">{detail}</p></div>
  </div>;
  return href ? <Link href={href} className="block transition hover:bg-gray-50">{content}</Link> : content;
}
