import { beforeEach, describe, expect, test } from "bun:test";
import { createDatabase, type AppDatabase } from "../src/bun/db/database";
import {
	createIncomeItem,
	createOneTimeExpense,
	createRecurringExpense,
	deleteIncomeItem,
	deleteOneTimeExpense,
	getInvestmentConfig,
	listIncomeItems,
	listOneTimeExpenses,
	listRecurringExpenses,
	saveInvestmentConfig,
	updateIncomeItem,
} from "../src/bun/db/repositories/itemsRepo";
import {
	createPlanCore,
	deletePlanCore,
	duplicatePlanCore,
	getPlanCore,
	listPlanCores,
	updatePlanCore,
} from "../src/bun/db/repositories/planRepo";
import {
	listMonthlyActuals,
	listOneTimeExpenseActuals,
	listOverrides,
	listRecurringExpenseActuals,
	upsertMonthlyActualField,
	upsertOneTimeExpenseActual,
	upsertOverride,
	upsertRecurringExpenseActual,
} from "../src/bun/db/repositories/actualsRepo";
import { buildSnapshot, listPlanSummaries } from "../src/bun/rpc/snapshot";
import { money } from "../src/shared/money";

let db: AppDatabase;

beforeEach(() => {
	db = createDatabase(":memory:");
});

describe("migrations", () => {
	test("apply cleanly to a fresh database and are idempotent", () => {
		// createDatabase already ran migrations once in beforeEach; running again on the
		// same connection must be a no-op, not an error (e.g. re-running CREATE TABLE).
		expect(() => createDatabase(":memory:")).not.toThrow();
		const plan = createPlanCore(db, {
			name: "smoke",
			startMonth: "2026-01",
			endMonth: "2026-01",
			currency: "PLN",
			openingBalance: money(0, "PLN"),
		});
		expect(plan.id).toBeGreaterThan(0);
	});
});

