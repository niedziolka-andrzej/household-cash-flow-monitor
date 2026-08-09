import { describe, expect, test } from "bun:test";
import { allocateInvestment } from "../src/shared/engine/allocation";
import { monthRange } from "../src/shared/months";

function sumOf(map: Map<string, number>): number {
	return [...map.values()].reduce((a, b) => a + b, 0);
}

describe("allocateInvestment", () => {
	test("splits the pool proportionally to positive forecast surplus", () => {
		const months = ["2026-01", "2026-02", "2026-03"];
		const surplus = new Map([
			["2026-01", 1000_00],
			["2026-02", 2000_00],
			["2026-03", 3000_00],
		]);
		const result = allocateInvestment({
			months,
			forecastSurplusMinor: surplus,
			totalTargetMinor: 600_00,
			monthlyMinimumMinor: 0,
		});
		// weights 1:2:3 over a 600 pool -> 100/200/300
		expect(result.get("2026-01")).toBe(100_00);
		expect(result.get("2026-02")).toBe(200_00);
		expect(result.get("2026-03")).toBe(300_00);
		expect(sumOf(result)).toBe(600_00);
	});

	test("every covered month gets at least the minimum first", () => {
		const months = ["2026-01", "2026-02"];
		const surplus = new Map([
			["2026-01", 100_00],
			["2026-02", 900_00],
		]);
		const result = allocateInvestment({
			months,
			forecastSurplusMinor: surplus,
			totalTargetMinor: 1000_00,
			monthlyMinimumMinor: 50_00,
		});
		expect(result.get("2026-01")!).toBeGreaterThanOrEqual(50_00);
		expect(result.get("2026-02")!).toBeGreaterThanOrEqual(50_00);
		expect(sumOf(result)).toBe(1000_00);
	});

	test("a month with negative or zero forecast surplus gets only the minimum", () => {
		const months = ["2026-01", "2026-02", "2026-03"];
		const surplus = new Map([
			["2026-01", -500_00], // deficit month: minimum only, per plan.md's documented intent
			["2026-02", 0],
			["2026-03", 1000_00],
		]);
		const result = allocateInvestment({
			months,
			forecastSurplusMinor: surplus,
			totalTargetMinor: 700_00,
			monthlyMinimumMinor: 100_00,
		});
		expect(result.get("2026-01")).toBe(100_00);
		expect(result.get("2026-02")).toBe(100_00);
		expect(result.get("2026-03")).toBe(500_00); // 100 minimum + entire 400 pool (sole positive-weight month)
		expect(sumOf(result)).toBe(700_00);
	});

	test("pool exactly equal to the sum of minimums: everyone gets exactly the minimum", () => {
		const months = ["2026-01", "2026-02", "2026-03"];
		const surplus = new Map(months.map((m) => [m, 1000_00]));
		const result = allocateInvestment({
			months,
			forecastSurplusMinor: surplus,
			totalTargetMinor: 300_00,
			monthlyMinimumMinor: 100_00,
		});
		for (const m of months) expect(result.get(m)).toBe(100_00);
		expect(sumOf(result)).toBe(300_00);
	});

	test("edge case: no month has a positive surplus — pool splits evenly, remainder to earliest months", () => {
		const months = monthRange("2026-01", "2026-04"); // 4 months
		const surplus = new Map(months.map((m) => [m, -100_00]));
		const result = allocateInvestment({
			months,
			forecastSurplusMinor: surplus,
			totalTargetMinor: 1003, // pool = 1003 after 0 minimum, 1003 / 4 = 250 r3
			monthlyMinimumMinor: 0,
		});
		expect(sumOf(result)).toBe(1003);
		// remainder groszy go to the earliest months
		expect(result.get(months[0])).toBe(251);
		expect(result.get(months[1])).toBe(251);
		expect(result.get(months[2])).toBe(251);
		expect(result.get(months[3])).toBe(250);
	});

	test("empty month list yields an empty map", () => {
		const result = allocateInvestment({
			months: [],
			forecastSurplusMinor: new Map(),
			totalTargetMinor: 0,
			monthlyMinimumMinor: 0,
		});
		expect(result.size).toBe(0);
	});

	test("is deterministic for the same input", () => {
		const months = ["2026-01", "2026-02", "2026-03", "2026-04"];
		const surplus = new Map([
			["2026-01", 333_00],
			["2026-02", 111_00],
			["2026-03", 777_00],
			["2026-04", 222_00],
		]);
		const args = { months, forecastSurplusMinor: surplus, totalTargetMinor: 12345, monthlyMinimumMinor: 500 };
		const a = allocateInvestment(args);
		const b = allocateInvestment(args);
		expect([...a.entries()]).toEqual([...b.entries()]);
	});

	test("exact-sum invariant holds under randomized inputs", () => {
		for (let trial = 0; trial < 200; trial++) {
			const monthCount = 1 + Math.floor(Math.random() * 24);
			const months = Array.from({ length: monthCount }, (_, i) => `m${i}`);
			const minimum = Math.floor(Math.random() * 10_000);
			const baseSum = minimum * monthCount;
			const extraPool = Math.floor(Math.random() * 1_000_000);
			const target = baseSum + extraPool;

			const surplus = new Map(
				months.map((m) => [m, Math.floor(Math.random() * 200_000) - 50_000]), // some negative, some positive
			);

			const result = allocateInvestment({
				months,
				forecastSurplusMinor: surplus,
				totalTargetMinor: target,
				monthlyMinimumMinor: minimum,
			});

			expect(sumOf(result)).toBe(target);
			for (const m of months) {
				expect(result.get(m)!).toBeGreaterThanOrEqual(minimum);
			}
		}
	});
});
