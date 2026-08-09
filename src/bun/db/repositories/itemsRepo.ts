import { and, eq } from "drizzle-orm";
import { DomainError } from "../../../shared/errors";
import { money } from "../../../shared/money";
import type {
	IncomeItem,
	IncomeItemInput,
	InvestmentConfig,
	InvestmentConfigInput,
	OneTimeExpense,
	OneTimeExpenseInput,
	RecurringExpense,
	RecurringExpenseInput,
} from "../../../shared/types";
import type { AppDatabase } from "../database";
import { incomeItems, investmentConfigs, oneTimeExpenses, recurringExpenses } from "../schema";

// --- income items ----------------------------------------------------------

type IncomeRow = typeof incomeItems.$inferSelect;
function rowToIncomeItem(row: IncomeRow): IncomeItem {
	return {
		id: row.id,
		planId: row.planId,
		name: row.name,
		date: row.date,
		forecast: money(row.forecastAmountMinor, row.forecastCurrency),
	};
}

export function listIncomeItems(db: AppDatabase, planId: number): IncomeItem[] {
	return db.select().from(incomeItems).where(eq(incomeItems.planId, planId)).orderBy(incomeItems.date).all().map(rowToIncomeItem);
}

export function createIncomeItem(db: AppDatabase, planId: number, input: IncomeItemInput): IncomeItem {
	const row = db
		.insert(incomeItems)
		.values({
			planId,
			name: input.name,
			date: input.date,
			forecastAmountMinor: input.forecast.amountMinor,
			forecastCurrency: input.forecast.currency,
		})
		.returning()
		.get();
	return rowToIncomeItem(row);
}

export function updateIncomeItem(
	db: AppDatabase,
	planId: number,
	itemId: number,
	patch: Partial<IncomeItemInput>,
): IncomeItem {
	const values: Record<string, unknown> = {};
	if (patch.name !== undefined) values.name = patch.name;
	if (patch.date !== undefined) values.date = patch.date;
	if (patch.forecast !== undefined) {
		values.forecastAmountMinor = patch.forecast.amountMinor;
		values.forecastCurrency = patch.forecast.currency;
	}
	const row = db
		.update(incomeItems)
		.set(values)
		.where(and(eq(incomeItems.id, itemId), eq(incomeItems.planId, planId)))
		.returning()
		.get();
	if (!row) throw new DomainError("item.notFound");
	return rowToIncomeItem(row);
}

export function deleteIncomeItem(db: AppDatabase, planId: number, itemId: number): void {
	db.delete(incomeItems).where(and(eq(incomeItems.id, itemId), eq(incomeItems.planId, planId))).run();
}

// --- one-time expenses (identical shape to income items) -------------------

type OneTimeRow = typeof oneTimeExpenses.$inferSelect;
function rowToOneTimeExpense(row: OneTimeRow): OneTimeExpense {
	return {
		id: row.id,
		planId: row.planId,
		name: row.name,
		date: row.date,
		forecast: money(row.forecastAmountMinor, row.forecastCurrency),
	};
}

export function listOneTimeExpenses(db: AppDatabase, planId: number): OneTimeExpense[] {
	return db
		.select()
		.from(oneTimeExpenses)
		.where(eq(oneTimeExpenses.planId, planId))
		.orderBy(oneTimeExpenses.date)
		.all()
		.map(rowToOneTimeExpense);
}

export function createOneTimeExpense(db: AppDatabase, planId: number, input: OneTimeExpenseInput): OneTimeExpense {
	const row = db
		.insert(oneTimeExpenses)
		.values({
			planId,
			name: input.name,
			date: input.date,
			forecastAmountMinor: input.forecast.amountMinor,
			forecastCurrency: input.forecast.currency,
		})
		.returning()
		.get();
	return rowToOneTimeExpense(row);
}

export function updateOneTimeExpense(
	db: AppDatabase,
	planId: number,
	itemId: number,
	patch: Partial<OneTimeExpenseInput>,
): OneTimeExpense {
	const values: Record<string, unknown> = {};
	if (patch.name !== undefined) values.name = patch.name;
	if (patch.date !== undefined) values.date = patch.date;
	if (patch.forecast !== undefined) {
		values.forecastAmountMinor = patch.forecast.amountMinor;
		values.forecastCurrency = patch.forecast.currency;
	}
	const row = db
		.update(oneTimeExpenses)
		.set(values)
		.where(and(eq(oneTimeExpenses.id, itemId), eq(oneTimeExpenses.planId, planId)))
		.returning()
		.get();
	if (!row) throw new DomainError("item.notFound");
	return rowToOneTimeExpense(row);
}