describe("planRepo", () => {
	test("create / get / update / list / delete", () => {
		const created = createPlanCore(db, {
			name: "Budżet 2026",
			startMonth: "2026-08",
			endMonth: "2027-01",
			currency: "PLN",
			openingBalance: money(150000, "PLN"),
		});
		expect(getPlanCore(db, created.id)).toEqual(created);
		expect(listPlanCores(db)).toEqual([created]);

		const updated = updatePlanCore(db, created.id, { name: "Budżet zaktualizowany" });
		expect(updated.name).toBe("Budżet zaktualizowany");
		expect(updated.startMonth).toBe("2026-08"); // untouched fields preserved

		deletePlanCore(db, created.id);
		expect(getPlanCore(db, created.id)).toBeNull();
	});

	test("deleting a plan cascades to its child rows", () => {
		const plan = createPlanCore(db, {
			name: "P",
			startMonth: "2026-01",
			endMonth: "2026-06",
			currency: "PLN",
			openingBalance: money(0, "PLN"),
		});
		const recurringItem = createRecurringExpense(db, plan.id, {
			name: "Czynsz",
			monthly: money(150000, "PLN"),
			startMonth: null,
			endMonth: null,
			sortOrder: 0,
		});
		createIncomeItem(db, plan.id, { name: "Wypłata", date: "2026-01-10", forecast: money(500000, "PLN") });
		upsertOverride(db, plan.id, "2026-01", { amountMinor: 100, currency: "PLN" });
		upsertRecurringExpenseActual(db, plan.id, recurringItem.id, "2026-01", { amountMinor: 200, currency: "PLN" });

		deletePlanCore(db, plan.id);

		expect(listIncomeItems(db, plan.id)).toEqual([]);
		expect(listRecurringExpenses(db, plan.id)).toEqual([]);
		expect(listOverrides(db, plan.id)).toEqual([]);
		expect(listRecurringExpenseActuals(db, plan.id)).toEqual([]);
	});

	test("duplicatePlanCore deep-copies assumptions, actuals and overrides with remapped item ids", () => {
		const source = createPlanCore(db, {
			name: "Oryginał",
			startMonth: "2026-01",
			endMonth: "2026-03",
			currency: "PLN",
			openingBalance: money(1000_00, "PLN"),
		});
		const rent = createRecurringExpense(db, source.id, {
			name: "Czynsz",
			monthly: money(1500_00, "PLN"),
			startMonth: null,
			endMonth: null,
			sortOrder: 0,
		});
		createIncomeItem(db, source.id, { name: "Wypłata", date: "2026-01-10", forecast: money(5000_00, "PLN") });
		const bike = createOneTimeExpense(db, source.id, {
			name: "Rower",
			date: "2026-01-06",
			forecast: money(5000_00, "PLN"),
		});
		upsertOneTimeExpenseActual(db, source.id, bike.id, { amountMinor: 5300_00, currency: "PLN" });
		saveInvestmentConfig(db, source.id, {
			totalTarget: money(300_00, "PLN"),
			monthlyMinimum: money(100_00, "PLN"),
			startMonth: "2026-01",
			endMonth: "2026-03",
		});
		upsertRecurringExpenseActual(db, source.id, rent.id, "2026-01", { amountMinor: 1400_00, currency: "PLN" });
		upsertMonthlyActualField(db, source.id, "2026-01", "income", { amountMinor: 5200_00, currency: "PLN" });
		upsertOverride(db, source.id, "2026-02", { amountMinor: 42, currency: "PLN" });

		const copy = duplicatePlanCore(db, source.id, "Kopia");

		expect(copy.id).not.toBe(source.id);
		expect(copy.name).toBe("Kopia");
		expect(copy.startMonth).toBe(source.startMonth);
		expect(copy.openingBalance).toEqual(source.openingBalance);

		const copiedIncomes = listIncomeItems(db, copy.id);
		expect(copiedIncomes).toHaveLength(1);
		expect(copiedIncomes[0].planId).toBe(copy.id);
		expect(copiedIncomes[0].id).not.toBe(0);

		const copiedRecurring = listRecurringExpenses(db, copy.id);
		expect(copiedRecurring).toHaveLength(1);
		const copiedRentId = copiedRecurring[0].id;
		expect(copiedRentId).not.toBe(rent.id);

		expect(getInvestmentConfig(db, copy.id)).toEqual(getInvestmentConfig(db, source.id));

		const copiedRecurringActuals = listRecurringExpenseActuals(db, copy.id);
		expect(copiedRecurringActuals).toEqual([
			{ recurringExpenseId: copiedRentId, month: "2026-01", amount: money(1400_00, "PLN") },
		]);

		const copiedOneTime = listOneTimeExpenses(db, copy.id);
		expect(copiedOneTime).toHaveLength(1);
		expect(copiedOneTime[0].id).not.toBe(bike.id);
		expect(listOneTimeExpenseActuals(db, copy.id)).toEqual([
			{ oneTimeExpenseId: copiedOneTime[0].id, amount: money(5300_00, "PLN") },
		]);
		// The original keeps its own correction, still pointing at its own item.
		expect(listOneTimeExpenseActuals(db, source.id)).toEqual([
			{ oneTimeExpenseId: bike.id, amount: money(5300_00, "PLN") },
		]);

		expect(listMonthlyActuals(db, copy.id).find((a) => a.month === "2026-01")?.income).toEqual(money(5200_00, "PLN"));
		expect(listOverrides(db, copy.id)).toEqual([{ month: "2026-02", balance: money(42, "PLN") }]);

		// Original plan is untouched by the copy.
		expect(listIncomeItems(db, source.id)).toHaveLength(1);
		expect(listRecurringExpenses(db, source.id)).toHaveLength(1);
	});
});

