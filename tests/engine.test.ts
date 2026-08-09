import { describe, expect, test } from "bun:test";
import { computePlanResults } from "../src/shared/engine/engine";
import { money, zeroMoney } from "../src/shared/money";
import type {
	IncomeItem,
	InvestmentConfig,
	MonthlyActualAggregate,
	MonthlyOverride,
	OneTimeExpense,
	OneTimeExpenseActual,
	PlanInput,
	RecurringExpense,
	RecurringExpenseActual,
} from "../src/shared/types";

const CURRENCY = "PLN";
const pln = (amountMinor: number) => money(amountMinor, CURRENCY);

function basePlan(overrides: Partial<PlanInput> = {}): PlanInput {
	return {
		startMonth: "2026-08",
		endMonth: "2027-01",
		currency: CURRENCY,
		openingBalance: pln(0),
		incomes: [],
		recurring: [],
		oneTime: [],
		investment: null,
		monthlyActuals: [],
		recurringExpenseActuals: [],
		oneTimeExpenseActuals: [],
		overrides: [],
		...overrides,
	};
}

function income(id: number, date: string, amountMinor: number): IncomeItem {
	return { id, planId: 1, name: `income-${id}`, date, forecast: pln(amountMinor) };
}
function recurring(
	id: number,
	name: string,
	monthlyMinor: number,
	startMonth: string | null = null,
	endMonth: string | null = null,
): RecurringExpense {
	return { id, planId: 1, name, monthly: pln(monthlyMinor), startMonth, endMonth, sortOrder: id };
}
function oneTime(id: number, date: string, amountMinor: number): OneTimeExpense {
	return { id, planId: 1, name: `one-time-${id}`, date, forecast: pln(amountMinor) };
}
function oneTimeCorrection(oneTimeExpenseId: number, amountMinor: number): OneTimeExpenseActual {
	return { oneTimeExpenseId, amount: pln(amountMinor) };
}

function findMonth(results: ReturnType<typeof computePlanResults>, month: string) {
	const m = results.months.find((r) => r.month === month);
	if (!m) throw new Error(`month ${month} not found`);
	return m;
}

describe("computePlanResults — basic aggregation", () => {
	test("sums incomes and expenses bucketed by calendar month, ignores items outside the plan range", () => {
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-09",
			incomes: [income(1, "2026-08-10", 5000_00), income(2, "2026-07-01", 999_00 /* outside range */)],
			recurring: [recurring(1, "Czynsz", 1500_00)],
			oneTime: [oneTime(1, "2026-08-20", 300_00)],
		});
		const results = computePlanResults(input);
		const aug = findMonth(results, "2026-08");
		expect(aug.income.forecast).toEqual(pln(5000_00));
		expect(aug.recurringTotal.forecast).toEqual(pln(1500_00));
		expect(aug.oneTimeTotal.forecast).toEqual(pln(300_00));
		expect(aug.expensesTotal.forecast).toEqual(pln(1800_00));
		expect(aug.surplus.forecast).toEqual(pln(3200_00));

		const sep = findMonth(results, "2026-09");
		expect(sep.income.forecast).toEqual(zeroMoney(CURRENCY));
		expect(sep.recurringTotal.forecast).toEqual(pln(1500_00)); // recurring with no range applies every month
	});

	test("recurring expenses respect a narrower start/end range than the plan", () => {
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-11",
			recurring: [recurring(1, "Fizjoterapia", 700_00, "2026-09", "2026-10")],
		});
		const results = computePlanResults(input);
		expect(findMonth(results, "2026-08").recurringTotal.forecast).toEqual(zeroMoney(CURRENCY));
		expect(findMonth(results, "2026-09").recurringTotal.forecast).toEqual(pln(700_00));
		expect(findMonth(results, "2026-10").recurringTotal.forecast).toEqual(pln(700_00));
		expect(findMonth(results, "2026-11").recurringTotal.forecast).toEqual(zeroMoney(CURRENCY));
	});
});

