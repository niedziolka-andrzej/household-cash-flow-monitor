import { describe, expect, test } from "bun:test";
import {
	addMonths,
	compareMonths,
	intersectMonthRanges,
	isMonthAfter,
	isMonthBefore,
	isValidMonth,
	monthCount,
	monthOfDate,
	monthRange,
} from "../src/shared/months";

describe("isValidMonth", () => {
	test("accepts well-formed months", () => {
		expect(isValidMonth("2026-01")).toBe(true);
		expect(isValidMonth("2026-12")).toBe(true);
	});
	test("rejects malformed months", () => {
		expect(isValidMonth("2026-13")).toBe(false);
		expect(isValidMonth("2026-00")).toBe(false);
		expect(isValidMonth("2026-1")).toBe(false);
		expect(isValidMonth("26-01")).toBe(false);
		expect(isValidMonth("not-a-month")).toBe(false);
	});
});

test("monthOfDate extracts YYYY-MM", () => {
	expect(monthOfDate("2026-08-09")).toBe("2026-08");
});

describe("compareMonths / isMonthBefore / isMonthAfter", () => {
	test("orders chronologically, including across year boundaries", () => {
		expect(compareMonths("2026-01", "2026-02")).toBe(-1);
		expect(compareMonths("2026-12", "2027-01")).toBe(-1);
		expect(compareMonths("2026-05", "2026-05")).toBe(0);
		expect(compareMonths("2026-05", "2026-01")).toBe(1);
		expect(isMonthBefore("2026-01", "2026-02")).toBe(true);
		expect(isMonthAfter("2026-02", "2026-01")).toBe(true);
	});
});

describe("addMonths", () => {
	test("adds within a year", () => {
		expect(addMonths("2026-01", 1)).toBe("2026-02");
	});
	test("rolls over to the next year", () => {
		expect(addMonths("2026-11", 3)).toBe("2027-02");
	});
	test("rolls back over the previous year with negative delta", () => {
		expect(addMonths("2026-01", -1)).toBe("2025-12");
	});
	test("delta 0 is a no-op", () => {
		expect(addMonths("2026-06", 0)).toBe("2026-06");
	});
});

describe("monthCount / monthRange", () => {
	test("counts inclusively", () => {
		expect(monthCount("2026-01", "2026-01")).toBe(1);
		expect(monthCount("2026-01", "2026-06")).toBe(6);
		expect(monthCount("2026-11", "2027-02")).toBe(4);
	});

	test("monthRange lists every month ascending, inclusive", () => {
		expect(monthRange("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
		expect(monthRange("2026-06", "2026-06")).toEqual(["2026-06"]);
	});

	test("monthRange throws when end precedes start", () => {
		expect(() => monthRange("2026-06", "2026-01")).toThrow();
	});
});

describe("intersectMonthRanges", () => {
	test("clamps a range to the overlap with bounds", () => {
		expect(intersectMonthRanges("2026-01", "2026-12", "2026-06", "2027-06")).toEqual({
			start: "2026-06",
			end: "2026-12",
		});
	});
	test("range fully inside bounds is unchanged", () => {
		expect(intersectMonthRanges("2026-03", "2026-05", "2026-01", "2026-12")).toEqual({
			start: "2026-03",
			end: "2026-05",
		});
	});
	test("disjoint ranges yield null", () => {
		expect(intersectMonthRanges("2026-01", "2026-02", "2026-06", "2026-12")).toBeNull();
	});
});
