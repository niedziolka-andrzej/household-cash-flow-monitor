<script setup lang="ts">
import { computed, nextTick, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { money, type Money } from "../../shared/money";
import { monthOfDate } from "../../shared/months";
import type { IncomeItem, InvestmentConfigInput, OneTimeExpense, RecurringExpense } from "../../shared/types";
import MoneyInput from "../components/MoneyInput.vue";
import MonthPicker from "../components/MonthPicker.vue";
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

function isOutsideRange(date: string): boolean {
	const m = monthOfDate(date);
	return m < plan.value.startMonth || m > plan.value.endMonth;
}

/** Enter (from any field) or Tab out of the last field both commit the "new item" row
 * and refocus its name field — the same fast, keyboard-only flow a spreadsheet gives you
 * for adding many rows in a row. Tab needs `preventDefault` + a manual `blur()` first so
 * a MoneyInput's own blur-triggered parsing runs before we read its committed value. */
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
	editIncomeItem(plan.value.id, item.id, { date: value });
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
	editOneTimeExpense(plan.value.id, item.id, { date: value });
}
function onOneTimeForecast(item: OneTimeExpense, value: Money | null): void {
	editOneTimeExpense(plan.value.id, item.id, { forecast: value ?? money(0, currency.value) });
}

// --- recurring expenses ------------------------------------------------------