describe("computePlanResults — effective value resolution", () => {
	test("effective = actual when present, forecast otherwise (income, one-time, investment)", () => {
		const actuals: MonthlyActualAggregate[] = [
			{ month: "2026-08", income: pln(6000_00), oneTimeExpense: null, investment: pln(50_00) },
		];
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-08",
			incomes: [income(1, "2026-08-10", 5000_00)],
			oneTime: [oneTime(1, "2026-08-05", 200_00)],
			investment: { totalTarget: pln(100_00), monthlyMinimum: pln(100_00), startMonth: "2026-08", endMonth: "2026-08" },
			monthlyActuals: actuals,
		});
		const aug = findMonth(computePlanResults(input), "2026-08");
		expect(aug.income.effective).toEqual(pln(6000_00));
		expect(aug.oneTimeTotal.effective).toEqual(pln(200_00)); // no actual entered -> forecast
		expect(aug.investment.effective).toEqual(pln(50_00)); // actual overrides the allocated forecast
	});

	test("effective per-recurring-item actual only affects that item", () => {
		const recurringActuals: RecurringExpenseActual[] = [{ recurringExpenseId: 1, month: "2026-08", amount: pln(1400_00) }];
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-08",
			recurring: [recurring(1, "Czynsz", 1500_00), recurring(2, "Jedzenie", 800_00)],
			recurringExpenseActuals: recurringActuals,
		});
		const aug = findMonth(computePlanResults(input), "2026-08");
		const rent = aug.recurringRows.find((r) => r.id === 1)!;
		const food = aug.recurringRows.find((r) => r.id === 2)!;
		expect(rent.effective).toEqual(pln(1400_00));
		expect(food.effective).toEqual(pln(800_00)); // untouched -> forecast
		expect(aug.recurringTotal.effective).toEqual(pln(2200_00));
	});
});

describe("computePlanResults — one-time expense corrections", () => {
	function augustPlan(overrides: Partial<PlanInput> = {}): PlanInput {
		return basePlan({
			startMonth: "2026-08",
			endMonth: "2026-08",
			oneTime: [oneTime(1, "2026-08-06", 5000_00), oneTime(2, "2026-08-15", 1500_00)],
			...overrides,
		});
	}

	test("rows carry every item dated in the month, with its correction where one exists", () => {
		const aug = findMonth(
			computePlanResults(augustPlan({ oneTimeExpenseActuals: [oneTimeCorrection(1, 5300_00)] })),
			"2026-08",
		);
		expect(aug.oneTimeRows.map((r) => r.id)).toEqual([1, 2]);
		expect(aug.oneTimeRows[0].actual).toEqual(pln(5300_00));
		expect(aug.oneTimeRows[0].effective).toEqual(pln(5300_00));
		expect(aug.oneTimeRows[1].actual).toBeNull();
		expect(aug.oneTimeRows[1].effective).toEqual(pln(1500_00)); // uncorrected -> forecast
	});

	test("one correction makes the month's total corrected-plus-forecast, and marks it as actual", () => {
		const aug = findMonth(
			computePlanResults(augustPlan({ oneTimeExpenseActuals: [oneTimeCorrection(1, 5300_00)] })),
			"2026-08",
		);
		expect(aug.oneTimeTotal.forecast).toEqual(pln(6500_00));
		expect(aug.oneTimeTotal.effective).toEqual(pln(6800_00)); // 5300 corrected + 1500 still planned
		expect(aug.oneTimeTotal.variance).toEqual(pln(300_00));
		expect(aug.hasAnyActual).toBe(true);
		expect(aug.balanceSource).toBe("actual");
	});

	test("no corrections leaves the month on its forecast and unflagged", () => {
		const aug = findMonth(computePlanResults(augustPlan()), "2026-08");
		expect(aug.oneTimeTotal.effective).toEqual(aug.oneTimeTotal.forecast);
		expect(aug.oneTimeRows.every((r) => r.actual === null)).toBe(true);
		expect(aug.hasAnyActual).toBe(false);
		expect(aug.balanceSource).toBe("forecast");
	});

	test("per-item corrections take precedence over the legacy monthly lump sum", () => {
		const legacyOnly = findMonth(
			computePlanResults(
				augustPlan({ monthlyActuals: [{ month: "2026-08", income: null, oneTimeExpense: pln(9000_00), investment: null }] }),
			),
			"2026-08",
		);
		expect(legacyOnly.oneTimeTotal.effective).toEqual(pln(9000_00)); // still honoured on its own

		const bothPresent = findMonth(
			computePlanResults(
				augustPlan({
					monthlyActuals: [{ month: "2026-08", income: null, oneTimeExpense: pln(9000_00), investment: null }],
					oneTimeExpenseActuals: [oneTimeCorrection(1, 5300_00)],
				}),
			),
			"2026-08",
		);
		expect(bothPresent.oneTimeTotal.effective).toEqual(pln(6800_00));
	});

	test("a correction on an item outside the plan range changes nothing", () => {
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-08",
			oneTime: [oneTime(1, "2026-08-06", 5000_00), oneTime(9, "2026-07-01", 400_00)],
			oneTimeExpenseActuals: [oneTimeCorrection(9, 999_00)],
		});
		const aug = findMonth(computePlanResults(input), "2026-08");
		expect(aug.oneTimeRows.map((r) => r.id)).toEqual([1]);
		expect(aug.oneTimeTotal.effective).toEqual(pln(5000_00));
		expect(aug.hasAnyActual).toBe(false);
	});

	test("a correction in an early month cascades into every later cumulative balance", () => {
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-10",
			incomes: [income(1, "2026-08-01", 8000_00)],
			oneTime: [oneTime(1, "2026-08-06", 5000_00)],
		});
		const before = computePlanResults(input);
		const after = computePlanResults({ ...input, oneTimeExpenseActuals: [oneTimeCorrection(1, 5800_00)] });

		// Paying 800 more than planned pushes every later cumulative balance down by 800.
		for (const month of ["2026-08", "2026-09", "2026-10"]) {
			expect(findMonth(after, month).cumulativeBalance.effective.amountMinor).toBe(
				findMonth(before, month).cumulativeBalance.effective.amountMinor - 800_00,
			);
			// The forecast line is the reference the variance is measured against — never mutated.
			expect(findMonth(after, month).cumulativeBalance.forecast).toEqual(
				findMonth(before, month).cumulativeBalance.forecast,
			);
		}
	});
});

