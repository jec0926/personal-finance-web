# Personal Finance Web - Codex Instructions

## Project

This repository is an existing personal finance web application.

Do not rebuild the application from scratch.

Before modifying code:
1. Inspect the current repository structure.
2. Inspect related existing components, APIs, types, and database usage.
3. Reuse existing architecture where reasonable.
4. Make the smallest coherent change.
5. Preserve currently working workflows.
6. Run build/tests after meaningful changes.

The repository is the source of truth.
If these instructions conflict with actual implementation details, inspect the repository before deciding.

---

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS
- Auth.js
- Supabase PostgreSQL
- Recharts
- Vercel
- Windows development environment

Use npm.cmd instead of npm when PowerShell execution policy causes npm.ps1 errors.

Never expose server secrets to client components.

SUPABASE_SECRET_KEY must remain server-only.

---

## Existing financial workflow

Preserve this workflow:

Excel upload
→ normalization
→ classification
→ transactions
→ review
→ duplicate review
→ monthly close
→ Actual snapshot
→ dashboard

Do not modify XLS parsing or transaction ID generation unless explicitly requested.

---

## Accounting invariants

These rules must not change without explicit approval.

- CARD transactions represent expense occurrence.
- CARD_SETTLEMENT is not an additional expense.
- INTERNAL_TRANSFER is excluded from income/expense.
- INVESTMENT_TRANSFER is capital allocation, not living expense.
- DEBT_PAYMENT is separate from living expense.
- REFUND reduces expense burden.
- REIMBURSEMENT reduces expense burden and is not ordinary income.
- Closed months use monthly_actual_snapshots.
- Open months may use transactions as provisional Actual.

Management accounting:

Income
- Net living / housing expense
= Management surplus
- Debt repayment
- Investment transfer
- Other allocation
= Residual cash

---

## UI design principles

The product should feel like a modern personal finance product,
not a database admin dashboard.

Design language:

- Korean-first product UI
- neutral / monochrome foundation
- restrained accent usage
- strong numerical hierarchy
- generous whitespace
- clear typography
- minimal shadows
- avoid excessive borders
- avoid wrapping every section in cards
- avoid excessive rounded rectangles
- tables/lists for dense transaction data
- cards only for meaningful summaries/KPIs
- use tabular-nums for financial numbers
- primary action should be obvious
- secondary actions should have lower visual weight

Do not imitate a specific commercial product pixel-for-pixel.

---

## Component policy

Before introducing a new UI library, inspect package.json.

Prefer:
1. existing shared components
2. current Tailwind patterns
3. shadcn/ui if adopted for this repository
4. lucide-react for icons
5. Recharts for financial charts

Do not introduce another UI framework without explicit approval.

When using shadcn/ui, do not turn every element into a Card component.

---

## UX principles

The user's main surfaces should be:

Dashboard
→ Transactions
→ Monthly close

Upload, review, and duplicate resolution are workflow actions,
not necessarily primary navigation destinations.

Prefer drill-down over duplicated screens.

For bulk actions:
- show impact before applying
- preserve override history
- preserve FUTURE classification behavior

---

## Responsive behavior

Desktop is the primary working environment,
but mobile must remain usable.

Do not simply shrink desktop tables onto mobile.

For dense transaction tables:
- desktop: table/list hybrid is acceptable
- mobile: reflow into transaction rows where appropriate

---

## UI task workflow

For UI/UX work:

1. Inspect the current rendered page.
2. Identify hierarchy and usability problems.
3. Reuse existing design patterns.
4. Use the personal-finance-ui skill.
5. If available, use Figma MCP for design exploration.
6. Use Playwright MCP to verify the implemented page.
7. Test desktop and mobile widths.
8. Run build before completing.

Do not redesign unrelated pages during a scoped task.

---

## Validation

After implementation, run applicable commands from package.json.

At minimum:

npm.cmd run build

If lint/tests exist, run them as well.

Do not report success if the build is failing.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
