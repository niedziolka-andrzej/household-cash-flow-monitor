# Household Cash Flow Monitor

Desktop app for planning personal cash flow, comparing **forecast** against **actuals**. The goal of this app is to simplify long-term financial planning (eg. plan for the whole year).

## What it does

- Define assumptions: recurring expenses, one-time expenses, incomes, and an investment goal.
- Per month, the engine computes incomes, expenses, surplus, investment contribution, monthly balance, and cumulative balance — in three variants: forecast, effective (actual where entered, otherwise forecast), and variance.
- Investment allocation is fixed in code: every in-goal month gets a minimum, the rest of the goal is split proportionally to positive surplus.
- Enter actuals month by month; charts show cumulative balance and income vs. expense.
- Auto-updates from GitHub releases (stable / canary channels)

## What it is not

- **Not a portfolio tracker.** The investment goal is a savings target: how much cash to set aside each month. There are no holdings, no asset prices, no returns or valuations.
- **Not a single-expense tracker.** Actuals are entered at spreadsheet granularity — one lump sum per month for income, one-time expenses and investment (recurring expenses are the exception: those are per item). Individual transactions, receipts and categories are out of scope.
- **Not an accounting or budgeting-envelope tool.** No double-entry ledger, no accounts to reconcile, no envelopes or per-category limits. Just forecast vs. actual on the monthly cash flow.
- **Not connected to your bank.** Nothing is imported or synced; every number is typed in by hand.

---

## Stack

Electrobun (Bun backend + native webview), Vue 3 + Tailwind, SQLite via Drizzle ORM, typed RPC between view and backend. Money is stored as minor units + ISO currency and never handled as a bare number above the repository layer.

---

## FAQ

### Why not use some existing SaaS for this?

I don't want to pay any vendor for such simple thing.

### Why not use Excel or Google sheets?

Because I believe as a developer you can do better than that.
I want to store my data on my local machine and not in the cloud.

### Why did I use javascript for money-counting solution?

I enjoy building frontends with Vue and Tailwind. This stack gives me great developer experience which I believe translates into great end-user experience. I wanted to test out new tech (Electrobun) and do some cross-platform development. Normally I would use something like .NET as a backend but this app is too small to split it into independent deployments.