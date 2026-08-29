"use client";

import Link from "next/link";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MoneyValue, PageHeader, StatusBadge } from "@/components/ui/finance-ui";

type Summary = {
  income: number;

  expense: number;

  refunds: number;

  reimbursements: number;

  livingExpense:
    number;

  managementSurplus:
    number;

  debtPayment:
    number;

  investmentTransfer:
    number;

  residualCash:
    number;
};

type Category = {
  category: string;
  amount: number;
};

type RecentTransaction = {
  id: string;

  transaction_date:
    string;

  source_type:
    "BANK" | "CARD";

  counterparty:
    string | null;

  description:
    string | null;

  transaction_type:
    string;

  category_l1:
    string | null;

  amount:
    number | string;
};

type DashboardData = {
  month: string;

  basis:
    "CLOSED"
    | "PROVISIONAL";

  closeStatus:
    string;

  closedAt:
    string | null;

  summary:
    Summary;

  categories:
    Category[];

  transactionCount:
    number;

  reviewRequiredCount:
    number;

  duplicateUnreviewedCount:
    number;

  workflowStatus:
    string;

  nextAction: {
    label: string;
    href: string;
  };

  recentTransactions:
    RecentTransaction[];

  availableMonths:
    string[];
};

type TrendRow = {
  month: string;

  income: number;

  livingExpense:
    number;

  managementSurplus:
    number;

  debtPayment:
    number;

  investmentTransfer:
    number;

  residualCash:
    number;
};

const TYPE_LABEL:
  Record<string, string> = {
    EXPENSE:
      "지출",

    INCOME:
      "수입",

    CARD_SETTLEMENT:
      "카드대금",

    DEBT_PAYMENT:
      "대출상환",

    INVESTMENT_TRANSFER:
      "투자",

    INTERNAL_TRANSFER:
      "계좌이체",

    REFUND:
      "환불",

    REIMBURSEMENT:
      "비용정산",

    OTHER:
      "기타",

    REVIEW_REQUIRED:
      "확인 필요",
  };