const newRecurring = reactive({ name: "", monthly: null as Money | null, startMonth: "", endMonth: "" });
const newRecurringNameInput = ref<HTMLInputElement | null>(null);
function submitNewRecurring(): void {
	if (!newRecurring.name.trim()) return;
	addRecurringExpense(plan.value.id, {
		name: newRecurring.name.trim(),
		monthly: newRecurring.monthly ?? money(0, currency.value),
		startMonth: newRecurring.startMonth || null,
		endMonth: newRecurring.endMonth || null,
		sortOrder: planStore.current!.recurringExpenses.length,
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
	editRecurringExpense(plan.value.id, item.id, { startMonth: value || null });
}
function onRecurringEnd(item: RecurringExpense, value: string): void {
	editRecurringExpense(plan.value.id, item.id, { endMonth: value || null });
}

// --- investment configuration -------------------------------------------------

const investmentDraft = reactive({
	totalTarget: null as Money | null,
	monthlyMinimum: null as Money | null,
	startMonth: "",
	endMonth: "",
});

function syncInvestmentDraft(): void {
	const config = planStore.current?.investmentConfig;
	investmentDraft.totalTarget = config?.totalTarget ?? null;
	investmentDraft.monthlyMinimum = config?.monthlyMinimum ?? null;
	investmentDraft.startMonth = config?.startMonth ?? plan.value.startMonth;
	investmentDraft.endMonth = config?.endMonth ?? plan.value.endMonth;
}
syncInvestmentDraft();

function submitInvestment(): void {
	const payload: InvestmentConfigInput = {
		totalTarget: investmentDraft.totalTarget ?? money(0, currency.value),
		monthlyMinimum: investmentDraft.monthlyMinimum ?? money(0, currency.value),
		startMonth: investmentDraft.startMonth,
		endMonth: investmentDraft.endMonth,
	};
	saveInvestmentConfig(plan.value.id, payload);
}
function removeInvestment(): void {
	saveInvestmentConfig(plan.value.id, null);
	syncInvestmentDraft();
}
</script>

<template>
	<div class="space-y-8">
		<div v-if="planStore.error" class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
			{{ t(`errors.${planStore.error.code}`) }}
		</div>

		<!-- Income -->
		<section>
			<h2 class="mb-2 text-lg font-medium text-gray-900">{{ t("assumptions.incomeSection") }}</h2>
			<table class="w-full text-sm">
				<thead>
					<tr class="text-left text-gray-500">
						<th class="py-1">{{ t("assumptions.itemName") }}</th>
						<th class="py-1">{{ t("assumptions.itemDate") }}</th>
						<th class="py-1 text-right">{{ t("assumptions.itemAmount") }}</th>
						<th class="py-1"></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="item in planStore.current!.incomeItems" :key="item.id" class="border-t border-gray-100">
						<td class="py-1 pr-2">
							<input
								class="w-full rounded border border-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-500 focus:outline-none"
								:value="item.name"
								@change="onIncomeName(item, ($event.target as HTMLInputElement).value)"
							/>
						</td>
						<td class="py-1 pr-2">
							<input
								type="date"
								class="rounded border border-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-500 focus:outline-none"
								:value="item.date"
								@change="onIncomeDate(item, ($event.target as HTMLInputElement).value)"
							/>
							<span v-if="isOutsideRange(item.date)" class="ml-1 text-xs text-amber-600" :title="t('assumptions.itemOutsidePlanRangeWarning')">⚠</span>
						</td>
						<td class="py-1 pr-2">
							<MoneyInput :model-value="item.forecast" :currency="currency" @update:model-value="onIncomeForecast(item, $event)" />
						</td>
						<td class="py-1 text-right">
							<button class="text-gray-400 hover:text-red-600" @click="removeIncomeItem(plan.id, item.id)">✕</button>
						</td>
					</tr>
					<tr v-if="planStore.current!.incomeItems.length === 0">
						<td colspan="4" class="py-2 text-gray-400">{{ t("assumptions.emptyIncome") }}</td>
					</tr>
					<tr class="border-t border-gray-200" @keydown.enter="commitNewIncomeRow">
						<td class="py-1 pr-2">
							<input ref="newIncomeNameInput" v-model="newIncome.name" class="w-full rounded border border-gray-300 px-1 py-0.5" />
						</td>
						<td class="py-1 pr-2">
							<input v-model="newIncome.date" type="date" class="rounded border border-gray-300 px-1 py-0.5" />
						</td>
						<td class="py-1 pr-2">
							<MoneyInput
								v-model="newIncome.forecast"
								:currency="currency"
								@keydown="(e: KeyboardEvent) => onLastFieldTab(e, commitNewIncomeRow)"
							/>
						</td>
						<td class="py-1 text-right">
							<button class="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50" @click="commitNewIncomeRow">
								{{ t("assumptions.addIncome") }}
							</button>
						</td>
					</tr>
				</tbody>
			</table>
		</section>

		<!-- Recurring expenses -->
		<section>
			<h2 class="mb-2 text-lg font-medium text-gray-900">{{ t("assumptions.recurringSection") }}</h2>
			<table class="w-full text-sm">
				<thead>
					<tr class="text-left text-gray-500">
						<th class="py-1">{{ t("assumptions.itemName") }}</th>
						<th class="py-1 text-right">{{ t("assumptions.monthlyAmount") }}</th>
						<th class="py-1">{{ t("assumptions.rangeStart") }}</th>
						<th class="py-1">{{ t("assumptions.rangeEnd") }}</th>
						<th class="py-1"></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="item in planStore.current!.recurringExpenses" :key="item.id" class="border-t border-gray-100">
						<td class="py-1 pr-2">
							<input
								class="w-full rounded border border-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-500 focus:outline-none"
								:value="item.name"
								@change="onRecurringName(item, ($event.target as HTMLInputElement).value)"
							/>
						</td>
						<td class="py-1 pr-2">
							<MoneyInput :model-value="item.monthly" :currency="currency" @update:model-value="onRecurringMonthly(item, $event)" />
						</td>
						<td class="py-1 pr-2">
							<MonthPicker :model-value="item.startMonth ?? ''" @update:model-value="onRecurringStart(item, $event)" />
						</td>
						<td class="py-1 pr-2">
							<MonthPicker :model-value="item.endMonth ?? ''" @update:model-value="onRecurringEnd(item, $event)" />
						</td>
						<td class="py-1 text-right">
							<button class="text-gray-400 hover:text-red-600" @click="removeRecurringExpense(plan.id, item.id)">✕</button>
						</td>
					</tr>
					<tr v-if="planStore.current!.recurringExpenses.length === 0">
						<td colspan="5" class="py-2 text-gray-400">{{ t("assumptions.emptyRecurring") }}</td>
					</tr>
					<tr class="border-t border-gray-200" @keydown.enter="commitNewRecurringRow">
						<td class="py-1 pr-2">
							<input
								ref="newRecurringNameInput"
								v-model="newRecurring.name"
								class="w-full rounded border border-gray-300 px-1 py-0.5"
							/>
						</td>
						<td class="py-1 pr-2">
							<MoneyInput v-model="newRecurring.monthly" :currency="currency" />
						</td>
						<td class="py-1 pr-2">
							<MonthPicker v-model="newRecurring.startMonth" />
						</td>
						<td class="py-1 pr-2">
							<MonthPicker
								v-model="newRecurring.endMonth"
								@keydown="(e: KeyboardEvent) => onLastFieldTab(e, commitNewRecurringRow)"
							/>
						</td>
						<td class="py-1 text-right">
							<button class="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50" @click="commitNewRecurringRow">
								{{ t("assumptions.addRecurring") }}
							</button>
						</td>
					</tr>
				</tbody>
			</table>
			<p class="mt-1 text-xs text-gray-400">{{ t("assumptions.rangeHint") }}</p>
		</section>

		<!-- One-time expenses -->
		<section>
			<h2 class="mb-2 text-lg font-medium text-gray-900">{{ t("assumptions.oneTimeSection") }}</h2>
			<table class="w-full text-sm">
				<thead>
					<tr class="text-left text-gray-500">
						<th class="py-1">{{ t("assumptions.itemName") }}</th>
						<th class="py-1">{{ t("assumptions.itemDate") }}</th>
						<th class="py-1 text-right">{{ t("assumptions.itemAmount") }}</th>
						<th class="py-1"></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="item in planStore.current!.oneTimeExpenses" :key="item.id" class="border-t border-gray-100">
						<td class="py-1 pr-2">
							<input
								class="w-full rounded border border-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-500 focus:outline-none"
								:value="item.name"
								@change="onOneTimeName(item, ($event.target as HTMLInputElement).value)"
							/>
						</td>
						<td class="py-1 pr-2">
							<input
								type="date"
								class="rounded border border-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-500 focus:outline-none"
								:value="item.date"
								@change="onOneTimeDate(item, ($event.target as HTMLInputElement).value)"
							/>
							<span v-if="isOutsideRange(item.date)" class="ml-1 text-xs text-amber-600" :title="t('assumptions.itemOutsidePlanRangeWarning')">⚠</span>
						</td>
						<td class="py-1 pr-2">
							<MoneyInput :model-value="item.forecast" :currency="currency" @update:model-value="onOneTimeForecast(item, $event)" />
						</td>
						<td class="py-1 text-right">
							<button class="text-gray-400 hover:text-red-600" @click="removeOneTimeExpense(plan.id, item.id)">✕</button>
						</td>
					</tr>
					<tr v-if="planStore.current!.oneTimeExpenses.length === 0">
						<td colspan="4" class="py-2 text-gray-400">{{ t("assumptions.emptyOneTime") }}</td>
					</tr>
					<tr class="border-t border-gray-200" @keydown.enter="commitNewOneTimeRow">
						<td class="py-1 pr-2">
							<input
								ref="newOneTimeNameInput"
								v-model="newOneTime.name"
								class="w-full rounded border border-gray-300 px-1 py-0.5"
							/>
						</td>
						<td class="py-1 pr-2">
							<input v-model="newOneTime.date" type="date" class="rounded border border-gray-300 px-1 py-0.5" />
						</td>
						<td class="py-1 pr-2">
							<MoneyInput
								v-model="newOneTime.forecast"
								:currency="currency"
								@keydown="(e: KeyboardEvent) => onLastFieldTab(e, commitNewOneTimeRow)"
							/>
						</td>
						<td class="py-1 text-right">
							<button class="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50" @click="commitNewOneTimeRow">
								{{ t("assumptions.addOneTime") }}
							</button>
						</td>
					</tr>
				</tbody>
			</table>
		</section>

		<!-- Investment -->
		<section>
			<h2 class="mb-2 text-lg font-medium text-gray-900">{{ t("assumptions.investmentSection") }}</h2>
			<div class="max-w-md space-y-3 rounded border border-gray-200 p-4">
				<div>
					<label class="mb-1 block text-sm text-gray-700">{{ t("assumptions.totalTarget") }}</label>
					<MoneyInput v-model="investmentDraft.totalTarget" :currency="currency" />
				</div>
				<div>
					<label class="mb-1 block text-sm text-gray-700">{{ t("assumptions.monthlyMinimum") }}</label>
					<MoneyInput v-model="investmentDraft.monthlyMinimum" :currency="currency" />
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="mb-1 block text-sm text-gray-700">{{ t("assumptions.investmentRangeStart") }}</label>
						<MonthPicker v-model="investmentDraft.startMonth" />
					</div>
					<div>
						<label class="mb-1 block text-sm text-gray-700">{{ t("assumptions.investmentRangeEnd") }}</label>
						<MonthPicker v-model="investmentDraft.endMonth" />
					</div>
				</div>
				<div class="flex gap-2 pt-1">
					<button class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700" @click="submitInvestment">
						{{ t("common.save") }}
					</button>
					<button
						v-if="planStore.current!.investmentConfig"
						class="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
						@click="removeInvestment"
					>
						{{ t("assumptions.removeInvestment") }}
					</button>
				</div>
			</div>
		</section>
	</div>
</template>
