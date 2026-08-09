import { DomainError } from "./errors";
import type { Money } from "./money";
import { isValidMonth, monthCount, isMonthAfter, isMonthBefore } from "./months";
import type {
	IncomeItemInput,
	InvestmentConfigInput,
	OneTimeExpenseInput,
	PlanCoreInput,
	RecurringExpenseInput,
} from "./types";

/**
 * Pure validation rules, shared by RPC handlers (source of truth, enforced server-side)
 * and Vue forms (same rules, surfaced inline before the round-trip). Every function
 * returns a DomainError or null — callers decide whether to throw (assertValid) or
 * render inline.
 */

export function assertValid(error: DomainError | null): void {
	if (error) throw error;
}

function checkCurrency(amount: Money, planCurrency: string): DomainError | null {
	if (amount.currency !== planCurrency) {
		return new DomainError("money.currencyMismatch", {
			expected: planCurrency,
			actual: amount.currency,
		});
	}
	return null;
}

export function validatePlanCore(input: PlanCoreInput): DomainError | null {
	if (input.name.trim() === "") return new DomainError("plan.nameRequired");
	if (!isValidMonth(input.startMonth) || !isValidMonth(input.endMonth)) {
		return new DomainError("validation.invalidMonth");
	}
	if (isMonthAfter(input.startMonth, input.endMonth)) {
		return new DomainError("plan.invalidRange");
	}
	return checkCurrency(input.openingBalance, input.currency);
}

/** Shared by income items and one-time expenses: both are a dated forecast amount. */
export function validateDatedItemInput(
	input: IncomeItemInput | OneTimeExpenseInput,
	planCurrency: string,
): DomainError | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
		return new DomainError("item.invalidDate");
	}
	if (input.forecast.amountMinor < 0) {
		return new DomainError("item.negativeAmount");
	}
	return checkCurrency(input.forecast, planCurrency);
}

export function validateRecurringExpenseInput(
	input: RecurringExpenseInput,
	planCurrency: string,
): DomainError | null {
	if (input.monthly.amountMinor < 0) {
		return new DomainError("item.negativeAmount");
	}
	const currencyError = checkCurrency(input.monthly, planCurrency);
	if (currencyError) return currencyError;

	if (input.startMonth !== null && !isValidMonth(input.startMonth)) {
		return new DomainError("validation.invalidMonth");
	}
	if (input.endMonth !== null && !isValidMonth(input.endMonth)) {
		return new DomainError("validation.invalidMonth");
	}
	if (input.startMonth !== null && input.endMonth !== null && isMonthAfter(input.startMonth, input.endMonth)) {
		return new DomainError("item.invalidRange");
	}
	return null;
}

/**
 * The investment range must be fully contained within the plan range, and the
 * target must be reachable given the per-month minimum (otherwise the allocation
 * algorithm's exact-sum invariant would require a negative "extra" pool).
 */
export function validateInvestmentConfig(
	config: InvestmentConfigInput,
	planStart: string,
	planEnd: string,
	planCurrency: string,
): DomainError | null {
	const targetCurrencyError = checkCurrency(config.totalTarget, planCurrency);
	if (targetCurrencyError) return targetCurrencyError;
	const minimumCurrencyError = checkCurrency(config.monthlyMinimum, planCurrency);
	if (minimumCurrencyError) return minimumCurrencyError;

	if (!isValidMonth(config.startMonth) || !isValidMonth(config.endMonth)) {
		return new DomainError("validation.invalidMonth");
	}
	if (isMonthAfter(config.startMonth, config.endMonth)) {
		return new DomainError("investment.invalidRange");
	}
	if (isMonthBefore(config.startMonth, planStart) || isMonthAfter(config.endMonth, planEnd)) {
		return new DomainError("investment.invalidRange");
	}
	if (config.totalTarget.amountMinor < 0 || config.monthlyMinimum.amountMinor < 0) {
		return new DomainError("item.negativeAmount");
	}

	const coveredMonths = monthCount(config.startMonth, config.endMonth);
	const minimumSum = config.monthlyMinimum.amountMinor * coveredMonths;
	if (config.totalTarget.amountMinor < minimumSum) {
		return new DomainError("investment.targetBelowMinimums", {
			minimumSumMinor: minimumSum,
			coveredMonths,
		});
	}
	return null;
}

export function validateMonthInPlanRange(month: string, planStart: string, planEnd: string): DomainError | null {
	if (!isValidMonth(month)) return new DomainError("validation.invalidMonth");
	if (isMonthBefore(month, planStart) || isMonthAfter(month, planEnd)) {
		return new DomainError("validation.invalidMonth");
	}
	return null;
}
