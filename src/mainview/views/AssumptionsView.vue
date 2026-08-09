<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { ErrorCode } from "../../shared/errors";
import { currencySymbol, formatMoney, money, type Money } from "../../shared/money";
import { monthOfDate } from "../../shared/months";
import type { IncomeItem, InvestmentConfigInput, OneTimeExpense, RecurringExpense } from "../../shared/types";
import { validateInvestmentConfig } from "../../shared/validation";
import Card from "../components/Card.vue";
import DateInput from "../components/DateInput.vue";
import MoneyInput from "../components/MoneyInput.vue";
import MonthInput from "../components/MonthInput.vue";
import {
	addIncomeItem,
	addOneTimeExpense,
	addRecurringExpense,
	editIncomeItem,
	editOneTimeExpense,
	editRecurringExpense,
	planStore,
	removeIncomeItem,
	removeOneTimeExpense,
	removeRecurringExpense,
	saveInvestmentConfig,
} from "../store/planStore";

const { t } = useI18n();

const plan = computed(() => planStore.current!.plan);
const currency = computed(() => plan.value.currency);
const snapshot = computed(() => planStore.current!);

function isOutsideRange(date: string): boolean {
	const m = monthOfDate(date);
	return m < plan.value.startMonth || m > plan.value.endMonth;
}

/** Enter (from any field) or Tab out of the last field both commit the "new item" row
 * and refocus its name field — the keyboard-only flow a spreadsheet gives you for adding
 * many rows in a row. Tab needs `preventDefault` + a manual `blur()` first so the field's
 * own blur-triggered parsing runs before we read its committed value. */
function onLastFieldTab(event: KeyboardEvent, commit: () => void): void {
	if (event.key === "Tab" && !event.shiftKey) {
		event.preventDefault();
		(document.activeElement as HTMLElement | null)?.blur();
		commit();
	}
}

// --- income --------------------------------------------------------------

// Date is deliberately NOT reset after adding — most of the time the next income/expense
// shares the same date, so keeping it lets the user just Tab/Enter through the next row.
const newIncome = reactive({ name: "", date: "", forecast: null as Money | null });
const newIncomeNameInput = ref<HTMLInputElement | null>(null);
function submitNewIncome(): void {
	if (!newIncome.name.trim() || !newIncome.date) return;
	addIncomeItem(plan.value.id, {
		name: newIncome.name.trim(),
		date: newIncome.date,
		forecast: newIncome.forecast ?? money(0, currency.value),
	});
	newIncome.name = "";
	newIncome.forecast = null;
}
async function commitNewIncomeRow(): Promise<void> {
	submitNewIncome();
	await nextTick();
	newIncomeNameInput.value?.focus();
}
function onIncomeName(item: IncomeItem, value: string): void {
	editIncomeItem(plan.value.id, item.id, { name: value });
}
function onIncomeDate(item: IncomeItem, value: string): void {
	if (value && value !== item.date) editIncomeItem(plan.value.id, item.id, { date: value });
}
function onIncomeForecast(item: IncomeItem, value: Money | null): void {
	editIncomeItem(plan.value.id, item.id, { forecast: value ?? money(0, currency.value) });
}

// --- one-time expenses (mirrors income) -----------------------------------

const newOneTime = reactive({ name: "", date: "", forecast: null as Money | null });
const newOneTimeNameInput = ref<HTMLInputElement | null>(null);
function submitNewOneTime(): void {
	if (!newOneTime.name.trim() || !newOneTime.date) return;
	addOneTimeExpense(plan.value.id, {
		name: newOneTime.name.trim(),
		date: newOneTime.date,
		forecast: newOneTime.forecast ?? money(0, currency.value),
	});
	newOneTime.name = "";
	newOneTime.forecast = null;
}
async function commitNewOneTimeRow(): Promise<void> {
	submitNewOneTime();
	await nextTick();
	newOneTimeNameInput.value?.focus();
}
function onOneTimeName(item: OneTimeExpense, value: string): void {
	editOneTimeExpense(plan.value.id, item.id, { name: value });
}
function onOneTimeDate(item: OneTimeExpense, value: string): void {
	if (value && value !== item.date) editOneTimeExpense(plan.value.id, item.id, { date: value });
}
function onOneTimeForecast(item: OneTimeExpense, value: Money | null): void {
	editOneTimeExpense(plan.value.id, item.id, { forecast: value ?? money(0, currency.value) });
}

// --- recurring expenses ------------------------------------------------------

