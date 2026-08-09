import { reactive } from "vue";
import type { Money } from "../../shared/money";
import type {
	IncomeItemInput,
	InvestmentConfigInput,
	OneTimeExpenseInput,
	PlanCoreInput,
	PlanSnapshot,
	PlanSummary,
	RecurringExpenseInput,
} from "../../shared/types";
import { call, RpcError } from "../rpc/client";

interface PlanStoreState {
	plans: PlanSummary[];
	current: PlanSnapshot | null;
	loading: boolean;
	error: RpcError | null;
	/** Epoch ms of the last successful write, so the UI can show an autosave indicator
	 * instead of leaving the user wondering whether anything was persisted. */
	lastSavedAt: number | null;
}

/**
 * The entire client-side state: a plan list, and — when a plan is open — its full
 * snapshot. Every mutation below calls the corresponding RPC method and replaces
 * `current` wholesale with the response; there is no local recomputation or partial
 * patching, so the cumulative-balance cascade (an edit to month 1 reshapes every
 * later month) is always correct without any cache-invalidation logic.
 */
export const planStore = reactive<PlanStoreState>({
	plans: [],
	current: null,
	loading: false,
	error: null,
	lastSavedAt: null,
});

async function run<T>(fn: () => Promise<T>): Promise<T | null> {
	planStore.loading = true;
	planStore.error = null;
	try {
		return await fn();
	} catch (error) {
		planStore.error = error instanceof RpcError ? error : new RpcError("unknown");
		return null;
	} finally {
		planStore.loading = false;
	}
}

async function applyMutation(action: () => Promise<PlanSnapshot>): Promise<void> {
	const snapshot = await run(action);
	if (snapshot) {
		planStore.current = snapshot;
		planStore.lastSavedAt = Date.now();
	}
}

export function clearError(): void {
	planStore.error = null;
}

// --- plans -------------------------------------------------------------------

export async function loadPlans(): Promise<void> {
	const plans = await run(() => call("listPlans", {}));
	if (plans) planStore.plans = plans;
}

export async function openPlan(planId: number): Promise<void> {
	const snapshot = await run(() => call("getPlanSnapshot", { planId }));
	if (snapshot) planStore.current = snapshot;
}

export function closePlan(): void {
	planStore.current = null;
}

export async function createPlan(input: PlanCoreInput): Promise<PlanSnapshot | null> {
	const snapshot = await run(() => call("createPlan", input));
	if (snapshot) {
		planStore.current = snapshot;
		await loadPlans();
	}
	return snapshot;
}

export async function updatePlanCore(planId: number, patch: Partial<PlanCoreInput>): Promise<void> {
	const snapshot = await run(() => call("updatePlan", { planId, patch }));
	if (snapshot) {
		planStore.current = snapshot;
		await loadPlans();
	}
}

export async function deletePlan(planId: number): Promise<void> {
	await run(() => call("deletePlan", { planId }));
	if (planStore.current?.plan.id === planId) planStore.current = null;
	await loadPlans();
}

export async function duplicatePlan(planId: number, newName: string): Promise<PlanSnapshot | null> {
	const snapshot = await run(() => call("duplicatePlan", { planId, newName }));
	if (snapshot) {
		planStore.current = snapshot;
		await loadPlans();
	}
	return snapshot;
}

// --- assumptions ---------------------------------------------------------------

export function addIncomeItem(planId: number, item: IncomeItemInput): Promise<void> {
	return applyMutation(() => call("createIncomeItem", { planId, item }));
}
export function editIncomeItem(planId: number, itemId: number, patch: Partial<IncomeItemInput>): Promise<void> {
	return applyMutation(() => call("updateIncomeItem", { planId, itemId, patch }));
}
export function removeIncomeItem(planId: number, itemId: number): Promise<void> {
	return applyMutation(() => call("deleteIncomeItem", { planId, itemId }));
}

export function addRecurringExpense(planId: number, item: RecurringExpenseInput): Promise<void> {
	return applyMutation(() => call("createRecurringExpense", { planId, item }));
}
export function editRecurringExpense(
	planId: number,
	itemId: number,
	patch: Partial<RecurringExpenseInput>,
): Promise<void> {
	return applyMutation(() => call("updateRecurringExpense", { planId, itemId, patch }));
}
export function removeRecurringExpense(planId: number, itemId: number): Promise<void> {
	return applyMutation(() => call("deleteRecurringExpense", { planId, itemId }));
}

export function addOneTimeExpense(planId: number, item: OneTimeExpenseInput): Promise<void> {
	return applyMutation(() => call("createOneTimeExpense", { planId, item }));
}
export function editOneTimeExpense(planId: number, itemId: number, patch: Partial<OneTimeExpenseInput>): Promise<void> {
	return applyMutation(() => call("updateOneTimeExpense", { planId, itemId, patch }));
}
export function removeOneTimeExpense(planId: number, itemId: number): Promise<void> {
	return applyMutation(() => call("deleteOneTimeExpense", { planId, itemId }));
}

export function saveInvestmentConfig(planId: number, config: InvestmentConfigInput | null): Promise<void> {
	return applyMutation(() => call("saveInvestmentConfig", { planId, config }));
}

// --- actuals & overrides ---------------------------------------------------------

export function upsertMonthlyActual(
	planId: number,
	month: string,
	field: "income" | "oneTimeExpense" | "investment",
	value: Money | null,
): Promise<void> {
	return applyMutation(() => call("upsertMonthlyActual", { planId, month, field, value }));
}

export function upsertRecurringActual(
	planId: number,
	recurringExpenseId: number,
	month: string,
	value: Money | null,
): Promise<void> {
	return applyMutation(() => call("upsertRecurringActual", { planId, recurringExpenseId, month, value }));
}

/** Correction for one one-time expense — the month follows from the item's date. */
export function upsertOneTimeActual(planId: number, oneTimeExpenseId: number, value: Money | null): Promise<void> {
	return applyMutation(() => call("upsertOneTimeActual", { planId, oneTimeExpenseId, value }));
}

export function upsertOverride(planId: number, month: string, balance: Money | null): Promise<void> {
	return applyMutation(() => call("upsertOverride", { planId, month, balance }));
}