describe("computePlanResults — balance hierarchy and cascade", () => {
	test("hierarchy: override beats actual, actual beats forecast", () => {
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-08",
			incomes: [income(1, "2026-08-01", 5000_00)],
			recurring: [recurring(1, "Czynsz", 1500_00)],
			monthlyActuals: [{ month: "2026-08", income: pln(4000_00), oneTimeExpense: null, investment: null }],
			overrides: [{ month: "2026-08", balance: pln(999_00) }],
		});
		const aug = findMonth(computePlanResults(input), "2026-08");
		expect(aug.balanceSource).toBe("override");
		expect(aug.monthlyBalance.effective).toEqual(pln(999_00));
	});

	test("without an override, actual-derived balance wins over forecast", () => {
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-08",
			incomes: [income(1, "2026-08-01", 5000_00)],
			recurring: [recurring(1, "Czynsz", 1500_00)],
			monthlyActuals: [{ month: "2026-08", income: pln(4000_00), oneTimeExpense: null, investment: null }],
		});
		const aug = findMonth(computePlanResults(input), "2026-08");
		expect(aug.balanceSource).toBe("actual");
		expect(aug.monthlyBalance.forecast).toEqual(pln(3500_00)); // 5000 - 1500
		expect(aug.monthlyBalance.effective).toEqual(pln(2500_00)); // 4000 - 1500
	});

	test("with no actuals or override, effective balance equals forecast", () => {
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-08",
			incomes: [income(1, "2026-08-01", 5000_00)],
			recurring: [recurring(1, "Czynsz", 1500_00)],
		});
		const aug = findMonth(computePlanResults(input), "2026-08");
		expect(aug.balanceSource).toBe("forecast");
		expect(aug.monthlyBalance.effective).toEqual(aug.monthlyBalance.forecast);
	});

	test("an actual entered in an early month cascades through every later month's cumulative balance", () => {
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-10",
			openingBalance: pln(1000_00),
			incomes: [income(1, "2026-08-01", 3000_00), income(2, "2026-09-01", 3000_00), income(3, "2026-10-01", 3000_00)],
			recurring: [recurring(1, "Czynsz", 2000_00)],
		});

		const before = computePlanResults(input);
		const beforeOct = findMonth(before, "2026-10");
		expect(beforeOct.cumulativeBalance.effective).toEqual(beforeOct.cumulativeBalance.forecast);

		const withActual = computePlanResults({
			...input,
			monthlyActuals: [{ month: "2026-08", income: pln(5000_00), oneTimeExpense: null, investment: null }],
		});
		const augDelta = 5000_00 - 3000_00;
		expect(findMonth(withActual, "2026-08").cumulativeBalance.effective.amountMinor).toBe(
			findMonth(before, "2026-08").cumulativeBalance.effective.amountMinor + augDelta,
		);
		expect(findMonth(withActual, "2026-09").cumulativeBalance.effective.amountMinor).toBe(
			findMonth(before, "2026-09").cumulativeBalance.effective.amountMinor + augDelta,
		);
		const afterOct = findMonth(withActual, "2026-10");
		expect(afterOct.cumulativeBalance.effective.amountMinor).toBe(beforeOct.cumulativeBalance.effective.amountMinor + augDelta);
		// forecast side is untouched by an actual entry
		expect(afterOct.cumulativeBalance.forecast).toEqual(beforeOct.cumulativeBalance.forecast);
	});
});

