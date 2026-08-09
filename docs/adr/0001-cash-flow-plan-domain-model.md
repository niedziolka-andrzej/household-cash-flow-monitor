# ADR 0001 — Cash-flow plan domain model and forecast/actual engine

- **Status:** Accepted, amended in part by [ADR 0002](0002-per-item-corrections-for-one-time-expenses.md)
- **Date:** 2026-08-09
- **Supersedes:** `plan.md` (Polish requirements note written before the first commit), removed with this record.

## Context

The app replaces a spreadsheet used for planning personal cash flow. The spreadsheet had one
sheet per period, a column of planned amounts, a column of what actually happened, and a
hand-maintained running balance. It worked, but it could not hold more than one scenario, the
investment split was re-derived by hand every month, and a correction to an early month meant
re-checking every later one.

The requirements note behind the first commit fixed three things up front:

- the app manages **many independent plans** (scenarios, or different periods of life);
- a plan's horizon is an **arbitrary user-defined month range**, not a fixed six months;
- the **investment allocation algorithm is hard-coded**; only its inputs are configurable.

Deliberately out of scope for v1: authentication and authorization, event logging,
deployment/hosting, backups, and notifications. The note also left five modelling questions
open (actual granularity, per-item vs. aggregate actuals, month-key representation, amount
ranges, balance safety threshold). This record resolves them and states the shape that was
actually built.

## Decision

### 1. A plan is the aggregate root; everything else hangs off it

`Plan` owns its income items, recurring expenses, one-time expenses, at most one investment
config, its monthly actuals and its monthly overrides — all with `onDelete: cascade`
([schema.ts](../../src/bun/db/schema.ts)). Plans never reference each other, so editing one
cannot disturb another, and duplication is a deep copy under a new name
(`duplicatePlanCore` in [planRepo.ts](../../src/bun/db/repositories/planRepo.ts)). Duplication
is what makes "what if" cheap: branch the plan, change one assumption, compare.

### 2. Every figure exists as forecast / effective / variance

The engine returns a `Triple` for each figure: the forecast, the effective value, and
`effective − forecast` ([engine.ts](../../src/shared/engine/engine.ts)). The effective value is
the actual where one was entered and the forecast otherwise — one rule, applied uniformly to
income, each recurring expense, one-time expenses and the investment contribution. Forecast is
never mutated by entering an actual; it stays as the reference line the variance is measured
against.

### 3. The allocation algorithm lives in code, not in data

`InvestmentConfig` stores only the total target, the monthly minimum and the covered month
range. The split itself is [allocation.ts](../../src/shared/engine/allocation.ts):

1. every covered month gets the minimum;
2. the remainder of the target (`target − minimum × months`) forms a pool;
3. the pool is split proportionally to each month's **positive** forecast surplus — months with
   a zero or negative surplus receive the minimum only;
4. the split uses the largest-remainder method in integer minor units, so contributions sum to
   **exactly** the target, never a unit more or less.

Two consequences are intentional, not defects. A month whose surplus is negative still receives
its minimum — the resulting deficit is covered from the cumulative balance built up earlier.
And when *no* month has a positive surplus there is no meaningful weighting, so the pool is
split evenly (earliest months absorbing the leftover units) to preserve the exact-sum
invariant. `validateInvestmentConfig` rejects a target below the sum of minimums before it can
reach the algorithm, since that would demand a negative pool.

### 4. Allocation is computed on the forecast surplus only

The target and its split are decided up front, so the algorithm reads forecast surplus. An
actual contribution, when entered, overrides the allocated figure for that month but never
redistributes the remaining target.

### 5. Actual granularity: spreadsheet-level, with per-item recurring expenses

This resolves the open question about granularity. Income, one-time expenses and the investment
contribution are each **one lump sum per month** (`monthly_actuals`, one row per plan+month,
every amount nullable = "no actual, use the forecast"). Recurring expenses are the exception:
they get **per-item, per-month** actuals (`recurring_expense_actuals`), because that is where
variance is both recurring and interesting enough to be worth the extra typing.

> **Amended.** One-time expenses moved to per-item corrections in
> [ADR 0002](0002-per-item-corrections-for-one-time-expenses.md); their lump-sum column pair is
> still read as a fallback. Income and the investment contribution are unaffected.