describe("itemsRepo", () => {
	test("income item CRUD", () => {
		const plan = createPlanCore(db, {
			name: "P",
			startMonth: "2026-01",
			endMonth: "2026-01",
			currency: "PLN",
			openingBalance: money(0, "PLN"),
		});
		const item = createIncomeItem(db, plan.id, { name: "Wypłata", date: "2026-01-10", forecast: money(5000_00, "PLN") });
		expect(listIncomeItems(db, plan.id)).toEqual([item]);

		const updated = updateIncomeItem(db, plan.id, item.id, { forecast: money(5500_00, "PLN") });
		expect(updated.forecast).toEqual(money(5500_00, "PLN"));
		expect(updated.name).toBe("Wypłata"); // untouched

		deleteIncomeItem(db, plan.id, item.id);
		expect(listIncomeItems(db, plan.id)).toEqual([]);
	});

	test("saveInvestmentConfig upserts and removes on null", () => {
		const plan = createPlanCore(db, {
			name: "P",
			startMonth: "2026-01",
			endMonth: "2026-06",
			currency: "PLN",
			openingBalance: money(0, "PLN"),
		});
		expect(getInvestmentConfig(db, plan.id)).toBeNull();

		saveInvestmentConfig(db, plan.id, {
			totalTarget: money(1000_00, "PLN"),
			monthlyMinimum: money(100_00, "PLN"),
			startMonth: "2026-01",
			endMonth: "2026-06",
		});
		expect(getInvestmentConfig(db, plan.id)?.totalTarget).toEqual(money(1000_00, "PLN"));

		saveInvestmentConfig(db, plan.id, {
			totalTarget: money(2000_00, "PLN"),
			monthlyMinimum: money(100_00, "PLN"),
			startMonth: "2026-01",
			endMonth: "2026-06",
		});
		expect(getInvestmentConfig(db, plan.id)?.totalTarget).toEqual(money(2000_00, "PLN"));

		saveInvestmentConfig(db, plan.id, null);
		expect(getInvestmentConfig(db, plan.id)).toBeNull();
	});
});

