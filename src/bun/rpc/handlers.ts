import { BrowserView, type BrowserWindow } from "electrobun/bun";
import { DomainError, toDomainErrorPayload } from "../../shared/errors";
import type { CashflowRPC } from "../../shared/rpc";
import type { PlanCoreInput } from "../../shared/types";
import {
	assertValid,
	validateDatedItemInput,
	validateInvestmentConfig,
	validateMonthInPlanRange,
	validatePlanCore,
	validateRecurringExpenseInput,
} from "../../shared/validation";
import type { AppDatabase } from "../db/database";
import {
	upsertMonthlyActualField,
	upsertOverride,
	upsertRecurringExpenseActual,
} from "../db/repositories/actualsRepo";
import {
	createIncomeItem,
	createOneTimeExpense,
	createRecurringExpense,
	deleteIncomeItem,
	deleteOneTimeExpense,
	deleteRecurringExpense,
	saveInvestmentConfig,
	updateIncomeItem,
	updateOneTimeExpense,
	updateRecurringExpense,
} from "../db/repositories/itemsRepo";
import { createPlanCore, deletePlanCore, duplicatePlanCore, requirePlanCore, updatePlanCore } from "../db/repositories/planRepo";
import {
	acceptUpdate,
	dismissUpdate,
	getUpdateState,
	initUpdater,
	runUpdateCheck,
} from "../updater";
import { buildSnapshot, listPlanSummaries } from "./snapshot";

/**
 * Runs a handler body, translating a thrown DomainError into a plain Error whose
 * `.message` is `JSON.stringify(DomainErrorPayload)`. The webview's rpc client
 * (mainview/rpc/client.ts) parses that back out to look the code up in vue-i18n.
 * This is deliberately conservative about what crosses the RPC boundary: only
 * `.message` (a string) is guaranteed to survive; custom Error subclass fields
 * are not something we rely on the bridge preserving.
 */
function guard<T>(fn: () => T): T {
	try {
		return fn();
	} catch (error) {
		if (error instanceof DomainError) {
			throw new Error(JSON.stringify(toDomainErrorPayload(error)));
		}
		throw error;
	}
}

function assertMoneyMatchesCurrency(value: { currency: string } | null, currency: string): void {
	if (value !== null && value.currency !== currency) {
		throw new DomainError("money.currencyMismatch", { expected: currency, actual: value.currency });
	}
}

/** Don't shrink below this even on a very small display — past it the table is unusable. */
const MIN_WINDOW_WIDTH = 800;
const MIN_WINDOW_HEIGHT = 600;
/** Room left for window chrome and the taskbar so the window stays fully reachable. */
const SCREEN_MARGIN_X = 40;
const SCREEN_MARGIN_Y = 60;