function currentMonth() {
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

function won(
  value: number
) {
  return `${Math.round(
    value
  ).toLocaleString(
    "ko-KR"
  )}원`;
}

function compactWon(
  value: number
) {
  const absolute =
    Math.abs(
      value
    );

  if (
    absolute >=
    100000000
  ) {
    return `${(
      value /
      100000000
    ).toFixed(1)}억`;
  }

  if (
    absolute >=
    10000
  ) {
    return `${Math.round(
      value /
      10000
    ).toLocaleString()}만`;
  }

  return Math.round(
    value
  ).toLocaleString();
}

function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function HomePage() {
  const [
    month,
    setMonth,
  ] =
    useState(
      currentMonth()
    );

  const [
    dashboard,
    setDashboard,
  ] =
    useState<
      DashboardData | null
    >(null);

  const [
    trend,
    setTrend,
  ] =
    useState<
      TrendRow[]
    >([]);

  const [comparison, setComparison] = useState<DashboardData[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  async function loadDashboard(
    selectedMonth:
      string
  ) {
    setLoading(true);
    setError(null);

    try {
      const previousMonths = [-1, -2, -3].map((offset) => shiftMonth(selectedMonth, offset));
      const [summaryResponse, trendResponse, ...comparisonResponses] =
        await Promise.all([
          fetch(
            `/api/dashboard/summary?month=${selectedMonth}`,
            {
              cache:
                "no-store",
            }
          ),

          fetch(
            "/api/dashboard/trend?months=12",
            {
              cache:
                "no-store",
            }
          ),
          ...previousMonths.map((previousMonth) => fetch(`/api/dashboard/summary?month=${previousMonth}`, { cache: "no-store" })),
        ]);

      const summaryData =
        await summaryResponse.json();

      const trendData =
        await trendResponse.json();

      const comparisonData = await Promise.all(comparisonResponses.map((response) => response.json()));

      if (
        !summaryResponse.ok ||
        !summaryData.success
      ) {
        throw new Error(
          summaryData.error ??
            "대시보드를 불러오지 못했습니다."
        );
      }

      if (
        !trendResponse.ok ||
        !trendData.success
      ) {
        throw new Error(
          trendData.error ??
            "월별 추이를 불러오지 못했습니다."
        );
      }

      setDashboard(
        summaryData
      );

      setTrend(
        trendData.trend ??
        []
      );

      setComparison(comparisonData.filter((item) => item.success));
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
    const timer = window.setTimeout(() => { void loadDashboard(month); }, 0);
    return () => window.clearTimeout(timer);
  }, [month]);

  /*
   * 현재월 데이터가 하나도 없지만
   * 과거 업로드 월이 있다면
   * 가장 최근 월로 자동 이동.
   */
  useEffect(() => {
    if (
      !dashboard ||
      dashboard.transactionCount >
        0
    ) {
      return;
    }

    const latest =
      dashboard.availableMonths[
        0
      ];

    if (
      latest &&
      latest !==
        month
    ) {
      const timer = window.setTimeout(() => setMonth(latest), 0);
      return () => window.clearTimeout(timer);
    }
  }, [
    dashboard,
    month,
  ]);

  const topCategories =
    useMemo(
      () =>
        (
          dashboard?.categories ??
          []
        ).slice(
          0,
          8
        ),
      [
        dashboard,
      ]
    );

  const previousDashboard = comparison[0];
  const previousLiving = previousDashboard?.summary.livingExpense ?? 0;
  const livingChange = (dashboard?.summary.livingExpense ?? 0) - previousLiving;
  const livingRate = previousLiving ? (livingChange / previousLiving) * 100 : null;
  const recentAverage = comparison.length ? comparison.reduce((sum, item) => sum + item.summary.livingExpense, 0) / comparison.length : 0;
  const categoryComparison = (dashboard?.categories ?? []).map((category) => {
    const previous = previousDashboard?.categories.find((item) => item.category === category.category)?.amount ?? 0;
    const change = category.amount - previous;
    return { ...category, previous, change, rate: previous ? (change / previous) * 100 : null };
  });

  if (
    loading &&
    !dashboard
  ) {
    return (
      <main className="p-6 md:p-8">
        <div className="mx-auto max-w-7xl text-sm text-gray-500">
          재무 현황을 불러오는 중...
        </div>
      </main>
    );
  }

  return (
    <main className="finance-page">
      <div className="finance-container">

        {/* Header */}
        <PageHeader eyebrow="개인 재무관리" title="재무 현황" description="이번 달의 흐름과 남은 할 일을 한눈에 확인하세요." actions={<>
            <label>
              <span className="sr-only">기준 월</span>
              <input
                type="month"
                value={
                  month
                }
                onChange={(
                  event
                ) =>
                  setMonth(
                    event.target
                      .value
                  )
                }
                className="finance-control"
              />
            </label>

            <Link
              href="/finance/upload"
              className="finance-primary"
            >
              거래 업로드
            </Link>
          </>}/>

        {error && (
          <div className="mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {dashboard && (
          <>
            {/* Basis / Workflow */}
            <section className="mt-7 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-5">
              <div className="flex items-center gap-3">
                <StatusBadge tone={dashboard.basis === "CLOSED" ? "success" : "warning"}>
                  {dashboard.basis ===
                  "CLOSED"
                    ? "마감 Actual"
                    : "잠정 실적"}
                </StatusBadge>

                <p className="text-sm text-gray-600">
                  {
                    dashboard.transactionCount
                  }
                  건 거래
                </p>
              </div>

              <Link
                href={
                  dashboard.nextAction.href
                }
                className="text-sm font-semibold text-gray-900 underline underline-offset-4"
              >
                {
                  dashboard.nextAction.label
                }
                {" →"}
              </Link>
            </section>

            <section className="py-9 sm:py-11">
              <p className="text-sm font-medium text-gray-500">이번 달 잔여자금</p>
              <MoneyValue value={dashboard.summary.residualCash} className="mt-2 block text-4xl font-semibold text-gray-950 sm:text-5xl" />
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><span className={livingChange <= 0 ? "font-semibold text-emerald-700" : "font-semibold text-gray-700"}>생활비 전월 대비 {livingChange >= 0 ? "+" : ""}{won(livingChange)}</span><span className="text-gray-500">최근 3개월 평균 {won(recentAverage)}</span></div>
            </section>

            {/* KPI */}
            <section className="mt-5 overflow-hidden border border-gray-200 bg-white">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5">

                {[
                  {
                    label:
                      "총수입",

                    value:
                      dashboard.summary.income,
                  },
                  {
                    label:
                      "생활·주거 순비용",

                    value:
                      dashboard.summary.livingExpense,
                  },
                  {
                    label:
                      "관리잉여",

                    value:
                      dashboard.summary.managementSurplus,
                  },
                  {
                    label:
                      "대출상환",

                    value:
                      dashboard.summary.debtPayment,
                  },
                  {
                    label:
                      "투자금이체",

                    value:
                      dashboard.summary.investmentTransfer,
                  },
                ].map(
                  (
                    item,
                    index
                  ) => (
                    <div
                      key={
                        item.label
                      }
                      className={
                        index === 4
                          ? "p-5"
                          : "border-r border-gray-100 p-5"
                      }
                    >
                      <p className="text-xs text-gray-500">
                        {
                          item.label
                        }
                      </p>

                      <p className="mt-2 text-lg font-bold tabular-nums text-gray-900">
                        {won(
                          item.value
                        )}
                      </p>
                    </div>
                  )
                )}

              </div>
            </section>

            <section className="mt-5 grid gap-4 border border-gray-200 bg-white p-5 sm:grid-cols-3">
              <div><p className="text-xs text-gray-500">전월 대비 생활비</p><p className="mt-2 text-lg font-bold tabular-nums">{livingChange >= 0 ? "+" : ""}{won(livingChange)}</p><p className="mt-1 text-xs text-gray-500">{livingRate === null ? "비교할 전월 실적 없음" : `${livingRate >= 0 ? "+" : ""}${livingRate.toFixed(1)}%`}</p></div>
              <div><p className="text-xs text-gray-500">최근 3개월 평균</p><p className="mt-2 text-lg font-bold tabular-nums">{won(recentAverage)}</p><p className="mt-1 text-xs text-gray-500">각 월의 마감 상태에 맞는 기준으로 계산</p></div>
              <div><p className="text-xs text-gray-500">평균 대비</p><p className="mt-2 text-lg font-bold tabular-nums">{(dashboard.summary.livingExpense - recentAverage) >= 0 ? "+" : ""}{won(dashboard.summary.livingExpense - recentAverage)}</p><p className="mt-1 text-xs text-gray-500">현재 월은 {dashboard.basis === "CLOSED" ? "마감 실적" : "잠정 실적"}</p></div>
            </section>

            {/* Charts */}
            <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.6fr)]">

              {/* Trend */}
              <div className="border border-gray-200 bg-white p-5">
                <div>
                  <h2 className="font-semibold text-gray-900">
                    월별 실적 추이
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    마감 완료된 Actual만 비교합니다.
                  </p>
                </div>

                {trend.length ===
                0 ? (
                  <div className="flex h-72 items-center justify-center text-sm text-gray-400">
                    마감된 월 데이터가 없습니다.
                  </div>
                ) : (
                  <div className="mt-5 h-72">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <LineChart
                        data={
                          trend
                        }
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                        />

                        <XAxis
                          dataKey="month"
                          tick={{
                            fontSize:
                              12,
                          }}
                        />

                        <YAxis
                          tickFormatter={
                            compactWon
                          }
                          tick={{
                            fontSize:
                              12,
                          }}
                        />

                        <Tooltip
                          formatter={(
                            value
                          ) =>
                            won(
                              Number(
                                value
                              )
                            )
                          }
                        />

                        <Legend />

                        <Line
                          type="monotone"
                          dataKey="income"
                          name="총수입"
                          stroke="#111827"
                          strokeWidth={
                            2
                          }
                          dot
                        />

                        <Line
                          type="monotone"
                          dataKey="livingExpense"
                          name="생활·주거비"
                          stroke="#6b7280"
                          strokeWidth={
                            2
                          }
                          dot
                        />

                        <Line
                          type="monotone"
                          dataKey="managementSurplus"
                          name="관리잉여"
                          stroke="#9ca3af"
                          strokeWidth={
                            2
                          }
                          dot
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Category */}
              <div className="border border-gray-200 bg-white p-5">
                <h2 className="font-semibold text-gray-900">
                  생활비 구성
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  환불·비용정산 차감 후 대분류 기준
                </p>

                {topCategories.length ===
                0 ? (
                  <div className="flex h-72 items-center justify-center text-sm text-gray-400">
                    생활비 데이터가 없습니다.
                  </div>
                ) : (
                  <div className="mt-5 h-72">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <BarChart
                        data={
                          topCategories
                        }
                        layout="vertical"
                        margin={{
                          left: 20,
                        }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                        />

                        <XAxis
                          type="number"
                          tickFormatter={
                            compactWon
                          }
                          tick={{
                            fontSize:
                              11,
                          }}
                        />

                        <YAxis
                          type="category"
                          dataKey="category"
                          width={
                            70
                          }
                          tick={{
                            fontSize:
                              11,
                          }}
                        />

                        <Tooltip
                          formatter={(
                            value
                          ) =>
                            won(
                              Number(
                                value
                              )
                            )
                          }
                        />

                        <Bar
                          dataKey="amount"
                          name="생활비"
                          fill="#4b5563"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

            </section>

            <section className="mt-5 overflow-hidden border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-5 py-4"><h2 className="font-semibold">카테고리 전월 비교</h2><p className="mt-1 text-xs text-gray-500">카테고리를 선택하면 해당 월의 거래내역으로 이동합니다.</p></div>
              <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-5 py-3">카테고리</th><th className="px-5 py-3 text-right">이번 달</th><th className="px-5 py-3 text-right">전월</th><th className="px-5 py-3 text-right">증감</th><th className="px-5 py-3 text-right">증감률</th></tr></thead><tbody>{categoryComparison.map((row) => <tr key={row.category} className="border-t border-gray-100"><td className="px-5 py-3 font-medium"><Link className="underline-offset-4 hover:underline" href={`/finance/transactions?month=${month}&categoryL1=${encodeURIComponent(row.category)}`}>{row.category}</Link></td><td className="px-5 py-3 text-right tabular-nums">{won(row.amount)}</td><td className="px-5 py-3 text-right tabular-nums text-gray-500">{won(row.previous)}</td><td className="px-5 py-3 text-right tabular-nums">{row.change >= 0 ? "+" : ""}{won(row.change)}</td><td className="px-5 py-3 text-right tabular-nums text-gray-500">{row.rate === null ? "신규" : `${row.rate >= 0 ? "+" : ""}${row.rate.toFixed(1)}%`}</td></tr>)}</tbody></table></div>
            </section>

            {/* Cash allocation + Workflow */}
            <section className="mt-5 grid gap-5 lg:grid-cols-2">

              <div className="border border-gray-200 bg-white p-5">
                <h2 className="font-semibold text-gray-900">
                  자금배분
                </h2>

                <table className="mt-4 w-full text-sm">
                  <tbody>
                    {[
                      {
                        label:
                          "생활·주거 순비용",

                        value:
                          dashboard.summary.livingExpense,
                      },
                      {
                        label:
                          "대출상환",

                        value:
                          dashboard.summary.debtPayment,
                      },
                      {
                        label:
                          "투자금이체",

                        value:
                          dashboard.summary.investmentTransfer,
                      },
                      {
                        label:
                          "잔여자금",

                        value:
                          dashboard.summary.residualCash,
                      },
                    ].map(
                      (
                        item
                      ) => (
                        <tr
                          key={
                            item.label
                          }
                          className="border-b border-gray-100 last:border-0"
                        >
                          <td className="py-3 text-gray-500">
                            {
                              item.label
                            }
                          </td>

                          <td className="py-3 text-right font-semibold tabular-nums">
                            {won(
                              item.value
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">
                    월 처리 상태
                  </h2>

                  <Link
                    href="/finance/close"
                    className="text-xs font-medium text-gray-500 underline"
                  >
                    월마감 관리
                  </Link>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-100 py-2">
                    <span className="text-sm text-gray-500">
                      거래 데이터
                    </span>

                    <span className="text-sm font-semibold">
                      {
                        dashboard.transactionCount
                      }
                      건
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-gray-100 py-2">
                    <span className="text-sm text-gray-500">
                      확인 필요
                    </span>

                    <span
                      className={
                        dashboard.reviewRequiredCount >
                        0
                          ? "text-sm font-semibold text-amber-700"
                          : "text-sm font-semibold text-gray-900"
                      }
                    >
                      {
                        dashboard.reviewRequiredCount
                      }
                      건
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-b border-gray-100 py-2">
                    <span className="text-sm text-gray-500">
                      중복 후보
                    </span>

                    <span
                      className={
                        dashboard.duplicateUnreviewedCount >
                        0
                          ? "text-sm font-semibold text-amber-700"
                          : "text-sm font-semibold text-gray-900"
                      }
                    >
                      {
                        dashboard.duplicateUnreviewedCount
                      }
                      건
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-500">
                      월 상태
                    </span>

                    <span className="text-sm font-semibold">
                      {dashboard.basis ===
                      "CLOSED"
                        ? "마감 완료"
                        : dashboard.workflowStatus ===
                            "READY_TO_CLOSE"
                          ? "마감 가능"
                          : "처리 중"}
                    </span>
                  </div>
                </div>

                <Link
                  href={
                    dashboard.nextAction.href
                  }
                  className="mt-5 block rounded-lg bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white"
                >
                  {
                    dashboard.nextAction.label
                  }
                </Link>
              </div>

            </section>

            {/* Recent transactions */}
            <section className="mt-5 overflow-hidden border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-gray-900">
                    최근 거래
                  </h2>
                </div>

                <Link
                  href="/finance/transactions"
                  className="text-xs font-medium text-gray-500 underline"
                >
                  전체 보기
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr>
                      <th className="px-5 py-3">
                        일자
                      </th>

                      <th className="px-5 py-3">
                        거래처
                      </th>

                      <th className="px-5 py-3">
                        유형
                      </th>

                      <th className="px-5 py-3">
                        분류
                      </th>

                      <th className="px-5 py-3 text-right">
                        금액
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {dashboard.recentTransactions.map(
                      (
                        transaction
                      ) => (
                        <tr
                          key={
                            transaction.id
                          }
                          className="border-t border-gray-100"
                        >
                          <td className="whitespace-nowrap px-5 py-3 text-gray-500">
                            {
                              transaction.transaction_date
                            }
                          </td>

                          <td className="px-5 py-3 font-medium text-gray-900">
                            {transaction.counterparty ??
                              transaction.description ??
                              "-"}
                          </td>

                          <td className="px-5 py-3 text-gray-600">
                            {TYPE_LABEL[
                              transaction.transaction_type
                            ] ??
                              transaction.transaction_type}
                          </td>

                          <td className="px-5 py-3 text-gray-500">
                            {
                              transaction.category_l1 ??
                              "-"
                            }
                          </td>

                          <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums">
                            {Number(
                              transaction.amount
                            ) >=
                            0
                              ? "+"
                              : "-"}

                            {Math.abs(
                              Number(
                                transaction.amount
                              )
                            ).toLocaleString(
                              "ko-KR"
                            )}
                            원
                          </td>
                        </tr>
                      )
                    )}

                    {dashboard.recentTransactions.length ===
                      0 && (
                      <tr>
                        <td
                          colSpan={
                            5
                          }
                          className="px-5 py-10 text-center text-gray-400"
                        >
                          거래내역이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

      </div>
    </main>
  );
}
