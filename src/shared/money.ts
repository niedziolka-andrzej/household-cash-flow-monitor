/**
 * Money as a DDD value type: an amount is meaningless without its currency.
 * `amountMinor` is always an integer in the currency's minor unit (e.g. grosze for PLN,
 * cents for EUR/USD) so all arithmetic in the engine stays exact — no floating point.
 *
 * v1 simplification: every helper here assumes 2 minor-unit digits (as PLN/EUR/USD do).
 * Zero-decimal currencies (e.g. JPY) are out of scope for now — plan.md only targets PLN.
 * Multi-currency plans are not supported either: validation.ts rejects mixing currencies
 * within a single plan. The value-type shape is ready for that extension without a schema
 * change; only the single-currency-per-plan rule would need to be lifted.
 */

export interface Money {
	readonly amountMinor: number;
	readonly currency: string;
}

export class CurrencyMismatchError extends Error {
	constructor(a: string, b: string) {
		super(`Currency mismatch: ${a} vs ${b}`);
		this.name = "CurrencyMismatchError";
	}
}

export function money(amountMinor: number, currency: string): Money {
	if (!Number.isInteger(amountMinor)) {
		throw new Error(`amountMinor must be an integer, got ${amountMinor}`);
	}
	return { amountMinor, currency };
}

export function zeroMoney(currency: string): Money {
	return { amountMinor: 0, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
	if (a.currency !== b.currency) {
		throw new CurrencyMismatchError(a.currency, b.currency);
	}
}

export function addMoney(a: Money, b: Money): Money {
	assertSameCurrency(a, b);
	return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
	assertSameCurrency(a, b);
	return money(a.amountMinor - b.amountMinor, a.currency);
}

export function negateMoney(a: Money): Money {
	return money(-a.amountMinor, a.currency);
}

/** Clamps a negative amount to zero, keeping the currency. */
export function max0Money(a: Money): Money {
	return a.amountMinor < 0 ? zeroMoney(a.currency) : a;
}

export function isNegativeMoney(a: Money): boolean {
	return a.amountMinor < 0;
}

export function isZeroMoney(a: Money): boolean {
	return a.amountMinor === 0;
}

/** -1 / 0 / 1, like Array#sort comparators. Throws on currency mismatch. */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
	assertSameCurrency(a, b);
	if (a.amountMinor < b.amountMinor) return -1;
	if (a.amountMinor > b.amountMinor) return 1;
	return 0;
}

/** Sums a list of Money, all of which must share `currency`. Empty list -> zero. */
export function sumMoney(currency: string, items: readonly Money[]): Money {
	let total = 0;
	for (const item of items) {
		if (item.currency !== currency) {
			throw new CurrencyMismatchError(currency, item.currency);
		}
		total += item.amountMinor;
	}
	return money(total, currency);
}

/**
 * Parses a user-typed amount (Polish formatting: "1 234,56", "1234.56", "1234")
 * into Money. Returns null for blank/invalid input so callers can treat that as
 * "clear this value" rather than a hard error.
 *
 * Deliberately avoids `parseFloat(...) * 100`: for inputs like "10,005" that hits
 * classic float imprecision (10.005 * 100 === 1000.4999999999999 in JS), which would
 * round down instead of up. Minor units are derived from the decimal digits directly,
 * with no floating-point arithmetic involved.
 */
export function parseAmountInput(input: string, currency: string): Money | null {
	const trimmed = input.trim();
	if (trimmed === "") return null;

	// Strip spaces (incl. non-breaking, used as thousands separators), normalize comma to dot.
	const normalized = trimmed.replace(/[\s ]/g, "").replace(",", ".");
	const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(normalized);
	if (!match) return null;

	const signPart = match[1];
	const intPart = match[2];
	const fracPart = match[3] ?? "";

	// First 2 fractional digits become minor units; the 3rd (if present) decides rounding.
	const fracDigits = fracPart.padEnd(3, "0").slice(0, 3);
	let minorUnits = BigInt(intPart) * 100n + BigInt(fracDigits.slice(0, 2));
	if (Number(fracDigits[2]) >= 5) minorUnits += 1n;

	const amountMinor = Number(minorUnits) * (signPart === "-" ? -1 : 1);
	return money(amountMinor, currency);
}

export function formatMoney(m: Money, locale: string): string {
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency: m.currency,
	}).format(m.amountMinor / 100);
}
