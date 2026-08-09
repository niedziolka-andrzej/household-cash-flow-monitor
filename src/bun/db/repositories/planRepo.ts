import { eq, sql } from "drizzle-orm";
import { DomainError } from "../../../shared/errors";
import { money } from "../../../shared/money";
import type { PlanCore, PlanCoreInput } from "../../../shared/types";
import type { AppDatabase } from "../database";
import {
	incomeItems,
	investmentConfigs,
	monthlyActuals,
	monthlyOverrides,
	oneTimeExpenseActuals,
	oneTimeExpenses,
	plans,
	recurringExpenseActuals,
	recurringExpenses,
} from "../schema";

type PlanRow = typeof plans.$inferSelect;

function rowToPlanCore(row: PlanRow): PlanCore {
	return {
		id: row.id,
		name: row.name,
		startMonth: row.startMonth,
		endMonth: row.endMonth,
		currency: row.currency,
		openingBalance: money(row.openingBalanceAmountMinor, row.openingBalanceCurrency),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export function listPlanCores(db: AppDatabase): PlanCore[] {
	return db.select().from(plans).orderBy(plans.id).all().map(rowToPlanCore);
}

export function getPlanCore(db: AppDatabase, planId: number): PlanCore | null {
	const row = db.select().from(plans).where(eq(plans.id, planId)).get();
	return row ? rowToPlanCore(row) : null;
}

export function requirePlanCore(db: AppDatabase, planId: number): PlanCore {
	const plan = getPlanCore(db, planId);
	if (!plan) throw new DomainError("plan.notFound");
	return plan;
}

export function createPlanCore(db: AppDatabase, input: PlanCoreInput): PlanCore {
	const row = db
		.insert(plans)
		.values({
			name: input.name,
			startMonth: input.startMonth,
			endMonth: input.endMonth,
			currency: input.currency,
			openingBalanceAmountMinor: input.openingBalance.amountMinor,
			openingBalanceCurrency: input.openingBalance.currency,
		})
		.returning()
		.get();
	return rowToPlanCore(row);
}

export function updatePlanCore(db: AppDatabase, planId: number, patch: Partial<PlanCoreInput>): PlanCore {
	const values: Record<string, unknown> = { updatedAt: sql`(datetime('now'))` };
	if (patch.name !== undefined) values.name = patch.name;
	if (patch.startMonth !== undefined) values.startMonth = patch.startMonth;
	if (patch.endMonth !== undefined) values.endMonth = patch.endMonth;
	if (patch.currency !== undefined) values.currency = patch.currency;
	if (patch.openingBalance !== undefined) {
		values.openingBalanceAmountMinor = patch.openingBalance.amountMinor;
		values.openingBalanceCurrency = patch.openingBalance.currency;
	}

	const row = db.update(plans).set(values).where(eq(plans.id, planId)).returning().get();
	if (!row) throw new DomainError("plan.notFound");
	return rowToPlanCore(row);
}

export function deletePlanCore(db: AppDatabase, planId: number): void {
	// Cascades to every child table via ON DELETE CASCADE (schema.ts).
	db.delete(plans).where(eq(plans.id, planId)).run();
}

/**
 * Deep-copies a plan and everything under it (assumptions, actuals, overrides) in one
 * transaction — the "branch off a what-if scenario mid-realization" case from ADR 0001 §1.
 * Recurring-expense and one-time-expense ids are remapped so their actuals attach to the
 * new copies, not the originals.
 */
export function duplicatePlanCore(db: AppDatabase, sourcePlanId: number, newName: string): PlanCore {
	return db.transaction((tx) => {
		const source = tx.select().from(plans).where(eq(plans.id, sourcePlanId)).get();
		if (!source) throw new DomainError("plan.notFound");

		const copy = tx
			.insert(plans)
			.values({
				name: newName,
				startMonth: source.startMonth,
				endMonth: source.endMonth,
				currency: source.currency,
				openingBalanceAmountMinor: source.openingBalanceAmountMinor,
				openingBalanceCurrency: source.openingBalanceCurrency,
			})
			.returning()
			.get();
		const newPlanId = copy.id;

		for (const item of tx.select().from(incomeItems).where(eq(incomeItems.planId, sourcePlanId)).all()) {
			tx.insert(incomeItems)
				.values({
					planId: newPlanId,
					name: item.name,
					date: item.date,
					forecastAmountMinor: item.forecastAmountMinor,
					forecastCurrency: item.forecastCurrency,
				})
				.run();
		}
		const oneTimeIdMap = new Map<number, number>();
		for (const item of tx.select().from(oneTimeExpenses).where(eq(oneTimeExpenses.planId, sourcePlanId)).all()) {
			const newOneTime = tx
				.insert(oneTimeExpenses)
				.values({
					planId: newPlanId,
					name: item.name,
					date: item.date,
					forecastAmountMinor: item.forecastAmountMinor,
					forecastCurrency: item.forecastCurrency,
				})
				.returning()
				.get();
			oneTimeIdMap.set(item.id, newOneTime.id);
		}

		const recurringIdMap = new Map<number, number>();
		for (const item of tx.select().from(recurringExpenses).where(eq(recurringExpenses.planId, sourcePlanId)).all()) {
			const newRecurring = tx
				.insert(recurringExpenses)
				.values({
					planId: newPlanId,
					name: item.name,
					monthlyAmountMinor: item.monthlyAmountMinor,
					monthlyCurrency: item.monthlyCurrency,
					startMonth: item.startMonth,
					endMonth: item.endMonth,
					sortOrder: item.sortOrder,
				})
				.returning()
				.get();
			recurringIdMap.set(item.id, newRecurring.id);
		}

		const investmentConfig = tx
			.select()
			.from(investmentConfigs)
			.where(eq(investmentConfigs.planId, sourcePlanId))
			.get();
		if (investmentConfig) {
			tx.insert(investmentConfigs)
				.values({
					planId: newPlanId,
					totalTargetAmountMinor: investmentConfig.totalTargetAmountMinor,
					totalTargetCurrency: investmentConfig.totalTargetCurrency,
					monthlyMinimumAmountMinor: investmentConfig.monthlyMinimumAmountMinor,
					monthlyMinimumCurrency: investmentConfig.monthlyMinimumCurrency,
					startMonth: investmentConfig.startMonth,
					endMonth: investmentConfig.endMonth,
				})
				.run();
		}

		for (const actual of tx.select().from(monthlyActuals).where(eq(monthlyActuals.planId, sourcePlanId)).all()) {
			tx.insert(monthlyActuals)
				.values({
					planId: newPlanId,
					month: actual.month,
					incomeActualAmountMinor: actual.incomeActualAmountMinor,
					incomeActualCurrency: actual.incomeActualCurrency,
					oneTimeExpenseActualAmountMinor: actual.oneTimeExpenseActualAmountMinor,
					oneTimeExpenseActualCurrency: actual.oneTimeExpenseActualCurrency,
					investmentActualAmountMinor: actual.investmentActualAmountMinor,
					investmentActualCurrency: actual.investmentActualCurrency,
				})
				.run();
		}

		for (const actual of tx
			.select()
			.from(recurringExpenseActuals)
			.where(eq(recurringExpenseActuals.planId, sourcePlanId))
			.all()) {
			const newRecurringId = recurringIdMap.get(actual.recurringExpenseId);
			if (newRecurringId === undefined) continue; // defensive: source item vanished mid-copy
			tx.insert(recurringExpenseActuals)
				.values({
					planId: newPlanId,
					recurringExpenseId: newRecurringId,
					month: actual.month,
					actualAmountMinor: actual.actualAmountMinor,
					actualCurrency: actual.actualCurrency,
				})
				.run();
		}

		for (const actual of tx
			.select()
			.from(oneTimeExpenseActuals)
			.where(eq(oneTimeExpenseActuals.planId, sourcePlanId))
			.all()) {
			const newOneTimeId = oneTimeIdMap.get(actual.oneTimeExpenseId);
			if (newOneTimeId === undefined) continue; // defensive: source item vanished mid-copy
			tx.insert(oneTimeExpenseActuals)
				.values({
					planId: newPlanId,
					oneTimeExpenseId: newOneTimeId,
					actualAmountMinor: actual.actualAmountMinor,
					actualCurrency: actual.actualCurrency,
				})
				.run();
		}

		for (const override of tx.select().from(monthlyOverrides).where(eq(monthlyOverrides.planId, sourcePlanId)).all()) {
			tx.insert(monthlyOverrides)
				.values({
					planId: newPlanId,
					month: override.month,
					overrideBalanceAmountMinor: override.overrideBalanceAmountMinor,
					overrideBalanceCurrency: override.overrideBalanceCurrency,
				})
				.run();
		}

		return rowToPlanCore(copy);
	});
}
