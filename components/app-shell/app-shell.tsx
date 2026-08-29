"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type {
  ReactNode,
} from "react";

type Props = {
  children: ReactNode;
};

type NavItem = {
  label: string;
  href: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAVIGATION: NavGroup[] = [
  {
    label: "홈",
    items: [
      {
        label: "대시보드",
        href: "/",
      },
    ],
  },
  {
    label: "내 돈 관리",
    items: [
      {
        label: "거래내역",
        href: "/finance/transactions",
      },
      {
        label: "월마감",
        href: "/finance/close",
      },
    ],
  },
  {
    label: "설정",
    items: [
      { label: "카테고리", href: "/finance/categories" },
      { label: "자동분류 규칙", href: "/finance/rules" },
    ],
  },
  {
    label: "재무계획",
    items: [
      {
        label: "재무 모델",
        href: "/plan/model",
      },
    ],
  },
];

function isActivePath(
  pathname: string,
  href: string
) {
  if (href === "/") {
    return pathname === "/";
  }

  return (
    pathname === href ||
    pathname.startsWith(
      `${href}/`
    )
  );
}

export default function AppShell({
  children,
}: Props) {
  const pathname =
    usePathname();

  /*
   * 로그인 화면에는
   * 서비스 Navigation을 노출하지 않는다.
   */
  if (
    pathname === "/login" ||
    pathname.startsWith(
      "/api/"
    )
  ) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] lg:flex">

      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-gray-200/80 bg-white lg:block">
        <div className="sticky top-0 flex h-screen flex-col px-5 py-6">

          <div className="pb-6">
            <Link
              href="/"
              className="block"
            >
              <p className="text-[17px] font-semibold tracking-[-0.02em] text-gray-950">
                나의 재무
              </p>

              <p className="mt-1 text-xs text-gray-400">
                PERSONAL FINANCE
              </p>
            </Link>
          </div>

          <nav className="mt-2 space-y-7">
            {NAVIGATION.map(
              (group) => (
                <div
                  key={
                    group.label
                  }
                >
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                    {group.label}
                  </p>

                  <div className="mt-2 space-y-1">
                    {group.items.map(
                      (item) => {
                        const active =
                          isActivePath(
                            pathname,
                            item.href
                          );

                        return (
                          <Link
                            key={
                              item.href
                            }
                            href={
                              item.href
                            }
                            className={
                              active
                                ? "block rounded-lg bg-gray-950 px-3 py-2.5 text-sm font-semibold text-white"
                                : "block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-950"
                            }
                          >
                            {
                              item.label
                            }
                          </Link>
                        );
                      }
                    )}
                  </div>
                </div>
              )
            )}
          </nav>

          <div className="mt-auto border-t border-gray-100 pt-5">
            <p className="px-3 text-[10px] font-semibold tracking-[0.1em] text-gray-400">WORKFLOW</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link href="/finance/upload" className="rounded-lg bg-gray-100 px-3 py-2.5 text-center text-xs font-medium text-gray-700 hover:bg-gray-200">업로드</Link>
              <Link href="/finance/review" className="rounded-lg bg-gray-100 px-3 py-2.5 text-center text-xs font-medium text-gray-700 hover:bg-gray-200">거래 검토</Link>
            </div>
          </div>

        </div>
      </aside>

      {/* Mobile Navigation */}
      <div className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link
            href="/"
            className="font-semibold tracking-[-0.02em] text-gray-950"
          >
            나의 재무
          </Link>

          <Link
            href="/finance/upload"
            className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-semibold text-white"
          >
            업로드
          </Link>
        </div>

        <nav className="flex overflow-x-auto border-t border-gray-100 px-2 [scrollbar-width:none]">
          {[
            {
              label: "홈",
              href: "/",
            },
            {
              label: "거래",
              href: "/finance/transactions",
            },
            {
              label: "월마감",
              href: "/finance/close",
            },
            {
              label: "계획",
              href: "/plan/model",
            },
          ].map(
            (item) => {
              const active =
                isActivePath(
                  pathname,
                  item.href
                );

              return (
                <Link
                  key={
                    item.href
                  }
                  href={
                    item.href
                  }
                  className={
                    active
                      ? "shrink-0 border-b-2 border-gray-950 px-4 py-3 text-sm font-semibold text-gray-950"
                      : "shrink-0 px-4 py-3 text-sm text-gray-500"
                  }
                >
                  {
                    item.label
                  }
                </Link>
              );
            }
          )}
        </nav>
      </div>

      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}
