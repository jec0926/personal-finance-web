---
name: personal-finance-ui
description: Use for UI, UX, dashboard, transaction screen, navigation, responsive layout, visual design, component design, or frontend polish work in the personal-finance-web repository. Do not use for backend-only or database-only tasks.
---

# Personal Finance UI Skill

Use this workflow whenever modifying the visual or interaction design of this repository.

## 1. Inspect before designing

Before changing code:

- inspect the current page
- inspect AppShell
- inspect related shared components
- inspect globals.css
- inspect package.json
- inspect existing Tailwind patterns
- identify whether shadcn/ui is already installed
- inspect adjacent screens for visual consistency

Never assume the page should be rebuilt from scratch.

## 2. Determine information hierarchy

Before implementation, identify:

- primary user task
- primary financial number
- secondary information
- workflow status
- primary action
- optional actions

The visual hierarchy should follow this order.

Do not make all information visually equal.

## 3. Finance visual language

Use:

- neutral backgrounds
- dark text
- restrained accent color
- clear spacing
- strong financial number typography
- tabular numeric alignment
- small status badges only when useful
- lightweight separators
- subtle interaction states

Avoid:

- dashboard-template appearance
- excessive cards
- excessive gradients
- glassmorphism
- large decorative illustrations
- unnecessary shadows
- brightly colored category blocks
- excessive pill controls
- excessive icons
- rounded containers around every element

## 4. Financial tables and lists

Transaction information is dense.

Desktop:
- prefer readable tables or structured lists
- keep monetary values right aligned
- keep dates compact
- prioritize counterparty and category
- secondary metadata should be visually quieter

Mobile:
- convert dense tables to structured rows when necessary
- do not force horizontal scrolling unless genuinely required

## 5. Forms and editing

For transaction editing:

Prefer an inline panel, Sheet, Drawer, or focused edit area.

Keep:

- transaction identity visible
- amount visible
- current category visible
- primary Save action obvious

For FUTURE / bulk classification:
always preview how many transactions will be affected.

## 6. Dashboard

Dashboard should answer quickly:

1. How much came in?
2. How much was spent?
3. How much remains?
4. How is this different from previous months?
5. What categories changed?
6. Is anything waiting for review?

Do not treat Dashboard as a collection of unrelated KPI cards.

Use visual grouping and spacing before borders.

## 7. Charts

Use charts only when they improve understanding.

Recommended:
- line: monthly trends
- bar: category comparison
- stacked bar: additive cash allocation where appropriate

Avoid:
- decorative charts
- excessive pie charts
- unnecessary legends
- charts with too many series

Always use Korean labels.

## 8. Components

Reuse existing components first.

If shadcn/ui is already adopted, suitable components include:

- Button
- Input
- Select
- Sheet
- Dialog
- DropdownMenu
- Tabs
- Badge
- Tooltip
- Command
- Popover
- Separator
- Table

Do not install all shadcn components.
Only add components required by the current feature.

Use lucide-react for icons when already available.

## 9. Figma workflow

When Figma MCP is available:

For a major redesign:
1. inspect current implementation
2. send/capture relevant implementation to Figma if useful
3. iterate the layout
4. use the selected Figma frame as design reference
5. map design elements to existing code components
6. implement
7. verify rendered result

Do not blindly copy generated Figma markup into production code.

## 10. Browser verification

When Playwright MCP is available:

After implementation:
- launch or connect to local app
- inspect target page
- verify interaction
- inspect desktop layout
- inspect mobile layout
- check overflow
- check empty states
- check loading states
- check error states when practical

Correct issues before finishing.

## 11. Completion

Run build.

Summarize:

- UX problem addressed
- files changed
- new components introduced
- design decisions
- responsive behavior
- build/test result

Do not paste every modified file into the final response.