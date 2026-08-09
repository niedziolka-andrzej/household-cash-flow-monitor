import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

/**
 * Every amount is a *pair* of columns — `..._amount_minor` (integer, minor units)
 * and `..._currency` (ISO 4217) — mirroring the `Money` value type from
 * src/shared/money.ts. Repositories map each pair to/from a single `Money` at the
 * boundary; nothing above the repository layer ever sees a bare number.
 *
 * Month columns are always TEXT 'YYYY-MM' (src/shared/months.ts); date columns are
 * TEXT 'YYYY-MM-DD'.
 */

export const plans = sqliteTable(
	"plans",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull(),
		startMonth: text("start_month").notNull(),
		endMonth: text("end_month").notNull(),
		currency: text("currency").notNull().default("PLN"),
		openingBalanceAmountMinor: integer("opening_balance_amount_minor").notNull().default(0),
		openingBalanceCurrency: text("opening_balance_currency").notNull().default("PLN"),
		createdAt: text("created_at")
			.notNull()
			.default(sql`(datetime('now'))`),
		updatedAt: text("updated_at")
			.notNull()
			.default(sql`(datetime('now'))`),
	},
	(table) => [check("plans_range_check", sql`${table.endMonth} >= ${table.startMonth}`)],
);

export const incomeItems = sqliteTable("income_items", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	planId: integer("plan_id")
		.notNull()
		.references(() => plans.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	date: text("date").notNull(),
	forecastAmountMinor: integer("forecast_amount_minor").notNull(),
	forecastCurrency: text("forecast_currency").notNull(),
});

export const recurringExpenses = sqliteTable("recurring_expenses", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	planId: integer("plan_id")
		.notNull()
		.references(() => plans.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	monthlyAmountMinor: integer("monthly_amount_minor").notNull(),
	monthlyCurrency: text("monthly_currency").notNull(),
	startMonth: text("start_month"), // null = plan start
	endMonth: text("end_month"), // null = plan end
	sortOrder: integer("sort_order").notNull().default(0),
});

export const oneTimeExpenses = sqliteTable("one_time_expenses", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	planId: integer("plan_id")
		.notNull()
		.references(() => plans.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	date: text("date").notNull(),
	forecastAmountMinor: integer("forecast_amount_minor").notNull(),
	forecastCurrency: text("forecast_currency").notNull(),
});

export const investmentConfigs = sqliteTable(
	"investment_configs",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		planId: integer("plan_id")
			.notNull()
			.references(() => plans.id, { onDelete: "cascade" }),
		totalTargetAmountMinor: integer("total_target_amount_minor").notNull(),
		totalTargetCurrency: text("total_target_currency").notNull(),
		monthlyMinimumAmountMinor: integer("monthly_minimum_amount_minor").notNull(),
		monthlyMinimumCurrency: text("monthly_minimum_currency").notNull(),
		startMonth: text("start_month").notNull(),
		endMonth: text("end_month").notNull(),
	},
	(table) => [
		unique("investment_configs_plan_id_unique").on(table.planId),
		check("investment_configs_range_check", sql`${table.endMonth} >= ${table.startMonth}`),
	],
);

/** Aggregate actuals for a month: income, one-time expenses and investment are each
 * a single lump sum (spreadsheet-style granularity) — a null pair means "no actual
 * yet, use the forecast". */
export const monthlyActuals = sqliteTable(
	"monthly_actuals",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		planId: integer("plan_id")
			.notNull()
			.references(() => plans.id, { onDelete: "cascade" }),
		month: text("month").notNull(),
		incomeActualAmountMinor: integer("income_actual_amount_minor"),
		incomeActualCurrency: text("income_actual_currency"),
		oneTimeExpenseActualAmountMinor: integer("one_time_expense_actual_amount_minor"),
		oneTimeExpenseActualCurrency: text("one_time_expense_actual_currency"),
		investmentActualAmountMinor: integer("investment_actual_amount_minor"),
		investmentActualCurrency: text("investment_actual_currency"),
	},
	(table) => [unique("monthly_actuals_plan_month_unique").on(table.planId, table.month)],
);

/** Per-recurring-expense actual for a single month (per-item granularity). */
export const recurringExpenseActuals = sqliteTable(
	"recurring_expense_actuals",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		planId: integer("plan_id")
			.notNull()
			.references(() => plans.id, { onDelete: "cascade" }),
		recurringExpenseId: integer("recurring_expense_id")
			.notNull()
			.references(() => recurringExpenses.id, { onDelete: "cascade" }),
		month: text("month").notNull(),
		actualAmountMinor: integer("actual_amount_minor").notNull(),
		actualCurrency: text("actual_currency").notNull(),
	},
	(table) => [unique("recurring_expense_actuals_item_month_unique").on(table.recurringExpenseId, table.month)],
);

/** Manual override of the *monthly* (not cumulative) balance — highest priority. */
export const monthlyOverrides = sqliteTable(
	"monthly_overrides",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		planId: integer("plan_id")
			.notNull()
			.references(() => plans.id, { onDelete: "cascade" }),
		month: text("month").notNull(),
		overrideBalanceAmountMinor: integer("override_balance_amount_minor").notNull(),
		overrideBalanceCurrency: text("override_balance_currency").notNull(),
	},
	(table) => [unique("monthly_overrides_plan_month_unique").on(table.planId, table.month)],
);
