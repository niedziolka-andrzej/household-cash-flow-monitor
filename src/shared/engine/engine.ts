import {
	addMoney,
	type Money,
	money,
	subtractMoney,
	sumMoney,
	zeroMoney,
} from "../money";
import { intersectMonthRanges, isMonthAfter, isMonthBefore, type Month, monthOfDate, monthRange } from "../months";
import type {
	BalanceSource,
	MonthlyResult,
	PlanInput,
	PlanResults,
	RecurringExpense,
	RecurringExpenseRow,
	Triple,
} from "../types";
import { allocateInvestment } from "./allocation";

function triple(forecast: Money, effective: Money): Triple {
	return { forecast, effective, variance: subtractMoney(effective, forecast) };
}

function pushInto(map: Map<Month, Money[]>, key: Month, value: Money): void {
	const existing = map.get(key);
	if (existing) existing.push(value);
	else map.set(key, [value]);
}

function isRecurringActiveInMonth(r: RecurringExpense, m: Month, planStart: Month, planEnd: Month): boolean {
	const effectiveStart = r.startMonth ?? planStart;
	const effectiveEnd = r.endMonth ?? planEnd;
	return !isMonthBefore(m, effectiveStart) && !isMonthAfter(m, effectiveEnd);
}

/**
 * Computes the full month-by-month result set for a plan: forecast, effective and
 * variance for every figure, the investment allocation, and the cumulative-balance
 * cascade. Always recomputes the whole plan from scratch — there is no incremental
 * state, so an edit to an early month automatically reshapes every later one.
 *
 * Precondition: `input` is already single-currency-consistent (validation.ts enforces
 * this before persistence) — the engine never checks currencies itself.
 */
