# ADR 0002 — Per-item corrections for one-time expenses

- **Status:** Accepted
- **Date:** 2026-08-09
- **Amends:** [ADR 0001](0001-cash-flow-plan-domain-model.md) §5 and its "Not adopted (yet)" entry
  for per-item actuals on one-time expenses.

## Context

ADR 0001 §5 gave one-time expenses the same actual granularity as income and the investment
contribution: one lump sum per month, held in `monthly_actuals`. That mirrors a bank statement,
and for income it is the right shape — a month's income is one or two deposits.

A month's one-time expenses are not one figure. They are a list: a bike, a mechanic, car
insurance, a wedding gift. The list is already itemized on the assumptions side, and each item
drifts on its own — the mechanic came in over, the insurance came in under. Entering a single
`19 300 zł` for August records the total and discards the only interesting part, which item
moved and by how much. Recovering it means going back to a spreadsheet or a bank export, which
is what this app exists to replace.

The UX comp for the monthly table settles it: the one-time row is not an editable figure but a
count — `Wykonanie: 2/6` — opening a dialog with one line per item, its plan amount struck
through and a field for what was actually paid.

## Decision

### 1. A correction is its own entity, keyed on the item alone

`one_time_expense_actuals` holds `(plan_id, one_time_expense_id, actual_amount_minor,
actual_currency)`, unique on `one_time_expense_id`
([schema.ts](../../src/bun/db/schema.ts)). It deliberately has **no month column**, unlike
`recurring_expense_actuals`: a one-time expense has exactly one date, so its month is a
function of that date. Storing the month again would allow a row to disagree with its item, and
re-dating the item would orphan its correction; without one, moving the date carries the
correction into the new month for free.

The name is "correction" (`korekta`) in the UI and "actual" in the code, matching how the
comp labels it and how the sibling tables are named.

### 2. Corrections take precedence over the legacy lump sum

The engine resolves a month's one-time figure as:

1. **any item corrected** → sum over the month's items of `correction ?? forecast`;
2. else the legacy `monthly_actuals.one_time_expense_actual_*` lump sum, if present;
3. else the forecast.

Step 1's fallback inside the sum is the load-bearing part: correcting one item out of six does
not zero the other five, it leaves them contributing their plan value. So the month's total is
meaningful from the first correction entered, and `Wykonanie: 1/6` is an honest label rather
than a half-finished state.

Step 2 exists so databases written before this change keep resolving as they did. The column
pair and the `field: "oneTimeExpense"` arm of `upsertMonthlyActual` are retained and still read;
nothing writes them any more. They were kept rather than migrated away because dropping a
column in SQLite means rebuilding the table and destroying whatever the user had entered, in
exchange for tidiness.

### 3. `MonthlyResult` carries the rows, not just the total

`oneTimeRows: OneTimeExpenseRow[]` — every item dated in that month, in date order, each with
`forecast` / `actual` / `effective` ([engine.ts](../../src/shared/engine/engine.ts)). This
mirrors `recurringRows` and means the dialog renders from engine output instead of re-deriving
month membership from dates in the view, where it could drift from what the engine actually
summed.

### 4. Everything downstream falls out of the existing rules

A correction sets `hasAnyActual`, so the month's `balanceSource` becomes `actual` and the
cumulative cascade reshapes every later month — the same path an income actual already took.
The charts read `oneTimeTotal.effective` and `hasAnyActual` and needed no change. Duplicating a
plan remaps one-time ids the way it already remapped recurring ids, so a copy's corrections
attach to the copy's items.

## Consequences

**Good.** Variance on one-time expenses is now attributable to the item that caused it, which
was the one thing ADR 0001 listed under "Costs" for this area. Data entry is closer to the
source: the user reads a statement line and types it against the matching item. The month's
figure stays derived — there is no total to keep in sync with its parts.

**Costs.** One more table, one more RPC method, and a dialog to maintain; a month with a dozen
one-time items is a dozen fields rather than one. Two resolution paths for the same figure
coexist until the legacy column is eventually dropped. And spending that was never planned still
has no home here: with no item to correct, there is nothing to attach an amount to — it has to
be added as a one-time expense first, which is the honest workflow but an extra step.

**Unchanged.** Income and the investment contribution keep spreadsheet granularity (ADR 0001
§5). The argument above is specific to one-time expenses being an itemized list; income is not.