/**
 * A recurring expense stores null for "no narrower range than the plan". The UI never shows
 * that as an empty field though — it shows the plan's own boundary months, because that is
 * what the item effectively spans, and blank fields read as missing data.
 *
 * `rangeToStore` is the inverse: a value left at (or set back to) the plan boundary is stored
 * as null, so the item keeps following the plan if its range is widened later, which is what
 * you want for a rent-type expense.
 */
function rangeToStore(month: string, planBoundary: string): string | null {
	if (!month || month === planBoundary) return null;
	return month;
}

const newRecurring = reactive({
	name: "",
	monthly: null as Money | null,
	startMonth: plan.value.startMonth,
	endMonth: plan.value.endMonth,
});
const newRecurringNameInput = ref<HTMLInputElement | null>(null);
function submitNewRecurring(): void {
	if (!newRecurring.name.trim()) return;
	addRecurringExpense(plan.value.id, {
		name: newRecurring.name.trim(),
		monthly: newRecurring.monthly ?? money(0, currency.value),
		startMonth: rangeToStore(newRecurring.startMonth, plan.value.startMonth),
		endMonth: rangeToStore(newRecurring.endMonth, plan.value.endMonth),
		sortOrder: snapshot.value.recurringExpenses.length,
	});
	newRecurring.name = "";
	newRecurring.monthly = null;
}
async function commitNewRecurringRow(): Promise<void> {
	submitNewRecurring();
	await nextTick();
	newRecurringNameInput.value?.focus();
}
function onRecurringName(item: RecurringExpense, value: string): void {
	editRecurringExpense(plan.value.id, item.id, { name: value });
}
function onRecurringMonthly(item: RecurringExpense, value: Money | null): void {
	editRecurringExpense(plan.value.id, item.id, { monthly: value ?? money(0, currency.value) });
}
function onRecurringStart(item: RecurringExpense, value: string): void {
	const next = rangeToStore(value, plan.value.startMonth);
	if (next !== item.startMonth) editRecurringExpense(plan.value.id, item.id, { startMonth: next });
}
function onRecurringEnd(item: RecurringExpense, value: string): void {
	const next = rangeToStore(value, plan.value.endMonth);
	if (next !== item.endMonth) editRecurringExpense(plan.value.id, item.id, { endMonth: next });
}

// --- investment configuration -------------------------------------------------

const investmentDraft = reactive({
	totalTarget: null as Money | null,
	monthlyMinimum: null as Money | null,
	startMonth: "",
	endMonth: "",
});
/** Local (pre-flight) validation message, so a half-filled form never fires a doomed RPC. */
const investmentError = ref<ErrorCode | null>(null);
const investmentIncomplete = ref(false);

function syncInvestmentDraft(): void {
	const config = snapshot.value.investmentConfig;
	investmentDraft.totalTarget = config?.totalTarget ?? null;
	investmentDraft.monthlyMinimum = config?.monthlyMinimum ?? null;
	investmentDraft.startMonth = config?.startMonth ?? plan.value.startMonth;
	investmentDraft.endMonth = config?.endMonth ?? plan.value.endMonth;
	investmentError.value = null;
	investmentIncomplete.value = false;
}
syncInvestmentDraft();
// Re-seed drafts when the user switches to another plan while this view stays mounted.
watch(
	() => planStore.current?.plan.id,
	() => {
		syncInvestmentDraft();
		newRecurring.startMonth = plan.value.startMonth;
		newRecurring.endMonth = plan.value.endMonth;
	},
);

function buildInvestmentPayload(): InvestmentConfigInput | null {
	if (!investmentDraft.totalTarget || !investmentDraft.monthlyMinimum) return null;
	if (!investmentDraft.startMonth || !investmentDraft.endMonth) return null;
	return {
		totalTarget: investmentDraft.totalTarget,
		monthlyMinimum: investmentDraft.monthlyMinimum,
		startMonth: investmentDraft.startMonth,
		endMonth: investmentDraft.endMonth,
	};
}

function isUnchanged(payload: InvestmentConfigInput): boolean {
	const stored = snapshot.value.investmentConfig;
	if (!stored) return false;
	return (
		stored.totalTarget.amountMinor === payload.totalTarget.amountMinor &&
		stored.monthlyMinimum.amountMinor === payload.monthlyMinimum.amountMinor &&
		stored.startMonth === payload.startMonth &&
		stored.endMonth === payload.endMonth
	);
}

/**
 * Investment config saves like everything else on this screen: on field blur, no button
 * hunting. The difference is that it can be *invalid* mid-entry (e.g. target below the sum
 * of minimums), so it's validated locally first and only sent when it would be accepted —
 * `reportIncomplete` distinguishes passive autosave from an explicit save click.
 */
