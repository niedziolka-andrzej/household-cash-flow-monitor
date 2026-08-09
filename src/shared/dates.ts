/**
 * Full calendar dates are always the string 'YYYY-MM-DD' internally (see months.ts for
 * the month-level equivalent). `parseDateInput` is the tolerant edge: it accepts what a
 * user actually types or pastes — including Excel/CSV exports, which in a Polish locale
 * come out as "09.08.2026" and sometimes carry a time component — and normalizes it to ISO.
 */

function isRealCalendarDate(year: number, month: number, day: number): boolean {
	if (month < 1 || month > 12 || day < 1) return false;
	// Day 0 of the *next* month is the last day of this one — handles leap years for free.
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return day <= daysInMonth;
}

export function isValidIsoDate(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	return isRealCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/**
 * Normalizes a typed or pasted date to 'YYYY-MM-DD'. Returns null for blank input (treat
 * as "not set") and for anything unparseable or not a real calendar date.
 *
 * Accepted: 'YYYY-MM-DD', 'YYYY/MM/DD', 'YYYY.MM.DD', 'DD.MM.YYYY', 'DD-MM-YYYY',
 * 'D.M.YYYY', any of the above with a trailing time ('2026-08-09 00:00:00'), and
 * surrounding whitespace or quotes (spreadsheet copy artifacts).
 *
 * Two-digit years are rejected rather than guessed — '01.02.03' has no defensible reading.
 */
export function parseDateInput(input: string): string | null {
	let text = input.trim().replace(/^["']|["']$/g, "").trim();
	if (text === "") return null;

	// Drop a trailing time component (Excel/CSV date-times).
	text = text.replace(/[T\s]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*$/, "").trim();

	const parts = text.split(/[-./\s]+/).filter(Boolean);
	if (parts.length !== 3 || !parts.every((part) => /^\d+$/.test(part))) return null;

	let year: number;
	let month: number;
	let day: number;
	if (parts[0].length === 4) {
		[year, month, day] = parts.map(Number); // YYYY-MM-DD
	} else if (parts[2].length === 4) {
		day = Number(parts[0]); // DD.MM.YYYY (Polish locale default)
		month = Number(parts[1]);
		year = Number(parts[2]);
	} else {
		return null;
	}

	if (!isRealCalendarDate(year, month, day)) return null;
	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
