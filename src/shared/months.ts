/**
 * A "month" is always the string 'YYYY-MM'. Lexicographic string comparison equals
 * chronological order, so plain `<=`/`>=` work in SQL and TS alike — but the explicit
 * helpers below exist so call sites read intent, not string trivia.
 */

export type Month = string;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonth(value: string): value is Month {
	return MONTH_RE.test(value);
}

function assertValidMonth(value: string): void {
	if (!isValidMonth(value)) {
		throw new Error(`Invalid month: "${value}", expected 'YYYY-MM'`);
	}
}

/** Extracts the 'YYYY-MM' month from a full 'YYYY-MM-DD' date string. */
export function monthOfDate(date: string): Month {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		throw new Error(`Invalid date: "${date}", expected 'YYYY-MM-DD'`);
	}
	return date.slice(0, 7);
}

/**
 * Normalizes a typed or pasted month to 'YYYY-MM'. Blank input yields null ("not set").
 *
 * Accepted: 'YYYY-MM', 'YYYY/MM', 'YYYY-M', 'MM.YYYY', and any full date in the formats
 * `parseDateInput` handles ('2026-08-09', '09.08.2026') — pasting a date where a month is
 * expected keeps its month rather than failing, which is what a spreadsheet paste tends to give.
 */
export function parseMonthInput(input: string): Month | null {
	const text = input.trim().replace(/^["']|["']$/g, "").trim();
	if (text === "") return null;

	const parts = text.split(/[-./\s]+/).filter(Boolean);
	if (parts.length < 2 || parts.length > 3 || !parts.every((part) => /^\d+$/.test(part))) return null;

	let year: number;
	let month: number;
	if (parts[0].length === 4) {
		year = Number(parts[0]); // YYYY-MM (optionally YYYY-MM-DD)
		month = Number(parts[1]);
	} else if (parts.length === 2 && parts[1].length === 4) {
		month = Number(parts[0]); // MM.YYYY
		year = Number(parts[1]);
	} else if (parts.length === 3 && parts[2].length === 4) {
		month = Number(parts[1]); // DD.MM.YYYY
		year = Number(parts[2]);
	} else {
		return null;
	}

	if (month < 1 || month > 12) return null;
	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function compareMonths(a: Month, b: Month): -1 | 0 | 1 {
	assertValidMonth(a);
	assertValidMonth(b);
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

export function isMonthBefore(a: Month, b: Month): boolean {
	return compareMonths(a, b) < 0;
}

export function isMonthAfter(a: Month, b: Month): boolean {
	return compareMonths(a, b) > 0;
}

/** Adds `delta` months to `month` (delta may be negative), rolling over the year. */
export function addMonths(month: Month, delta: number): Month {
	assertValidMonth(month);
	const [yearStr, monthStr] = month.split("-");
	const year = Number.parseInt(yearStr, 10);
	const monthIndex = Number.parseInt(monthStr, 10) - 1; // 0-based
	const total = year * 12 + monthIndex + delta;
	const newYear = Math.floor(total / 12);
	const newMonthIndex = ((total % 12) + 12) % 12;
	return `${newYear.toString().padStart(4, "0")}-${(newMonthIndex + 1).toString().padStart(2, "0")}`;
}

/** Inclusive count of months between start and end (>= 1 when end >= start). */
export function monthCount(start: Month, end: Month): number {
	assertValidMonth(start);
	assertValidMonth(end);
	const [sy, sm] = start.split("-").map(Number);
	const [ey, em] = end.split("-").map(Number);
	return (ey - sy) * 12 + (em - sm) + 1;
}

/** Inclusive ascending list of months from start to end. Throws if end < start. */
export function monthRange(start: Month, end: Month): Month[] {
	const count = monthCount(start, end);
	if (count < 1) {
		throw new Error(`monthRange: end "${end}" is before start "${start}"`);
	}
	return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

/** Clamps [rangeStart, rangeEnd] to the intersection with [boundsStart, boundsEnd]. Null if disjoint. */
export function intersectMonthRanges(
	rangeStart: Month,
	rangeEnd: Month,
	boundsStart: Month,
	boundsEnd: Month,
): { start: Month; end: Month } | null {
	const start = isMonthAfter(rangeStart, boundsStart) ? rangeStart : boundsStart;
	const end = isMonthBefore(rangeEnd, boundsEnd) ? rangeEnd : boundsEnd;
	if (isMonthAfter(start, end)) return null;
	return { start, end };
}
