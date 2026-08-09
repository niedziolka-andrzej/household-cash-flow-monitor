import { describe, expect, test } from "bun:test";
import { isValidIsoDate, parseDateInput } from "../src/shared/dates";
import { parseMonthInput } from "../src/shared/months";

describe("parseDateInput", () => {
	test("accepts the canonical ISO form", () => {
		expect(parseDateInput("2026-08-09")).toBe("2026-08-09");
	});

	test("normalizes single-digit month and day", () => {
		expect(parseDateInput("2026-8-9")).toBe("2026-08-09");
	});

	test("accepts Polish-locale spreadsheet output (DD.MM.YYYY)", () => {
		expect(parseDateInput("09.08.2026")).toBe("2026-08-09");
		expect(parseDateInput("9.8.2026")).toBe("2026-08-09");
		expect(parseDateInput("09-08-2026")).toBe("2026-08-09");
	});

	test("accepts slash and dot separators in ISO order", () => {
		expect(parseDateInput("2026/08/09")).toBe("2026-08-09");
		expect(parseDateInput("2026.08.09")).toBe("2026-08-09");
	});

	test("strips a trailing time component from date-time pastes", () => {
		expect(parseDateInput("2026-08-09 00:00:00")).toBe("2026-08-09");
		expect(parseDateInput("2026-08-09T13:45")).toBe("2026-08-09");
		expect(parseDateInput("09.08.2026 07:30:15")).toBe("2026-08-09");
	});

	test("tolerates surrounding whitespace and quotes from clipboard content", () => {
		expect(parseDateInput("  2026-08-09  ")).toBe("2026-08-09");
		expect(parseDateInput('"2026-08-09"')).toBe("2026-08-09");
	});

	test("blank input means 'not set', not an error", () => {
		expect(parseDateInput("")).toBeNull();
		expect(parseDateInput("   ")).toBeNull();
	});

	test("rejects impossible calendar dates", () => {
		expect(parseDateInput("2026-02-30")).toBeNull();
		expect(parseDateInput("2026-13-01")).toBeNull();
		expect(parseDateInput("2026-00-10")).toBeNull();
	});

	test("handles leap years", () => {
		expect(parseDateInput("2024-02-29")).toBe("2024-02-29");
		expect(parseDateInput("2026-02-29")).toBeNull();
	});

	test("rejects ambiguous two-digit years and garbage", () => {
		expect(parseDateInput("01.02.03")).toBeNull();
		expect(parseDateInput("nie-data")).toBeNull();
		expect(parseDateInput("2026-08")).toBeNull();
	});
});

describe("isValidIsoDate", () => {
	test("only accepts a real, zero-padded ISO date", () => {
		expect(isValidIsoDate("2026-08-09")).toBe(true);
		expect(isValidIsoDate("2026-8-9")).toBe(false);
		expect(isValidIsoDate("2026-02-30")).toBe(false);
	});
});

describe("parseMonthInput", () => {
	test("accepts the canonical form and pads single digits", () => {
		expect(parseMonthInput("2026-08")).toBe("2026-08");
		expect(parseMonthInput("2026-8")).toBe("2026-08");
		expect(parseMonthInput("2026/08")).toBe("2026-08");
	});

	test("accepts month-first form (MM.YYYY)", () => {
		expect(parseMonthInput("08.2026")).toBe("2026-08");
		expect(parseMonthInput("8.2026")).toBe("2026-08");
	});

	test("keeps the month when a full date is pasted into a month field", () => {
		expect(parseMonthInput("2026-08-09")).toBe("2026-08");
		expect(parseMonthInput("09.08.2026")).toBe("2026-08");
	});

	test("blank input means 'not set'", () => {
		expect(parseMonthInput("")).toBeNull();
		expect(parseMonthInput("  ")).toBeNull();
	});

	test("rejects out-of-range months and garbage", () => {
		expect(parseMonthInput("2026-13")).toBeNull();
		expect(parseMonthInput("2026-00")).toBeNull();
		expect(parseMonthInput("sierpień 2026")).toBeNull();
		expect(parseMonthInput("2026")).toBeNull();
	});
});
