import type { Money } from "./money";
import type { UpdateState } from "./update";
import type {
	IncomeItemInput,
	InvestmentConfigInput,
	OneTimeExpenseInput,
	PlanCoreInput,
	PlanSnapshot,
	PlanSummary,
	RecurringExpenseInput,
} from "./types";

/**
 * Single source of truth for the bun <-> webview contract, consumed by
 * `BrowserView.defineRPC<CashflowRPC>()` (src/bun/rpc/handlers.ts) and
 * `Electroview.defineRPC<CashflowRPC>()` (src/mainview/index.ts).
 *
 * Every mutation returns the full, freshly recomputed `PlanSnapshot` for the affected
 * plan — the webview never runs the engine itself, it just swaps its state wholesale.
 * That keeps the cumulative-balance cascade (an edit to month 1 reshapes every later
 * month) trivially correct: there is nothing to invalidate, only a fresh recompute.
 *
 * Handlers never throw plain domain text — on a validation failure they throw an
 * Error whose `.message` is `JSON.stringify(DomainErrorPayload)` (see shared/errors.ts
 * and mainview/rpc/client.ts), so the UI can look the code up in vue-i18n.
 */
export type CashflowRPC = {
	bun: {
		requests: {
			listPlans: { params: Record<string, never>; response: PlanSummary[] };
			getPlanSnapshot: { params: { planId: number }; response: PlanSnapshot };
			createPlan: { params: PlanCoreInput; response: PlanSnapshot };
			updatePlan: { params: { planId: number; patch: Partial<PlanCoreInput> }; response: PlanSnapshot };
			deletePlan: { params: { planId: number }; response: { ok: true } };
			duplicatePlan: { params: { planId: number; newName: string }; response: PlanSnapshot };

			createIncomeItem: { params: { planId: number; item: IncomeItemInput }; response: PlanSnapshot };
			updateIncomeItem: {
				params: { planId: number; itemId: number; patch: Partial<IncomeItemInput> };
				response: PlanSnapshot;
			};
			deleteIncomeItem: { params: { planId: number; itemId: number }; response: PlanSnapshot };

			createRecurringExpense: { params: { planId: number; item: RecurringExpenseInput }; response: PlanSnapshot };
			updateRecurringExpense: {
				params: { planId: number; itemId: number; patch: Partial<RecurringExpenseInput> };
				response: PlanSnapshot;
			};
			deleteRecurringExpense: { params: { planId: number; itemId: number }; response: PlanSnapshot };

			createOneTimeExpense: { params: { planId: number; item: OneTimeExpenseInput }; response: PlanSnapshot };
			updateOneTimeExpense: {
				params: { planId: number; itemId: number; patch: Partial<OneTimeExpenseInput> };
				response: PlanSnapshot;
			};
			deleteOneTimeExpense: { params: { planId: number; itemId: number }; response: PlanSnapshot };

			/** `config: null` removes the investment configuration for the plan. */
			saveInvestmentConfig: {
				params: { planId: number; config: InvestmentConfigInput | null };
				response: PlanSnapshot;
			};

			/** `value: null` clears that field back to "use the forecast". */
			upsertMonthlyActual: {
				params: {
					planId: number;
					month: string;
					field: "income" | "oneTimeExpense" | "investment";
					value: Money | null;
				};
				response: PlanSnapshot;
			};
			upsertRecurringActual: {
				params: { planId: number; recurringExpenseId: number; month: string; value: Money | null };
				response: PlanSnapshot;
			};
			/** `balance: null` clears the manual override for that month. */
			upsertOverride: {
				params: { planId: number; month: string; balance: Money | null };
				response: PlanSnapshot;
			};

			/**
			 * The webview reports the metrics of the display it actually landed on so the main
			 * process can size the window to fill it, and re-center it at that size. Only the
			 * webview knows this: the OS silently clamps a too-large window without telling the
			 * webview, which then keeps laying out against a viewport wider than the visible
			 * client area — content ends up centered off-screen and clipped on the right.
			 */
			fitWindowToScreen: {
				params: { availWidth: number; availHeight: number };
				response: { width: number; height: number };
			};

			/**
			 * Read the updater's current state. The webview asks on mount because the startup
			 * check can finish before the view is listening, and a pushed message would then
			 * be dropped — leaving a found update silently unannounced.
			 */
			getUpdateState: { params: Record<string, never>; response: UpdateState };
		};
		/**
		 * Messages, not requests, on purpose: a check-download-install cycle runs for far
		 * longer than `maxRequestTime` (5s), so it cannot be awaited across the bridge.
		 * Progress comes back via the `updateStateChanged` message instead.
		 */
		messages: {
			requestUpdateCheck: Record<string, never>;
			acceptUpdate: Record<string, never>;
			/** Closes the current notice; on an offer it also remembers the declined build. */
			dismissUpdate: Record<string, never>;
		};
	};
	webview: {
		requests: Record<string, never>;
		messages: {
			updateStateChanged: UpdateState;
		};
	};
};

export type CashflowRPCRequestName = keyof CashflowRPC["bun"]["requests"];