describe("computePlanResults — variance and risk flags", () => {
	test("variance is effective minus forecast; positive means better than plan", () => {
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-08",
			incomes: [income(1, "2026-08-01", 5000_00)],
			recurring: [recurring(1, "Czynsz", 1500_00)],
			monthlyActuals: [{ month: "2026-08", income: pln(5500_00), oneTimeExpense: null, investment: null }],
		});
		const aug = findMonth(computePlanResults(input), "2026-08");
		expect(aug.income.variance).toEqual(pln(500_00));
		expect(aug.monthlyBalance.variance).toEqual(pln(500_00));
	});

	test("flags a negative monthly balance and a negative cumulative balance", () => {
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-09",
			openingBalance: pln(100_00),
			recurring: [recurring(1, "Czynsz", 5000_00)], // no income at all -> deep negative every month
		});
		const results = computePlanResults(input);
		const aug = findMonth(results, "2026-08");
		const sep = findMonth(results, "2026-09");
		expect(aug.flags.negativeMonthlyBalance).toBe(true);
		expect(aug.flags.negativeCumulativeBalance).toBe(true);
		expect(sep.flags.negativeMonthlyBalance).toBe(true);
		expect(sep.flags.negativeCumulativeBalance).toBe(true);
	});

	test("does not flag a healthy plan", () => {
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-08",
			incomes: [income(1, "2026-08-01", 5000_00)],
			recurring: [recurring(1, "Czynsz", 1500_00)],
		});
		const aug = findMonth(computePlanResults(input), "2026-08");
		expect(aug.flags.negativeMonthlyBalance).toBe(false);
		expect(aug.flags.negativeCumulativeBalance).toBe(false);
	});
});

describe("computePlanResults — investment allocation integration", () => {
	test("forecast investment contributions sum exactly to the configured target across the covered range", () => {
		const investment: InvestmentConfig = {
			totalTarget: pln(6000_00),
			monthlyMinimum: pln(500_00),
			startMonth: "2026-08",
			endMonth: "2027-01",
		};
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2027-01",
			incomes: [
				income(1, "2026-08-01", 4000_00),
				income(2, "2026-09-01", 3000_00),
				income(3, "2026-10-01", 6000_00),
				income(4, "2026-11-01", 2500_00),
				income(5, "2026-12-01", 5000_00),
				income(6, "2027-01-01", 3500_00),
			],
			recurring: [recurring(1, "Czynsz", 2000_00)],
			investment,
		});
		const results = computePlanResults(input);
		const totalInvested = results.months.reduce((sum, m) => sum + m.investment.forecast.amountMinor, 0);
		expect(totalInvested).toBe(600000);
		for (const m of results.months) {
			expect(m.investment.forecast.amountMinor).toBeGreaterThanOrEqual(50000);
		}
	});

	test("investment range narrower than the plan only allocates within that range", () => {
		const investment: InvestmentConfig = {
			totalTarget: pln(1000_00),
			monthlyMinimum: pln(500_00),
			startMonth: "2026-08",
			endMonth: "2026-09",
		};
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-10",
			incomes: [income(1, "2026-08-01", 5000_00), income(2, "2026-09-01", 5000_00), income(3, "2026-10-01", 5000_00)],
			investment,
		});
		const results = computePlanResults(input);
		expect(findMonth(results, "2026-10").investment.forecast).toEqual(zeroMoney(CURRENCY));
		const sumInRange = findMonth(results, "2026-08").investment.forecast.amountMinor +
			findMonth(results, "2026-09").investment.forecast.amountMinor;
		expect(sumInRange).toBe(1000_00);
	});

	test("investment allocation is not re-run on effective values — actual investment only overrides that month's figure", () => {
		const investment: InvestmentConfig = {
			totalTarget: pln(1000_00),
			monthlyMinimum: pln(500_00),
			startMonth: "2026-08",
			endMonth: "2026-09",
		};
		const input = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-09",
			incomes: [income(1, "2026-08-01", 5000_00), income(2, "2026-09-01", 5000_00)],
			investment,
			monthlyActuals: [{ month: "2026-08", income: pln(50_00) /* much lower actual income */, oneTimeExpense: null, investment: null }],
		});
		const results = computePlanResults(input);
		const aug = findMonth(results, "2026-08");
		const sep = findMonth(results, "2026-09");
		// forecast allocation is untouched by the actual income drop
		expect(aug.investment.forecast).toEqual(pln(500_00));
		expect(sep.investment.forecast).toEqual(pln(500_00));
		expect(aug.investment.effective).toEqual(pln(500_00)); // no investment actual entered -> forecast stands
	});
});

describe("computePlanResults — overrides", () => {
	test("an override clears back to computed balance when removed", () => {
		const withOverride = basePlan({
			startMonth: "2026-08",
			endMonth: "2026-08",
			incomes: [income(1, "2026-08-01", 5000_00)],
			recurring: [recurring(1, "Czynsz", 1500_00)],
			overrides: [{ month: "2026-08", balance: pln(1_00) }],
		});
		expect(findMonth(computePlanResults(withOverride), "2026-08").balanceSource).toBe("override");

		const withoutOverride: MonthlyOverride[] = [];
		const cleared = computePlanResults({ ...withOverride, overrides: withoutOverride });
		expect(findMonth(cleared, "2026-08").balanceSource).toBe("forecast");
		expect(findMonth(cleared, "2026-08").monthlyBalance.effective).toEqual(pln(3500_00));
	});
});
