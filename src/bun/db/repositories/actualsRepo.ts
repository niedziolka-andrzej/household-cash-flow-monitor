import { and, eq } from "drizzle-orm";
import { money } from "../../../shared/money";
import type { MonthlyActualAggregate, MonthlyOverride, RecurringExpenseActual } from "../../../shared/types";
import type { AppDatabase } from "../database";
import { monthlyActuals, monthlyOverrides, recurringExpenseActuals } from "../schema";

// --- monthly aggregate actuals (income / one-time expenses / investment) ---

type MonthlyActualRow = typeof monthlyActuals.$inferSelect;
function rowToAggregate(row: MonthlyActualRow): MonthlyActualAggregate {
	return {
		month: row.month,
		income:
			row.incomeActualAmountMinor === null || row.incomeActualCurrency === null
				? null
				: money(row.incomeActualAmountMinor, row.incomeActualCurrency),
		oneTimeExpense:
			row.oneTimeExpenseActualAmountMinor === null || row.oneTimeExpenseActualCurrency === null
				? null
				: money(row.oneTimeExpenseActualAmountMinor, row.oneTimeExpenseActualCurrency),
		investment:
			row.investmentActualAmountMinor === null || row.investmentActualCurrency === null
				? null
				: money(row.investmentActualAmountMinor, row.investmentActualCurrency),
	};
}

export function listMonthlyActuals(db: AppDatabase, planId: number): MonthlyActualAggregate[] {
	return db.select().from(monthlyActuals).where(eq(monthlyActuals.planId, planId)).all().map(rowToAggregate);
}

const AGGREGATE_FIELD_COLUMNS = {
	income: { amount: "incomeActualAmountMinor", currency: "incomeActualCurrency" },
	oneTimeExpense: { amount: "oneTimeExpenseActualAmountMinor", currency: "oneTimeExpenseActualCurrency" },
	investment: { amount: "investmentActualAmountMinor", currency: "investmentActualCurrency" },
} as const;

export type AggregateActualField = keyof typeof AGGREGATE_FIELD_COLUMNS;

/** `value: null` clears that field back to "use the forecast" (sets both columns to NULL). */
export function upsertMonthlyActualField(
	db: AppDatabase,
	planId: number,
	month: string,
	field: AggregateActualField,
	value: { amountMinor: number; currency: string } | null,
): void {
	const columns = AGGREGATE_FIELD_COLUMNS[field];
	const patch: Record<string, unknown> = {
		[columns.amount]: value?.amountMinor ?? null,
		[columns.currency]: value?.currency ?? null,
	};

	const existing = db
		.select()
		.from(monthlyActuals)
		.where(and(eq(monthlyActuals.planId, planId), eq(monthlyActuals.month, month)))
		.get();

	if (existing) {
		db.update(monthlyActuals)
			.set(patch)
			.where(and(eq(monthlyActuals.planId, planId), eq(monthlyActuals.month, month)))
			.run();
	} else if (value !== null) {
		db.insert(monthlyActuals)
			.values({ planId, month, ...patch })
			.run();
	}
	// else: nothing to clear, no row exists — no-op.
}

// --- per-recurring-expense actuals ------------------------------------------

type RecurringActualRow = typeof recurringExpenseActuals.$inferSelect;
function rowToRecurringActual(row: RecurringActualRow): RecurringExpenseActual {
	return {
		recurringExpenseId: row.recurringExpenseId,
		month: row.month,
		amount: money(row.actualAmountMinor, row.actualCurrency),
	};
}

export function listRecurringExpenseActuals(db: AppDatabase, planId: number): RecurringExpenseActual[] {
	return db
		.select()
		.from(recurringExpenseActuals)
		.where(eq(recurringExpenseActuals.planId, planId))
		.all()
		.map(rowToRecurringActual);
}

/** `value: null` deletes the actual for that (item, month), reverting to the forecast. */
export function upsertRecurringExpenseActual(
	db: AppDatabase,
	planId: number,
	recurringExpenseId: number,
	month: string,
	value: { amountMinor: number; currency: string } | null,
): void {
	if (value === null) {
		db.delete(recurringExpenseActuals)
			.where(
				and(
					eq(recurringExpenseActuals.recurringExpenseId, recurringExpenseId),
					eq(recurringExpenseActuals.month, month),
				),
			)
			.run();
		return;
	}

	const existing = db
		.select()
		.from(recurringExpenseActuals)
		.where(
			and(eq(recurringExpenseActuals.recurringExpenseId, recurringExpenseId), eq(recurringExpenseActuals.month, month)),
		)
		.get();

	if (existing) {
		db.update(recurringExpenseActuals)
			.set({ actualAmountMinor: value.amountMinor, actualCurrency: value.currency })
			.where(eq(recurringExpenseActuals.id, existing.id))
			.run();
	} else {
		db.insert(recurringExpenseActuals)
			.values({
				planId,
				recurringExpenseId,
				month,
				actualAmountMinor: value.amountMinor,
				actualCurrency: value.currency,
			})
			.run();
	}
}

// --- manual monthly-balance overrides ---------------------------------------

type OverrideRow = typeof monthlyOverrides.$inferSelect;
function rowToOverride(row: OverrideRow): MonthlyOverride {
	return { month: row.month, balance: money(row.overrideBalanceAmountMinor, row.overrideBalanceCurrency) };
}

export function listOverrides(db: AppDatabase, planId: number): MonthlyOverride[] {
	return db.select().from(monthlyOverrides).where(eq(monthlyOverrides.planId, planId)).all().map(rowToOverride);
}

/** `balance: null` clears the override for that month. */
export function upsertOverride(
	db: AppDatabase,
	planId: number,
	month: string,
	balance: { amountMinor: number; currency: string } | null,
): void {
	if (balance === null) {
		db.delete(monthlyOverrides).where(and(eq(monthlyOverrides.planId, planId), eq(monthlyOverrides.month, month))).run();
		return;
	}

	const existing = db
		.select()
		.from(monthlyOverrides)
		.where(and(eq(monthlyOverrides.planId, planId), eq(monthlyOverrides.month, month)))
		.get();

	if (existing) {
		db.update(monthlyOverrides)
			.set({ overrideBalanceAmountMinor: balance.amountMinor, overrideBalanceCurrency: balance.currency })
			.where(eq(monthlyOverrides.id, existing.id))
			.run();
	} else {
		db.insert(monthlyOverrides)
			.values({
				planId,
				month,
				overrideBalanceAmountMinor: balance.amountMinor,
				overrideBalanceCurrency: balance.currency,
			})
			.run();
	}
}
