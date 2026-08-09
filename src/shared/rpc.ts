import type { Money } from "./money";
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
		};
		messages: Record<string, never>;
	};
	webview: {
		requests: Record<string, never>;
		messages: Record<string, never>;
	};
};

export type CashflowRPCRequestName = keyof CashflowRPC["bun"]["requests"];