function attemptInvestmentSave(reportIncomplete: boolean): void {
	const payload = buildInvestmentPayload();
	if (!payload) {
		investmentError.value = null;
		investmentIncomplete.value = reportIncomplete;
		return;
	}
	investmentIncomplete.value = false;
	const error = validateInvestmentConfig(payload, plan.value.startMonth, plan.value.endMonth, currency.value);
	if (error) {
		investmentError.value = error.code;
		return;
	}
	investmentError.value = null;
	if (isUnchanged(payload)) return;
	saveInvestmentConfig(plan.value.id, payload);
}

function removeInvestment(): void {
	saveInvestmentConfig(plan.value.id, null);
	investmentError.value = null;
	investmentIncomplete.value = false;
}

/**
 * How much of the target the allocated monthly contributions actually cover. The engine
 * guarantees these sum to exactly the target within the covered range, so anything short of
 * 100% is a signal that the range doesn't line up with the plan — worth seeing at a glance.
 */
const investmentCoverage = computed(() => {
	const config = snapshot.value.investmentConfig;
	if (!config || config.totalTarget.amountMinor <= 0) return null;
	const allocatedMinor = snapshot.value.results.months.reduce((sum, m) => sum + m.investment.forecast.amountMinor, 0);
	return {
		percent: Math.min(100, (allocatedMinor / config.totalTarget.amountMinor) * 100),
		label: `${formatMoney(money(allocatedMinor, currency.value), "pl-PL")} / ${formatMoney(config.totalTarget, "pl-PL")}`,
	};
});

const COLUMN_HEAD = "px-1.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle";
const CELL = "px-1.5 py-2";
const NAME_INPUT =
	"w-full rounded-lg border border-transparent px-2 py-1.5 hover:border-edgeStrong focus:border-accent focus:outline-none";
const NEW_INPUT = "w-full rounded-lg border border-edgeStrong px-2 py-1.5 focus:border-accent focus:outline-none";
</script>

