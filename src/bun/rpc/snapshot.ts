import { computePlanResults } from "../../shared/engine/engine";
import type { PlanInput, PlanSnapshot, PlanSummary } from "../../shared/types";
import type { AppDatabase } from "../db/database";
import {
	listMonthlyActuals,
	listOneTimeExpenseActuals,
	listOverrides,
	listRecurringExpenseActuals,
} from "../db/repositories/actualsRepo";
import {
	getInvestmentConfig,
	listIncomeItems,
	listOneTimeExpenses,
	listRecurringExpenses,
} from "../db/repositories/itemsRepo";
import { listPlanCores, requirePlanCore } from "../db/repositories/planRepo";

/** Assembles the engine's input by pulling every child table for one plan. */
export function loadPlanInput(db: AppDatabase, planId: number): PlanInput {
	const plan = requirePlanCore(db, planId);
	return {
		startMonth: plan.startMonth,
		endMonth: plan.endMonth,
		currency: plan.currency,
		openingBalance: plan.openingBalance,
		incomes: listIncomeItems(db, planId),
		recurring: listRecurringExpenses(db, planId),
		oneTime: listOneTimeExpenses(db, planId),
		investment: getInvestmentConfig(db, planId),
		monthlyActuals: listMonthlyActuals(db, planId),
		recurringExpenseActuals: listRecurringExpenseActuals(db, planId),
		oneTimeExpenseActuals: listOneTimeExpenseActuals(db, planId),
		overrides: listOverrides(db, planId),
	};
}

/**
 * The full RPC response for "give me everything about this plan": every raw row plus
 * the freshly computed month-by-month results. Every mutation handler returns this so
 * the webview only ever needs one state-replacement operation.
 */
export function buildSnapshot(db: AppDatabase, planId: number): PlanSnapshot {
	const plan = requirePlanCore(db, planId);
	const input = loadPlanInput(db, planId);
	return {
		plan,
		incomeItems: input.incomes,
		recurringExpenses: input.recurring,
		oneTimeExpenses: input.oneTime,
		investmentConfig: input.investment,
		monthlyActuals: input.monthlyActuals,
		recurringExpenseActuals: input.recurringExpenseActuals,
		oneTimeExpenseActuals: input.oneTimeExpenseActuals,
		overrides: input.overrides,
		results: computePlanResults(input),
	};
}

function buildPlanSummary(db: AppDatabase, planId: number): PlanSummary {
	const plan = requirePlanCore(db, planId);
	const results = computePlanResults(loadPlanInput(db, planId));
	const hasRisk = results.months.some((m) => m.flags.negativeMonthlyBalance || m.flags.negativeCumulativeBalance);
	return {
		id: plan.id,
		name: plan.name,
		startMonth: plan.startMonth,
		endMonth: plan.endMonth,
		currency: plan.currency,
		finalCumulativeForecast: results.finalCumulativeForecast,
		finalCumulativeEffective: results.finalCumulativeEffective,
		hasRisk,
	};
}

export function listPlanSummaries(db: AppDatabase): PlanSummary[] {
	return listPlanCores(db).map((plan) => buildPlanSummary(db, plan.id));
}
