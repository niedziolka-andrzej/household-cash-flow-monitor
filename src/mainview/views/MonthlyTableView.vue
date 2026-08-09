<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { Money } from "../../shared/money";
import type { MonthlyResult } from "../../shared/types";
import MoneyCell from "../components/MoneyCell.vue";
import MoneyInput from "../components/MoneyInput.vue";
import { planStore, upsertMonthlyActual, upsertOverride, upsertRecurringActual } from "../store/planStore";

const { t } = useI18n();

const plan = computed(() => planStore.current!.plan);
const months = computed(() => planStore.current!.results.months);
const currency = computed(() => plan.value.currency);
const recurringItems = computed(() => planStore.current!.recurringExpenses);

const monthFormatter = new Intl.DateTimeFormat("pl-PL", { month: "short", year: "numeric" });
function formatMonthHeader(month: string): string {
	const [year, m] = month.split("-").map(Number);
	return monthFormatter.format(new Date(year, m - 1, 1));
}

function balanceSourceLabel(source: MonthlyResult["balanceSource"]): string {
	if (source === "override") return t("table.balanceSourceOverride");
	if (source === "actual") return t("table.balanceSourceActual");
	return t("table.balanceSourceForecast");
}

function recurringRowFor(monthResult: MonthlyResult, recurringId: number) {
	return monthResult.recurringRows.find((r) => r.id === recurringId) ?? null;
}

function onIncomeActual(month: string, value: Money | null): void {
	upsertMonthlyActual(plan.value.id, month, "income", value);
}
function onOneTimeActual(month: string, value: Money | null): void {
	upsertMonthlyActual(plan.value.id, month, "oneTimeExpense", value);
}
function onInvestmentActual(month: string, value: Money | null): void {
	upsertMonthlyActual(plan.value.id, month, "investment", value);
}
function onRecurringActual(recurringId: number, month: string, value: Money | null): void {
	upsertRecurringActual(plan.value.id, recurringId, month, value);
}
function onOverride(month: string, value: Money | null): void {
	upsertOverride(plan.value.id, month, value);
}
</script>