export function createCashflowRpc(db: AppDatabase, getWindow: () => BrowserWindow | null) {
	const rpc = BrowserView.defineRPC<CashflowRPC>({
		maxRequestTime: 5000,
		handlers: {
			requests: {
				listPlans: () => guard(() => listPlanSummaries(db)),
				getPlanSnapshot: ({ planId }) => guard(() => buildSnapshot(db, planId)),

				createPlan: (input) =>
					guard(() => {
						assertValid(validatePlanCore(input));
						const plan = createPlanCore(db, input);
						return buildSnapshot(db, plan.id);
					}),

				updatePlan: ({ planId, patch }) =>
					guard(() => {
						const existing = requirePlanCore(db, planId);
						const merged: PlanCoreInput = {
							name: patch.name ?? existing.name,
							startMonth: patch.startMonth ?? existing.startMonth,
							endMonth: patch.endMonth ?? existing.endMonth,
							currency: patch.currency ?? existing.currency,
							openingBalance: patch.openingBalance ?? existing.openingBalance,
						};
						assertValid(validatePlanCore(merged));
						updatePlanCore(db, planId, patch);
						return buildSnapshot(db, planId);
					}),

				deletePlan: ({ planId }) =>
					guard(() => {
						deletePlanCore(db, planId);
						return { ok: true as const };
					}),

				duplicatePlan: ({ planId, newName }) =>
					guard(() => {
						const copy = duplicatePlanCore(db, planId, newName);
						return buildSnapshot(db, copy.id);
					}),

				createIncomeItem: ({ planId, item }) =>
					guard(() => {
						const plan = requirePlanCore(db, planId);
						assertValid(validateDatedItemInput(item, plan.currency));
						createIncomeItem(db, planId, item);
						return buildSnapshot(db, planId);
					}),
				updateIncomeItem: ({ planId, itemId, patch }) =>
					guard(() => {
						const plan = requirePlanCore(db, planId);
						if (patch.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) {
							throw new DomainError("item.invalidDate");
						}
						if (patch.forecast !== undefined) {
							if (patch.forecast.amountMinor < 0) throw new DomainError("item.negativeAmount");
							assertMoneyMatchesCurrency(patch.forecast, plan.currency);
						}
						updateIncomeItem(db, planId, itemId, patch);
						return buildSnapshot(db, planId);
					}),
				deleteIncomeItem: ({ planId, itemId }) =>
					guard(() => {
						deleteIncomeItem(db, planId, itemId);
						return buildSnapshot(db, planId);
					}),

				createRecurringExpense: ({ planId, item }) =>
					guard(() => {
						const plan = requirePlanCore(db, planId);
						assertValid(validateRecurringExpenseInput(item, plan.currency));
						createRecurringExpense(db, planId, item);
						return buildSnapshot(db, planId);
					}),
				updateRecurringExpense: ({ planId, itemId, patch }) =>
					guard(() => {
						const plan = requirePlanCore(db, planId);
						if (patch.monthly !== undefined) {
							if (patch.monthly.amountMinor < 0) throw new DomainError("item.negativeAmount");
							assertMoneyMatchesCurrency(patch.monthly, plan.currency);
						}
						updateRecurringExpense(db, planId, itemId, patch);
						return buildSnapshot(db, planId);
					}),
				deleteRecurringExpense: ({ planId, itemId }) =>
					guard(() => {
						deleteRecurringExpense(db, planId, itemId);
						return buildSnapshot(db, planId);
					}),

				createOneTimeExpense: ({ planId, item }) =>
					guard(() => {
						const plan = requirePlanCore(db, planId);
						assertValid(validateDatedItemInput(item, plan.currency));
						createOneTimeExpense(db, planId, item);
						return buildSnapshot(db, planId);
					}),
				updateOneTimeExpense: ({ planId, itemId, patch }) =>
					guard(() => {
						const plan = requirePlanCore(db, planId);
						if (patch.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) {
							throw new DomainError("item.invalidDate");
						}
						if (patch.forecast !== undefined) {
							if (patch.forecast.amountMinor < 0) throw new DomainError("item.negativeAmount");
							assertMoneyMatchesCurrency(patch.forecast, plan.currency);
						}
						updateOneTimeExpense(db, planId, itemId, patch);
						return buildSnapshot(db, planId);
					}),
				deleteOneTimeExpense: ({ planId, itemId }) =>
					guard(() => {
						deleteOneTimeExpense(db, planId, itemId);
						return buildSnapshot(db, planId);
					}),

				saveInvestmentConfig: ({ planId, config }) =>
					guard(() => {
						const plan = requirePlanCore(db, planId);
						if (config !== null) {
							assertValid(validateInvestmentConfig(config, plan.startMonth, plan.endMonth, plan.currency));
						}
						saveInvestmentConfig(db, planId, config);
						return buildSnapshot(db, planId);
					}),

				upsertMonthlyActual: ({ planId, month, field, value }) =>
					guard(() => {
						const plan = requirePlanCore(db, planId);
						assertValid(validateMonthInPlanRange(month, plan.startMonth, plan.endMonth));
						assertMoneyMatchesCurrency(value, plan.currency);
						upsertMonthlyActualField(db, planId, month, field, value);
						return buildSnapshot(db, planId);
					}),
				upsertRecurringActual: ({ planId, recurringExpenseId, month, value }) =>
					guard(() => {
						const plan = requirePlanCore(db, planId);
						assertValid(validateMonthInPlanRange(month, plan.startMonth, plan.endMonth));
						assertMoneyMatchesCurrency(value, plan.currency);
						upsertRecurringExpenseActual(db, planId, recurringExpenseId, month, value);
						return buildSnapshot(db, planId);
					}),
				upsertOverride: ({ planId, month, balance }) =>
					guard(() => {
						const plan = requirePlanCore(db, planId);
						assertValid(validateMonthInPlanRange(month, plan.startMonth, plan.endMonth));
						assertMoneyMatchesCurrency(balance, plan.currency);
						upsertOverride(db, planId, month, balance);
						return buildSnapshot(db, planId);
					}),

				fitWindowToScreen: ({ availWidth, availHeight }) => {
					const window = getWindow();
					if (!window) return { width: 0, height: 0 };
					const frame = window.getFrame();
					const width = Math.max(MIN_WINDOW_WIDTH, availWidth - SCREEN_MARGIN_X);
					const height = Math.max(MIN_WINDOW_HEIGHT, availHeight - SCREEN_MARGIN_Y);
					// The startup frame is positioned at an offset, so growing to the full available
					// width from there would push the right edge off-screen — center the window on
					// whatever size we land on instead. Clamped at 0 for the case where the minimum
					// size exceeds the display and the window is wider than the screen.
					const x = Math.max(0, Math.round((availWidth - width) / 2));
					const y = Math.max(0, Math.round((availHeight - height) / 2));
					// Resizing through Electrobun also re-lays-out the webview, which is what
					// re-syncs the viewport with the visible client area.
					if (width !== frame.width || height !== frame.height || x !== frame.x || y !== frame.y) {
						window.setFrame(x, y, width, height);
					}
					return { width, height };
				},

				getUpdateState: () => getUpdateState(),
			},
			messages: {
				// All three are fire-and-forget; failures surface as an "error" phase pushed
				// back through updateStateChanged, not as a rejected request.
				requestUpdateCheck: () => {
					runUpdateCheck({ userInitiated: true }).catch((error) =>
						console.error("Sprawdzanie aktualizacji nie powiodło się:", error),
					);
				},
				acceptUpdate: () => {
					acceptUpdate().catch((error) =>
						console.error("Instalacja aktualizacji nie powiodła się:", error),
					);
				},
				dismissUpdate: () => dismissUpdate(),
			},
		},
	});

	initUpdater((next) => rpc.send.updateStateChanged(next));

	return rpc;
}