describe("actualsRepo upsert/clear semantics", () => {
	test("upsertMonthlyActualField sets and clears one field without touching siblings", () => {
		const plan = createPlanCore(db, {
			name: "P",
			startMonth: "2026-01",
			endMonth: "2026-01",
			currency: "PLN",
			openingBalance: money(0, "PLN"),
		});
		upsertMonthlyActualField(db, plan.id, "2026-01", "income", { amountMinor: 5000_00, currency: "PLN" });
		upsertMonthlyActualField(db, plan.id, "2026-01", "investment", { amountMinor: 100_00, currency: "PLN" });

		let row = listMonthlyActuals(db, plan.id)[0];
		expect(row.income).toEqual(money(5000_00, "PLN"));
		expect(row.investment).toEqual(money(100_00, "PLN"));
		expect(row.oneTimeExpense).toBeNull();

		upsertMonthlyActualField(db, plan.id, "2026-01", "income", null);
		row = listMonthlyActuals(db, plan.id)[0];
		expect(row.income).toBeNull();
		expect(row.investment).toEqual(money(100_00, "PLN")); // sibling untouched
	});

	test("clearing a field that was never set on a nonexistent row is a no-op, not an error", () => {
		const plan = createPlanCore(db, {
			name: "P",
			startMonth: "2026-01",
			endMonth: "2026-01",
			currency: "PLN",
			openingBalance: money(0, "PLN"),
		});
		expect(() => upsertMonthlyActualField(db, plan.id, "2026-01", "income", null)).not.toThrow();
		expect(listMonthlyActuals(db, plan.id)).toEqual([]);
	});

	test("upsertOneTimeExpenseActual sets, updates and clears a per-item correction", () => {
		const plan = createPlanCore(db, {
			name: "P",
			startMonth: "2026-01",
			endMonth: "2026-01",
			currency: "PLN",
			openingBalance: money(0, "PLN"),
		});
		const item = createOneTimeExpense(db, plan.id, {
			name: "Rower",
			date: "2026-01-06",
			forecast: money(5000_00, "PLN"),
		});

		upsertOneTimeExpenseActual(db, plan.id, item.id, { amountMinor: 5300_00, currency: "PLN" });
		expect(listOneTimeExpenseActuals(db, plan.id)).toEqual([
			{ oneTimeExpenseId: item.id, amount: money(5300_00, "PLN") },
		]);

		upsertOneTimeExpenseActual(db, plan.id, item.id, { amountMinor: 5100_00, currency: "PLN" });
		expect(listOneTimeExpenseActuals(db, plan.id)).toEqual([
			{ oneTimeExpenseId: item.id, amount: money(5100_00, "PLN") },
		]);

		upsertOneTimeExpenseActual(db, plan.id, item.id, null);
		expect(listOneTimeExpenseActuals(db, plan.id)).toEqual([]);
	});

	test("a correction on an item from another plan is rejected", () => {
		const planA = createPlanCore(db, {
			name: "A",
			startMonth: "2026-01",
			endMonth: "2026-01",
			currency: "PLN",
			openingBalance: money(0, "PLN"),
		});
		const planB = createPlanCore(db, {
			name: "B",
			startMonth: "2026-01",
			endMonth: "2026-01",
			currency: "PLN",
			openingBalance: money(0, "PLN"),
		});
		const item = createOneTimeExpense(db, planA.id, {
			name: "Rower",
			date: "2026-01-06",
			forecast: money(5000_00, "PLN"),
		});
		expect(() => upsertOneTimeExpenseActual(db, planB.id, item.id, { amountMinor: 1_00, currency: "PLN" })).toThrow();
	});

	test("deleting the one-time expense takes its correction with it", () => {
		const plan = createPlanCore(db, {
			name: "P",
			startMonth: "2026-01",
			endMonth: "2026-01",
			currency: "PLN",
			openingBalance: money(0, "PLN"),
		});
		const item = createOneTimeExpense(db, plan.id, {
			name: "Rower",
			date: "2026-01-06",
			forecast: money(5000_00, "PLN"),
		});
		upsertOneTimeExpenseActual(db, plan.id, item.id, { amountMinor: 5300_00, currency: "PLN" });

		deleteOneTimeExpense(db, plan.id, item.id);

		expect(listOneTimeExpenses(db, plan.id)).toEqual([]);
		expect(listOneTimeExpenseActuals(db, plan.id)).toEqual([]);
	});

	test("upsertOverride sets then clears", () => {
		const plan = createPlanCore(db, {
			name: "P",
			startMonth: "2026-01",
			endMonth: "2026-01",
			currency: "PLN",
			openingBalance: money(0, "PLN"),
		});
		upsertOverride(db, plan.id, "2026-01", { amountMinor: 999, currency: "PLN" });
		expect(listOverrides(db, plan.id)).toEqual([{ month: "2026-01", balance: money(999, "PLN") }]);
		upsertOverride(db, plan.id, "2026-01", null);
		expect(listOverrides(db, plan.id)).toEqual([]);
	});
});

describe("snapshot assembly", () => {
	test("buildSnapshot returns computed results consistent with the engine, listPlanSummaries reflects risk", () => {
		const plan = createPlanCore(db, {
			name: "P",
			startMonth: "2026-01",
			endMonth: "2026-02",
			currency: "PLN",
			openingBalance: money(0, "PLN"),
		});
		createRecurringExpense(db, plan.id, {
			name: "Czynsz",
			monthly: money(5000_00, "PLN"),
			startMonth: null,
			endMonth: null,
			sortOrder: 0,
		}); // no income at all -> guaranteed negative balance every month

		const snapshot = buildSnapshot(db, plan.id);
		expect(snapshot.results.months).toHaveLength(2);
		expect(snapshot.results.months[0].flags.negativeMonthlyBalance).toBe(true);

		const summaries = listPlanSummaries(db);
		expect(summaries).toHaveLength(1);
		expect(summaries[0].hasRisk).toBe(true);
	});
});
