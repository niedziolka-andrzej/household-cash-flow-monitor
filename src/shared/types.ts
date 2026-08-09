import type { Money } from "./money";
import type { Month } from "./months";

// ---------------------------------------------------------------------------
// Persisted entities (DTOs — mirror the DB rows, not the DB columns directly)
// ---------------------------------------------------------------------------

export interface PlanCore {
	id: number;
	name: string;
	startMonth: Month;
	endMonth: Month;
	/** Currency of every amount within this plan (v1: single currency per plan). */
	currency: string;
	openingBalance: Money;
	createdAt: string;
	updatedAt: string;
}

export interface IncomeItem {
	id: number;
	planId: number;
	name: string;
	date: string; // 'YYYY-MM-DD'
	forecast: Money;
}
export type IncomeItemInput = Omit<IncomeItem, "id" | "planId">;

export interface RecurringExpense {
	id: number;
	planId: number;
	name: string;
	monthly: Money;
	/** null = plan start/end (the item is active for the whole plan). */
	startMonth: Month | null;
	endMonth: Month | null;
	sortOrder: number;
}
export type RecurringExpenseInput = Omit<RecurringExpense, "id" | "planId">;

export interface OneTimeExpense {
	id: number;
	planId: number;
	name: string;
	date: string; // 'YYYY-MM-DD'
	forecast: Money;
}
export type OneTimeExpenseInput = Omit<OneTimeExpense, "id" | "planId">;

export interface InvestmentConfig {
	totalTarget: Money;
	monthlyMinimum: Money;
	startMonth: Month;
	endMonth: Month;
}
export type InvestmentConfigInput = InvestmentConfig;

/** Aggregate actuals for one month: income, one-time expenses and investment are
 * each tracked as a single lump sum per month (decision: spreadsheet-style granularity).
 * A null field means "no actual entered yet — use the forecast". */
export interface MonthlyActualAggregate {
	month: Month;
	income: Money | null;
	oneTimeExpense: Money | null;
	investment: Money | null;
}

/** Actual for a single recurring expense in a single month (per-item granularity). */
export interface RecurringExpenseActual {
	recurringExpenseId: number;
	month: Month;
	amount: Money;
}

/** Manual override of the *monthly* balance (not cumulative) — highest priority. */
export interface MonthlyOverride {
	month: Month;
	balance: Money;
}

// ---------------------------------------------------------------------------
// Engine input/output
// ---------------------------------------------------------------------------

export interface PlanInput {
	startMonth: Month;
	endMonth: Month;
	currency: string;
	openingBalance: Money;
	incomes: IncomeItem[];
	recurring: RecurringExpense[];
	oneTime: OneTimeExpense[];
	investment: InvestmentConfig | null;
	monthlyActuals: MonthlyActualAggregate[];
	recurringExpenseActuals: RecurringExpenseActual[];
	overrides: MonthlyOverride[];
}

/** forecast / effective / variance for one figure. variance = effective - forecast. */
export interface Triple {
	forecast: Money;
	effective: Money;
	variance: Money;
}

export interface RecurringExpenseRow {
	id: number;
	name: string;
	forecast: Money;
	actual: Money | null;
	effective: Money;
}

export type BalanceSource = "override" | "actual" | "forecast";

export interface MonthlyResult {
	month: Month;
	income: Triple;
	recurringRows: RecurringExpenseRow[];
	recurringTotal: Triple;
	oneTimeTotal: Triple;
	expensesTotal: Triple;
	/** Surplus before investment: income - expenses. */
	surplus: Triple;
	investment: Triple;
	monthlyBalance: Triple;
	balanceSource: BalanceSource;
	cumulativeBalance: Triple;
	cumulativeInvested: { forecast: Money; effective: Money };
	flags: {
		negativeMonthlyBalance: boolean;
		negativeCumulativeBalance: boolean;
	};
	hasAnyActual: boolean;
	hasOverride: boolean;
}

export interface PlanResults {
	months: MonthlyResult[];
	finalCumulativeForecast: Money;
	finalCumulativeEffective: Money;
}

// ---------------------------------------------------------------------------
// RPC-level aggregates
// ---------------------------------------------------------------------------

export interface PlanSnapshot {
	plan: PlanCore;
	incomeItems: IncomeItem[];
	recurringExpenses: RecurringExpense[];
	oneTimeExpenses: OneTimeExpense[];
	investmentConfig: InvestmentConfig | null;
	monthlyActuals: MonthlyActualAggregate[];
	recurringExpenseActuals: RecurringExpenseActual[];
	overrides: MonthlyOverride[];
	results: PlanResults;
}

export interface PlanSummary {
	id: number;
	name: string;
	startMonth: Month;
	endMonth: Month;
	currency: string;
	finalCumulativeForecast: Money;
	finalCumulativeEffective: Money;
	hasRisk: boolean;
}

export interface PlanCoreInput {
	name: string;
	startMonth: Month;
	endMonth: Month;
	currency: string;
	openingBalance: Money;
}