The rejected alternative was a fully normalized `ActualEntry` per (month, category, item). It is
more flexible, but it buys flexibility this app does not use and costs joins on every read plus
a heavier data-entry UI. The chosen shape mirrors how the user already thinks — one line per
month, taken from a bank statement.

### 6. Manual override is a separate entity with the highest priority

A monthly override is its own table, not another nullable column on `monthly_actuals`: an
override and an actual are different mechanisms. An actual refines one component of the
calculation; an override discards the calculation for that month and asserts the balance
outright (typically read straight off a statement). The resolution order for a month's balance
is **override → actual-derived → forecast**, recorded per month as `balanceSource` so the UI can
show which one applied.

### 7. The engine is stateless and recomputes the whole plan

`computePlanResults` takes the full plan input and rebuilds every month from the opening
balance. No results are persisted and there is no incremental update path, so the cumulative
cascade — where a closed month shifts every later month — falls out for free instead of being a
feature to maintain. Plans span tens of months, so recomputation is trivially cheap; the
simplicity is worth more than the cycles.

### 8. A month is the string `'YYYY-MM'`

This resolves the month-key question. Lexicographic order equals chronological order, so plain
`<=`/`>=` comparisons work identically in SQLite and TypeScript; dated items (`IncomeItem`,
`OneTimeExpense`) are assigned to a month by slicing their `'YYYY-MM-DD'` date. Named helpers in
[months.ts](../../src/shared/months.ts) keep call sites reading as intent rather than string
manipulation. `parseMonthInput` accepts the several formats a spreadsheet paste tends to
produce.

### 9. Money is a value type: integer minor units + ISO currency

No floating point anywhere in the engine, and no bare number above the repository layer — each
persisted amount is a `..._amount_minor` / `..._currency` column pair mapped to a single `Money`
at the boundary ([money.ts](../../src/shared/money.ts)). A plan carries one currency and
validation rejects mixing currencies inside it; the value-type shape leaves room to lift that
rule later without a schema change. Amount *ranges* (the spreadsheet's "600–900") are not
modelled — the user picks one forecast value, as the spreadsheet effectively did.

### 10. Validation rules are shared, and enforced server-side

[validation.ts](../../src/shared/validation.ts) returns a `DomainError` or `null` and is called
from both the RPC handlers (source of truth) and the Vue forms (same rules, shown inline before
the round-trip). Callers choose whether to throw or render.

## Not adopted (yet)

Recorded so the omissions read as decisions rather than oversights:

- **Balance safety threshold.** Only the zero crossings are flagged
  (`negativeMonthlyBalance`, `negativeCumulativeBalance`); no configurable per-plan floor.
- **Per-item actuals for income** — see decision 5. (One-time expenses *did* get them, in
  [ADR 0002](0002-per-item-corrections-for-one-time-expenses.md).)
- **Amount ranges (min–max) on recurring expenses** — see decision 9.
- **Zero-decimal currencies and multi-currency plans** — the money helpers assume two
  minor-unit digits.
- **Auth, logging, backups, hosting, notifications** — out of scope for v1 as stated above.

Multilingualism was also out of scope, yet UI strings do sit behind a locale table
([i18n/pl.ts](../../src/mainview/i18n/pl.ts)). That is an indirection for keeping strings out of
components, not a translation feature: Polish is the only locale.

## Consequences

**Good.** The forecast/effective/variance triple gives the whole feature set — plan review,
monthly update, historical variance — from a single rule. Statelessness means there is no cache
to invalidate and no partially-updated plan; correctness questions reduce to "does the engine
compute this month right". Integer money plus the exact-sum allocation invariant are directly
testable properties, and are tested
([allocation.test.ts](../../tests/allocation.test.ts), [engine.test.ts](../../tests/engine.test.ts)).

**Costs.** Aggregate monthly actuals mean variance on income and one-time expenses cannot be
attributed to a specific item; recovering that later requires a schema migration and a busier
data-entry UI. (That is exactly what
[ADR 0002](0002-per-item-corrections-for-one-time-expenses.md) went on to do for one-time
expenses.) The hard-coded allocation cannot be swapped by a user — a second strategy means
a code change and a way to select it. Single-currency plans exclude anyone budgeting across
currencies. And because the engine always recomputes everything, there is no audit trail of
what a plan projected at some earlier point in time; only current inputs are stored.
