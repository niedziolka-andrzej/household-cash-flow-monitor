import { describe, expect, test } from "bun:test";
import {
	addMoney,
	compareMoney,
	CurrencyMismatchError,
	isNegativeMoney,
	isZeroMoney,
	max0Money,
	money,
	parseAmountInput,
	subtractMoney,
	sumMoney,
	zeroMoney,
} from "../src/shared/money";

describe("money arithmetic", () => {
	test("add/subtract within the same currency", () => {
		expect(addMoney(money(100, "PLN"), money(50, "PLN"))).toEqual(money(150, "PLN"));
		expect(subtractMoney(money(100, "PLN"), money(150, "PLN"))).toEqual(money(-50, "PLN"));
	});

	test("refuses to mix currencies", () => {
		expect(() => addMoney(money(100, "PLN"), money(100, "EUR"))).toThrow(CurrencyMismatchError);
		expect(() => subtractMoney(money(100, "PLN"), money(100, "EUR"))).toThrow(CurrencyMismatchError);
		expect(() => compareMoney(money(100, "PLN"), money(100, "EUR"))).toThrow(CurrencyMismatchError);
	});

	test("max0Money clamps negative amounts, keeps currency", () => {
		expect(max0Money(money(-500, "PLN"))).toEqual(zeroMoney("PLN"));
		expect(max0Money(money(500, "PLN"))).toEqual(money(500, "PLN"));
	});

	test("isNegativeMoney / isZeroMoney", () => {
		expect(isNegativeMoney(money(-1, "PLN"))).toBe(true);
		expect(isNegativeMoney(money(0, "PLN"))).toBe(false);
		expect(isZeroMoney(money(0, "PLN"))).toBe(true);
		expect(isZeroMoney(money(1, "PLN"))).toBe(false);
	});

	test("sumMoney sums a list and rejects mixed currencies", () => {
		expect(sumMoney("PLN", [money(100, "PLN"), money(250, "PLN")])).toEqual(money(350, "PLN"));
		expect(sumMoney("PLN", [])).toEqual(zeroMoney("PLN"));
		expect(() => sumMoney("PLN", [money(100, "EUR")])).toThrow(CurrencyMismatchError);
	});

	test("money() rejects non-integer amounts", () => {
		expect(() => money(10.5, "PLN")).toThrow();
	});
});

describe("parseAmountInput", () => {
	test("parses Polish-formatted amounts into grosze", () => {
		expect(parseAmountInput("1 234,56", "PLN")).toEqual(money(123456, "PLN"));
		expect(parseAmountInput("1234,56", "PLN")).toEqual(money(123456, "PLN"));
		expect(parseAmountInput("1234.56", "PLN")).toEqual(money(123456, "PLN"));
		expect(parseAmountInput("1234", "PLN")).toEqual(money(123400, "PLN"));
		expect(parseAmountInput("-50", "PLN")).toEqual(money(-5000, "PLN"));
	});

	test("blank input means 'clear' (null), not zero", () => {
		expect(parseAmountInput("", "PLN")).toBeNull();
		expect(parseAmountInput("   ", "PLN")).toBeNull();
	});

	test("garbage input is null", () => {
		expect(parseAmountInput("abc", "PLN")).toBeNull();
		expect(parseAmountInput("12,34,56", "PLN")).toBeNull();
	});

	test("rounds to the nearest grosz", () => {
		expect(parseAmountInput("10,005", "PLN")).toEqual(money(1001, "PLN"));
	});
});
