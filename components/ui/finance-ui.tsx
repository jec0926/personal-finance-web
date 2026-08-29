import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div><p className="finance-kicker">{eyebrow}</p><h1 className="finance-title">{title}</h1>{description && <p className="finance-description">{description}</p>}</div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}

export function StatusBadge({ tone = "neutral", children }: { tone?: "neutral" | "warning" | "success" | "info"; children: ReactNode }) {
  const tones = { neutral: "bg-gray-100 text-gray-600", warning: "bg-amber-50 text-amber-800", success: "bg-emerald-50 text-emerald-700", info: "bg-blue-50 text-blue-700" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="px-6 py-14 text-center"><p className="text-sm font-semibold text-gray-800">{title}</p>{description && <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">{description}</p>}{action && <div className="mt-5">{action}</div>}</div>;
}

export function MoneyValue({ value, unit = "원", className = "" }: { value: number; unit?: string; className?: string }) {
  return <span className={`tabular-nums tracking-[-0.035em] ${className}`}>{Math.round(value).toLocaleString("ko-KR")}<span className="ml-1 text-[0.48em] font-medium tracking-normal text-gray-500">{unit}</span></span>;
}