export function computePlanResults(input: PlanInput): PlanResults {
	const { currency } = input;
	const months = monthRange(input.startMonth, input.endMonth);
	const monthSet = new Set(months);

	const incomeByMonth = new Map<Month, Money[]>();
	for (const item of input.incomes) {
		const m = monthOfDate(item.date);
		if (monthSet.has(m)) pushInto(incomeByMonth, m, item.forecast);
	}
	const oneTimeByMonth = new Map<Month, Money[]>();
	for (const item of input.oneTime) {
		const m = monthOfDate(item.date);
		if (monthSet.has(m)) pushInto(oneTimeByMonth, m, item.forecast);
	}

	const actualByMonth = new Map(input.monthlyActuals.map((a) => [a.month, a]));
	const overrideByMonth = new Map(input.overrides.map((o) => [o.month, o]));
	const recurringActualByKey = new Map(
		input.recurringExpenseActuals.map((a) => [`${a.recurringExpenseId}:${a.month}`, a.amount]),
	);

	// --- Forecast layer -----------------------------------------------------
	const forecastIncome = new Map<Month, Money>();
	const forecastOneTime = new Map<Month, Money>();
	const activeRecurring = new Map<Month, RecurringExpense[]>();
	const forecastRecurringTotal = new Map<Month, Money>();
	const forecastExpenses = new Map<Month, Money>();
	const forecastSurplus = new Map<Month, Money>();

	for (const m of months) {
		const income = sumMoney(currency, incomeByMonth.get(m) ?? []);
		const oneTime = sumMoney(currency, oneTimeByMonth.get(m) ?? []);
		const active = input.recurring.filter((r) => isRecurringActiveInMonth(r, m, input.startMonth, input.endMonth));
		const recurringTotal = sumMoney(
			currency,
			active.map((r) => r.monthly),
		);
		const expenses = addMoney(recurringTotal, oneTime);
		const surplus = subtractMoney(income, expenses);

		forecastIncome.set(m, income);
		forecastOneTime.set(m, oneTime);
		activeRecurring.set(m, active);
		forecastRecurringTotal.set(m, recurringTotal);
		forecastExpenses.set(m, expenses);
		forecastSurplus.set(m, surplus);
	}

	// --- Investment allocation (forecast-level, per plan.md §5) -------------
	const forecastInvestment = new Map<Month, Money>();
	if (input.investment) {
		const intersection = intersectMonthRanges(
			input.investment.startMonth,
			input.investment.endMonth,
			input.startMonth,
			input.endMonth,
		);
		if (intersection) {
			const coveredMonths = monthRange(intersection.start, intersection.end);
			const surplusMinorMap = new Map(coveredMonths.map((m) => [m, forecastSurplus.get(m)!.amountMinor]));
			const allocation = allocateInvestment({
				months: coveredMonths,
				forecastSurplusMinor: surplusMinorMap,
				totalTargetMinor: input.investment.totalTarget.amountMinor,
				monthlyMinimumMinor: input.investment.monthlyMinimum.amountMinor,
			});
			for (const m of coveredMonths) {
				forecastInvestment.set(m, money(allocation.get(m) ?? 0, currency));
			}
		}
	}
	for (const m of months) {
		if (!forecastInvestment.has(m)) forecastInvestment.set(m, zeroMoney(currency));
	}

	// --- Effective layer + cumulative cascade --------------------------------
	const results: MonthlyResult[] = [];
	let cumulativeForecastMinor = input.openingBalance.amountMinor;
	let cumulativeEffectiveMinor = input.openingBalance.amountMinor;
	let cumulativeInvestedForecastMinor = 0;
	let cumulativeInvestedEffectiveMinor = 0;

	for (const m of months) {
		const actual = actualByMonth.get(m) ?? null;
		const override = overrideByMonth.get(m) ?? null;

		const incomeForecast = forecastIncome.get(m)!;
		const incomeEffective = actual?.income ?? incomeForecast;
		const incomeTriple = triple(incomeForecast, incomeEffective);

		const recurringRows: RecurringExpenseRow[] = activeRecurring.get(m)!.map((r) => {
			const forecast = r.monthly;
			const actualAmount = recurringActualByKey.get(`${r.id}:${m}`) ?? null;
			const effective = actualAmount ?? forecast;
			return { id: r.id, name: r.name, forecast, actual: actualAmount, effective };
		});
		const recurringTotalForecast = forecastRecurringTotal.get(m)!;
		const recurringTotalEffective = sumMoney(
			currency,
			recurringRows.map((r) => r.effective),
		);
		const recurringTotalTriple = triple(recurringTotalForecast, recurringTotalEffective);

		const oneTimeForecast = forecastOneTime.get(m)!;
		const oneTimeEffective = actual?.oneTimeExpense ?? oneTimeForecast;
		const oneTimeTriple = triple(oneTimeForecast, oneTimeEffective);

		const expensesForecast = forecastExpenses.get(m)!;
		const expensesEffective = addMoney(recurringTotalEffective, oneTimeEffective);
		const expensesTriple = triple(expensesForecast, expensesEffective);

		const surplusForecast = forecastSurplus.get(m)!;
		const surplusEffective = subtractMoney(incomeEffective, expensesEffective);
		const surplusTriple = triple(surplusForecast, surplusEffective);

		const investmentForecast = forecastInvestment.get(m)!;
		const investmentEffective = actual?.investment ?? investmentForecast;
		const investmentTriple = triple(investmentForecast, investmentEffective);

		const monthlyBalanceForecast = subtractMoney(surplusForecast, investmentForecast);
		const computedEffectiveBalance = subtractMoney(surplusEffective, investmentEffective);

		const aggregateHasActual =
			actual !== null && (actual.income !== null || actual.oneTimeExpense !== null || actual.investment !== null);
		const recurringHasActual = recurringRows.some((r) => r.actual !== null);
		const hasAnyActual = aggregateHasActual || recurringHasActual;
		const hasOverride = override !== null;

		// Balance hierarchy: override -> actual-derived -> forecast.
		let balanceSource: BalanceSource;
		let monthlyBalanceEffective: Money;
		if (override) {
			balanceSource = "override";
			monthlyBalanceEffective = override.balance;
		} else if (hasAnyActual) {
			balanceSource = "actual";
			monthlyBalanceEffective = computedEffectiveBalance;
		} else {
			balanceSource = "forecast";
			monthlyBalanceEffective = monthlyBalanceForecast;
		}
		const monthlyBalanceTriple: Triple = {
			forecast: monthlyBalanceForecast,
			effective: monthlyBalanceEffective,
			variance: subtractMoney(monthlyBalanceEffective, monthlyBalanceForecast),
		};

		cumulativeForecastMinor += monthlyBalanceForecast.amountMinor;
		cumulativeEffectiveMinor += monthlyBalanceEffective.amountMinor;
		cumulativeInvestedForecastMinor += investmentForecast.amountMinor;
		cumulativeInvestedEffectiveMinor += investmentEffective.amountMinor;

		const cumulativeForecast = money(cumulativeForecastMinor, currency);
		const cumulativeEffective = money(cumulativeEffectiveMinor, currency);
		const cumulativeBalanceTriple: Triple = {
			forecast: cumulativeForecast,
			effective: cumulativeEffective,
			variance: subtractMoney(cumulativeEffective, cumulativeForecast),
		};

		results.push({
			month: m,
			income: incomeTriple,
			recurringRows,
			recurringTotal: recurringTotalTriple,
			oneTimeTotal: oneTimeTriple,
			expensesTotal: expensesTriple,
			surplus: surplusTriple,
			investment: investmentTriple,
			monthlyBalance: monthlyBalanceTriple,
			balanceSource,
			cumulativeBalance: cumulativeBalanceTriple,
			cumulativeInvested: {
				forecast: money(cumulativeInvestedForecastMinor, currency),
				effective: money(cumulativeInvestedEffectiveMinor, currency),
			},
			flags: {
				negativeMonthlyBalance: monthlyBalanceEffective.amountMinor < 0,
				negativeCumulativeBalance: cumulativeEffectiveMinor < 0,
			},
			hasAnyActual,
			hasOverride,
		});
	}

	return {
		months: results,
		finalCumulativeForecast: money(cumulativeForecastMinor, currency),
		finalCumulativeEffective: money(cumulativeEffectiveMinor, currency),
	};
}