<template>
	<div class="space-y-3">
		<div v-if="planStore.error" class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
			{{ t(`errors.${planStore.error.code}`) }}
		</div>
		<p class="text-xs text-gray-400">{{ t("table.balanceSourceLegend") }}</p>

		<div class="overflow-x-auto rounded border border-gray-200">
			<table class="min-w-full border-collapse text-sm">
				<thead>
					<tr class="bg-gray-50">
						<th class="sticky left-0 z-10 min-w-[220px] bg-gray-50 px-3 py-2 text-left font-medium text-gray-600">
							{{ t("table.month") }}
						</th>
						<th
							v-for="m in months"
							:key="m.month"
							class="min-w-[130px] px-3 py-2 text-right font-medium text-gray-600"
							:class="{ 'bg-red-50 text-red-700': m.flags.negativeMonthlyBalance || m.flags.negativeCumulativeBalance }"
						>
							{{ formatMonthHeader(m.month) }}
						</th>
					</tr>
				</thead>
				<tbody>
					<!-- Income -->
					<tr class="border-t border-gray-100">
						<th class="sticky left-0 z-10 bg-white px-3 py-2 text-left font-normal text-gray-700">{{ t("table.income") }}</th>
						<td v-for="m in months" :key="m.month" class="px-3 py-2">
							<div class="mb-1 text-right text-xs text-gray-400"><MoneyCell :value="m.income.forecast" muted /></div>
							<MoneyInput
								:model-value="planStore.current!.monthlyActuals.find((a) => a.month === m.month)?.income ?? null"
								:currency="currency"
								:placeholder="t('table.actualRow')"
								@update:model-value="onIncomeActual(m.month, $event)"
							/>
						</td>
					</tr>

					<!-- Recurring expenses, one row per item -->
					<tr v-for="item in recurringItems" :key="item.id" class="border-t border-gray-100">
						<th class="sticky left-0 z-10 bg-white px-3 py-2 text-left font-normal text-gray-700">{{ item.name }}</th>
						<td v-for="m in months" :key="m.month" class="px-3 py-2">
							<template v-if="recurringRowFor(m, item.id)">
								<div class="mb-1 text-right text-xs text-gray-400">
									<MoneyCell :value="recurringRowFor(m, item.id)!.forecast" muted />
								</div>
								<MoneyInput
									:model-value="recurringRowFor(m, item.id)!.actual"
									:currency="currency"
									:placeholder="t('table.actualRow')"
									@update:model-value="onRecurringActual(item.id, m.month, $event)"
								/>
							</template>
							<span v-else class="text-gray-300">—</span>
						</td>
					</tr>

					<!-- Recurring total -->
					<tr class="border-t border-gray-100 bg-gray-50/50">
						<th class="sticky left-0 z-10 bg-gray-50/50 px-3 py-2 text-left font-normal text-gray-700">{{ t("table.recurringTotal") }}</th>
						<td v-for="m in months" :key="m.month" class="px-3 py-2 text-right">
							<MoneyCell :value="m.recurringTotal.effective" />
						</td>
					</tr>

					<!-- One-time expenses -->
					<tr class="border-t border-gray-100">
						<th class="sticky left-0 z-10 bg-white px-3 py-2 text-left font-normal text-gray-700">{{ t("table.oneTimeTotal") }}</th>
						<td v-for="m in months" :key="m.month" class="px-3 py-2">
							<div class="mb-1 text-right text-xs text-gray-400"><MoneyCell :value="m.oneTimeTotal.forecast" muted /></div>
							<MoneyInput
								:model-value="planStore.current!.monthlyActuals.find((a) => a.month === m.month)?.oneTimeExpense ?? null"
								:currency="currency"
								:placeholder="t('table.actualRow')"
								@update:model-value="onOneTimeActual(m.month, $event)"
							/>
						</td>
					</tr>

					<!-- Expenses total -->
					<tr class="border-t border-gray-100 bg-gray-50/50">
						<th class="sticky left-0 z-10 bg-gray-50/50 px-3 py-2 text-left font-normal text-gray-700">{{ t("table.expensesTotal") }}</th>
						<td v-for="m in months" :key="m.month" class="px-3 py-2 text-right">
							<MoneyCell :value="m.expensesTotal.effective" />
						</td>
					</tr>

					<!-- Surplus -->
					<tr class="border-t border-gray-100">
						<th class="sticky left-0 z-10 bg-white px-3 py-2 text-left font-normal text-gray-700">{{ t("table.surplus") }}</th>
						<td v-for="m in months" :key="m.month" class="px-3 py-2 text-right">
							<MoneyCell :value="m.surplus.effective" variant="auto" />
						</td>
					</tr>

					<!-- Investment -->
					<tr class="border-t border-gray-100">
						<th class="sticky left-0 z-10 bg-white px-3 py-2 text-left font-normal text-gray-700">{{ t("table.investment") }}</th>
						<td v-for="m in months" :key="m.month" class="px-3 py-2">
							<div class="mb-1 text-right text-xs text-gray-400"><MoneyCell :value="m.investment.forecast" muted /></div>
							<MoneyInput
								:model-value="planStore.current!.monthlyActuals.find((a) => a.month === m.month)?.investment ?? null"
								:currency="currency"
								:placeholder="t('table.actualRow')"
								@update:model-value="onInvestmentActual(m.month, $event)"
							/>
						</td>
					</tr>

					<!-- Monthly balance -->
					<tr class="border-t border-gray-200 bg-gray-50">
						<th class="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-800">{{ t("table.monthlyBalance") }}</th>
						<td v-for="m in months" :key="m.month" class="px-3 py-2 text-right">
							<div class="flex items-center justify-end gap-1">
								<span class="rounded bg-white px-1 text-[10px] text-gray-400" :title="balanceSourceLabel(m.balanceSource)">{{
									balanceSourceLabel(m.balanceSource)
								}}</span>
								<MoneyCell :value="m.monthlyBalance.effective" variant="auto" />
							</div>
							<div v-if="m.flags.negativeMonthlyBalance" class="text-right text-[10px] text-red-600">{{ t("table.riskNegativeMonthly") }}</div>
						</td>
					</tr>

					<!-- Manual override -->
					<tr class="border-t border-gray-100">
						<th class="sticky left-0 z-10 bg-white px-3 py-2 text-left font-normal italic text-gray-700">{{ t("table.override") }}</th>
						<td v-for="m in months" :key="m.month" class="px-3 py-2">
							<MoneyInput
								:model-value="planStore.current!.overrides.find((o) => o.month === m.month)?.balance ?? null"
								:currency="currency"
								:placeholder="t('table.clearOverride')"
								@update:model-value="onOverride(m.month, $event)"
							/>
						</td>
					</tr>

					<!-- Cumulative balance -->
					<tr class="border-t border-gray-200 bg-gray-50">
						<th class="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-800">{{ t("table.cumulativeBalance") }}</th>
						<td v-for="m in months" :key="m.month" class="px-3 py-2 text-right">
							<MoneyCell :value="m.cumulativeBalance.effective" variant="auto" />
							<div v-if="m.flags.negativeCumulativeBalance" class="text-[10px] text-red-600">{{ t("table.riskNegativeCumulative") }}</div>
						</td>
					</tr>

					<!-- Cumulative invested -->
					<tr class="border-t border-gray-100">
						<th class="sticky left-0 z-10 bg-white px-3 py-2 text-left font-normal text-gray-700">{{ t("table.cumulativeInvested") }}</th>
						<td v-for="m in months" :key="m.month" class="px-3 py-2 text-right">
							<MoneyCell :value="m.cumulativeInvested.effective" />
						</td>
					</tr>

					<!-- Variance on monthly balance -->
					<tr class="border-t border-gray-100">
						<th class="sticky left-0 z-10 bg-white px-3 py-2 text-left font-normal text-gray-700">{{ t("table.variance") }}</th>
						<td v-for="m in months" :key="m.month" class="px-3 py-2 text-right">
							<MoneyCell :value="m.monthlyBalance.variance" variant="auto" />
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>