export function deleteOneTimeExpense(db: AppDatabase, planId: number, itemId: number): void {
	db.delete(oneTimeExpenses).where(and(eq(oneTimeExpenses.id, itemId), eq(oneTimeExpenses.planId, planId))).run();
}

// --- recurring expenses ------------------------------------------------------

type RecurringRow = typeof recurringExpenses.$inferSelect;
function rowToRecurringExpense(row: RecurringRow): RecurringExpense {
	return {
		id: row.id,
		planId: row.planId,
		name: row.name,
		monthly: money(row.monthlyAmountMinor, row.monthlyCurrency),
		startMonth: row.startMonth,
		endMonth: row.endMonth,
		sortOrder: row.sortOrder,
	};
}

export function listRecurringExpenses(db: AppDatabase, planId: number): RecurringExpense[] {
	return db
		.select()
		.from(recurringExpenses)
		.where(eq(recurringExpenses.planId, planId))
		.orderBy(recurringExpenses.sortOrder, recurringExpenses.id)
		.all()
		.map(rowToRecurringExpense);
}

export function createRecurringExpense(
	db: AppDatabase,
	planId: number,
	input: RecurringExpenseInput,
): RecurringExpense {
	const row = db
		.insert(recurringExpenses)
		.values({
			planId,
			name: input.name,
			monthlyAmountMinor: input.monthly.amountMinor,
			monthlyCurrency: input.monthly.currency,
			startMonth: input.startMonth,
			endMonth: input.endMonth,
			sortOrder: input.sortOrder,
		})
		.returning()
		.get();
	return rowToRecurringExpense(row);
}

export function updateRecurringExpense(
	db: AppDatabase,
	planId: number,
	itemId: number,
	patch: Partial<RecurringExpenseInput>,
): RecurringExpense {
	const values: Record<string, unknown> = {};
	if (patch.name !== undefined) values.name = patch.name;
	if (patch.monthly !== undefined) {
		values.monthlyAmountMinor = patch.monthly.amountMinor;
		values.monthlyCurrency = patch.monthly.currency;
	}
	if (patch.startMonth !== undefined) values.startMonth = patch.startMonth;
	if (patch.endMonth !== undefined) values.endMonth = patch.endMonth;
	if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;

	const row = db
		.update(recurringExpenses)
		.set(values)
		.where(and(eq(recurringExpenses.id, itemId), eq(recurringExpenses.planId, planId)))
		.returning()
		.get();
	if (!row) throw new DomainError("item.notFound");
	return rowToRecurringExpense(row);
}

export function deleteRecurringExpense(db: AppDatabase, planId: number, itemId: number): void {
	db.delete(recurringExpenses)
		.where(and(eq(recurringExpenses.id, itemId), eq(recurringExpenses.planId, planId)))
		.run();
}

// --- investment config (one-to-one with plan) --------------------------------

type InvestmentRow = typeof investmentConfigs.$inferSelect;
function rowToInvestmentConfig(row: InvestmentRow): InvestmentConfig {
	return {
		totalTarget: money(row.totalTargetAmountMinor, row.totalTargetCurrency),
		monthlyMinimum: money(row.monthlyMinimumAmountMinor, row.monthlyMinimumCurrency),
		startMonth: row.startMonth,
		endMonth: row.endMonth,
	};
}

export function getInvestmentConfig(db: AppDatabase, planId: number): InvestmentConfig | null {
	const row = db.select().from(investmentConfigs).where(eq(investmentConfigs.planId, planId)).get();
	return row ? rowToInvestmentConfig(row) : null;
}

/** Upserts (or, if `config` is null, deletes) the plan's single investment configuration row. */
export function saveInvestmentConfig(
	db: AppDatabase,
	planId: number,
	config: InvestmentConfigInput | null,
): InvestmentConfig | null {
	if (config === null) {
		db.delete(investmentConfigs).where(eq(investmentConfigs.planId, planId)).run();
		return null;
	}
	const values = {
		planId,
		totalTargetAmountMinor: config.totalTarget.amountMinor,
		totalTargetCurrency: config.totalTarget.currency,
		monthlyMinimumAmountMinor: config.monthlyMinimum.amountMinor,
		monthlyMinimumCurrency: config.monthlyMinimum.currency,
		startMonth: config.startMonth,
		endMonth: config.endMonth,
	};
	const existing = db.select().from(investmentConfigs).where(eq(investmentConfigs.planId, planId)).get();
	const row = existing
		? db.update(investmentConfigs).set(values).where(eq(investmentConfigs.planId, planId)).returning().get()
		: db.insert(investmentConfigs).values(values).returning().get();
	return rowToInvestmentConfig(row);
}