<template>
	<div class="grid gap-6 pt-2">
		<p class="text-xs text-ink-subtle">
			{{ t("assumptions.amountsInCurrency", { currency, symbol: currencySymbol(currency, "pl-PL") }) }}
		</p>

		<Card
			:title="t('assumptions.incomeSection')"
			:badge="t('assumptions.itemsCount', { count: snapshot.incomeItems.length })"
		>
			<table class="w-full border-collapse text-sm">
				<thead>
					<tr class="text-left">
						<th :class="COLUMN_HEAD">{{ t("assumptions.itemName") }}</th>
						<th :class="COLUMN_HEAD">{{ t("assumptions.itemDate") }}</th>
						<th :class="[COLUMN_HEAD, 'text-right']">{{ t("assumptions.itemAmount") }}</th>
						<th class="w-10"></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="item in snapshot.incomeItems" :key="item.id" class="border-t border-hairline">
						<td :class="CELL">
							<input
								:class="NAME_INPUT"
								:value="item.name"
								@change="onIncomeName(item, ($event.target as HTMLInputElement).value)"
							/>
						</td>
						<td :class="CELL">
							<DateInput :model-value="item.date" @commit="onIncomeDate(item, $event)" />
							<span
								v-if="isOutsideRange(item.date)"
								class="ml-1 text-xs text-danger"
								:title="t('assumptions.itemOutsidePlanRangeWarning')"
								>⚠</span
							>
						</td>
						<td :class="CELL">
							<MoneyInput
								:model-value="item.forecast"
								:currency="currency"
								@update:model-value="onIncomeForecast(item, $event)"
							/>
						</td>
						<td :class="[CELL, 'text-right']">
							<button
								class="rounded-lg p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"
								:aria-label="t('common.delete')"
								@click="removeIncomeItem(plan.id, item.id)"
							>
								<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
									<path
										d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"
									/>
								</svg>
							</button>
						</td>
					</tr>
					<tr v-if="snapshot.incomeItems.length === 0">
						<td colspan="4" class="px-1.5 py-3 text-ink-faint">{{ t("assumptions.emptyIncome") }}</td>
					</tr>
					<tr class="border-t border-edge" @keydown.enter="commitNewIncomeRow">
						<td :class="CELL">
							<input
								ref="newIncomeNameInput"
								v-model="newIncome.name"
								:class="NEW_INPUT"
								:placeholder="t('assumptions.itemName')"
							/>
						</td>
						<td :class="CELL"><DateInput v-model="newIncome.date" /></td>
						<td :class="CELL">
							<MoneyInput
								v-model="newIncome.forecast"
								:currency="currency"
								@keydown="(e: KeyboardEvent) => onLastFieldTab(e, commitNewIncomeRow)"
							/>
						</td>
						<td :class="[CELL, 'text-right']">
							<button
								class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white hover:bg-accent-hover"
								:aria-label="t('assumptions.addIncome')"
								:title="t('assumptions.addIncome')"
								@click="commitNewIncomeRow"
							>
								<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
									<path
										d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"
									/>
								</svg>
							</button>
						</td>
					</tr>
				</tbody>
			</table>
		</Card>

		<Card
			:title="t('assumptions.recurringSection')"
			:badge="t('assumptions.itemsCount', { count: snapshot.recurringExpenses.length })"
		>
			<table class="w-full border-collapse text-sm">
				<thead>
					<tr class="text-left">
						<th :class="COLUMN_HEAD">{{ t("assumptions.itemName") }}</th>
						<th :class="[COLUMN_HEAD, 'text-right']">{{ t("assumptions.monthlyAmount") }}</th>
						<th :class="COLUMN_HEAD">{{ t("assumptions.rangeStart") }}</th>
						<th :class="COLUMN_HEAD">{{ t("assumptions.rangeEnd") }}</th>
						<th class="w-10"></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="item in snapshot.recurringExpenses" :key="item.id" class="border-t border-hairline">
						<td :class="CELL">
							<input
								:class="NAME_INPUT"
								:value="item.name"
								@change="onRecurringName(item, ($event.target as HTMLInputElement).value)"
							/>
						</td>
						<td :class="CELL">
							<MoneyInput
								:model-value="item.monthly"
								:currency="currency"
								@update:model-value="onRecurringMonthly(item, $event)"
							/>
						</td>
						<td :class="CELL">
							<MonthInput :model-value="item.startMonth ?? plan.startMonth" @commit="onRecurringStart(item, $event)" />
						</td>
						<td :class="CELL">
							<MonthInput :model-value="item.endMonth ?? plan.endMonth" @commit="onRecurringEnd(item, $event)" />
						</td>
						<td :class="[CELL, 'text-right']">
							<button
								class="rounded-lg p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"
								:aria-label="t('common.delete')"
								@click="removeRecurringExpense(plan.id, item.id)"
							>
								<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
									<path
										d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"
									/>
								</svg>
							</button>
						</td>
					</tr>
					<tr v-if="snapshot.recurringExpenses.length === 0">
						<td colspan="5" class="px-1.5 py-3 text-ink-faint">{{ t("assumptions.emptyRecurring") }}</td>
					</tr>
					<tr class="border-t border-edge" @keydown.enter="commitNewRecurringRow">
						<td :class="CELL">
							<input
								ref="newRecurringNameInput"
								v-model="newRecurring.name"
								:class="NEW_INPUT"
								:placeholder="t('assumptions.itemName')"
							/>
						</td>
						<td :class="CELL"><MoneyInput v-model="newRecurring.monthly" :currency="currency" /></td>
						<td :class="CELL"><MonthInput v-model="newRecurring.startMonth" /></td>
						<td :class="CELL">
							<MonthInput
								v-model="newRecurring.endMonth"
								@keydown="(e: KeyboardEvent) => onLastFieldTab(e, commitNewRecurringRow)"
							/>
						</td>
						<td :class="[CELL, 'text-right']">
							<button
								class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white hover:bg-accent-hover"
								:aria-label="t('assumptions.addRecurring')"
								:title="t('assumptions.addRecurring')"
								@click="commitNewRecurringRow"
							>
								<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
									<path
										d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"
									/>
								</svg>
							</button>
						</td>
					</tr>
				</tbody>
			</table>
			<p class="mt-2.5 text-xs text-ink-subtle">{{ t("assumptions.rangeHint") }}</p>
		</Card>

		<Card
			:title="t('assumptions.oneTimeSection')"
			:badge="t('assumptions.itemsCount', { count: snapshot.oneTimeExpenses.length })"
		>
			<table class="w-full border-collapse text-sm">
				<thead>
					<tr class="text-left">
						<th :class="COLUMN_HEAD">{{ t("assumptions.itemName") }}</th>
						<th :class="COLUMN_HEAD">{{ t("assumptions.itemDate") }}</th>
						<th :class="[COLUMN_HEAD, 'text-right']">{{ t("assumptions.itemAmount") }}</th>
						<th class="w-10"></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="item in snapshot.oneTimeExpenses" :key="item.id" class="border-t border-hairline">
						<td :class="CELL">
							<input
								:class="NAME_INPUT"
								:value="item.name"
								@change="onOneTimeName(item, ($event.target as HTMLInputElement).value)"
							/>
						</td>
						<td :class="CELL">
							<DateInput :model-value="item.date" @commit="onOneTimeDate(item, $event)" />
							<span
								v-if="isOutsideRange(item.date)"
								class="ml-1 text-xs text-danger"
								:title="t('assumptions.itemOutsidePlanRangeWarning')"
								>⚠</span
							>
						</td>
						<td :class="CELL">
							<MoneyInput
								:model-value="item.forecast"
								:currency="currency"
								@update:model-value="onOneTimeForecast(item, $event)"
							/>
						</td>
						<td :class="[CELL, 'text-right']">
							<button
								class="rounded-lg p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"
								:aria-label="t('common.delete')"
								@click="removeOneTimeExpense(plan.id, item.id)"
							>
								<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
									<path
										d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"
									/>
								</svg>
							</button>
						</td>
					</tr>
					<tr v-if="snapshot.oneTimeExpenses.length === 0">
						<td colspan="4" class="px-1.5 py-3 text-ink-faint">{{ t("assumptions.emptyOneTime") }}</td>
					</tr>
					<tr class="border-t border-edge" @keydown.enter="commitNewOneTimeRow">
						<td :class="CELL">
							<input
								ref="newOneTimeNameInput"
								v-model="newOneTime.name"
								:class="NEW_INPUT"
								:placeholder="t('assumptions.itemName')"
							/>
						</td>
						<td :class="CELL"><DateInput v-model="newOneTime.date" /></td>
						<td :class="CELL">
							<MoneyInput
								v-model="newOneTime.forecast"
								:currency="currency"
								@keydown="(e: KeyboardEvent) => onLastFieldTab(e, commitNewOneTimeRow)"
							/>
						</td>
						<td :class="[CELL, 'text-right']">
							<button
								class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white hover:bg-accent-hover"
								:aria-label="t('assumptions.addOneTime')"
								:title="t('assumptions.addOneTime')"
								@click="commitNewOneTimeRow"
							>
								<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
									<path
										d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"
									/>
								</svg>
							</button>
						</td>
					</tr>
				</tbody>
			</table>
		</Card>

		<Card :title="t('assumptions.investmentSection')" class="max-w-[560px]">
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label class="mb-1.5 block text-xs text-ink-subtle">{{ t("assumptions.totalTarget") }}</label>
					<MoneyInput v-model="investmentDraft.totalTarget" :currency="currency" @commit="attemptInvestmentSave(false)" />
				</div>
				<div>
					<label class="mb-1.5 block text-xs text-ink-subtle">{{ t("assumptions.monthlyMinimum") }}</label>
					<MoneyInput
						v-model="investmentDraft.monthlyMinimum"
						:currency="currency"
						@commit="attemptInvestmentSave(false)"
					/>
				</div>
				<div>
					<label class="mb-1.5 block text-xs text-ink-subtle">{{ t("assumptions.investmentRangeStart") }}</label>
					<MonthInput v-model="investmentDraft.startMonth" @commit="attemptInvestmentSave(false)" />
				</div>
				<div>
					<label class="mb-1.5 block text-xs text-ink-subtle">{{ t("assumptions.investmentRangeEnd") }}</label>
					<MonthInput v-model="investmentDraft.endMonth" @commit="attemptInvestmentSave(false)" />
				</div>
			</div>

			<div v-if="investmentCoverage" class="mt-5">
				<div class="mb-1.5 flex justify-between text-xs text-ink-subtle">
					<span>{{ t("assumptions.investmentCoverage") }}</span>
					<span class="tabular-nums">{{ investmentCoverage.label }}</span>
				</div>
				<div class="h-2 overflow-hidden rounded-full bg-neutralSoft">
					<div class="h-full rounded-full bg-accent" :style="{ width: `${investmentCoverage.percent}%` }"></div>
				</div>
			</div>

			<p v-if="investmentError" class="mt-4 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
				{{ t(`errors.${investmentError}`) }}
			</p>
			<p v-else-if="investmentIncomplete" class="mt-4 text-xs text-danger">
				{{ t("assumptions.investmentIncomplete") }}
			</p>

			<div class="mt-5 flex flex-wrap gap-3">
				<button
					type="button"
					class="rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
					@click="attemptInvestmentSave(true)"
				>
					{{ t("assumptions.saveInvestment") }}
				</button>
				<button
					v-if="snapshot.investmentConfig"
					type="button"
					class="rounded-control border border-danger/30 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger-soft"
					@click="removeInvestment"
				>
					{{ t("assumptions.removeInvestment") }}
				</button>
			</div>
		</Card>
	</div>
</template>
