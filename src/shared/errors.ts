/**
 * Domain error codes. Handlers and validation never produce user-facing text —
 * they return one of these codes (+ optional params for interpolation), and the
 * webview looks the code up in vue-i18n. Keeps error copy in one place (i18n/pl.ts)
 * instead of scattered across bun-side code.
 */

export type ErrorCode =
	| "plan.invalidRange"
	| "plan.notFound"
	| "plan.nameRequired"
	| "item.notFound"
	| "item.invalidDate"
	| "item.negativeAmount"
	| "item.invalidRange"
	| "investment.targetBelowMinimums"
	| "investment.invalidRange"
	| "money.currencyMismatch"
	| "validation.invalidMonth"
	| "validation.invalidAmount";

export interface DomainErrorParams {
	[key: string]: string | number;
}

export class DomainError extends Error {
	readonly code: ErrorCode;
	readonly params?: DomainErrorParams;

	constructor(code: ErrorCode, params?: DomainErrorParams) {
		super(code);
		this.name = "DomainError";
		this.code = code;
		this.params = params;
	}
}

/** Shape actually sent over RPC (Error instances don't serialize their subclass fields). */
export interface DomainErrorPayload {
	code: ErrorCode;
	params?: DomainErrorParams;
}

export function toDomainErrorPayload(error: DomainError): DomainErrorPayload {
	return { code: error.code, params: error.params };
}
