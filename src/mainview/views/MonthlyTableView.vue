<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { formatMoney, type Money } from "../../shared/money";
import type { BalanceSource, MonthlyResult } from "../../shared/types";
import ActualCell from "../components/ActualCell.vue";
import CumulativeBalanceChart from "../components/CumulativeBalanceChart.vue";
import IncomeExpenseChart from "../components/IncomeExpenseChart.vue";
import Tag from "../components/Tag.vue";
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

/** Which rung of the override → actual → forecast hierarchy produced this month's balance. */
function sourceTag(source: BalanceSource): { label: string; tone: "neutral" | "accent" | "danger" } {
	if (source === "override") return { label: t("table.tagOverride"), tone: "accent" };
	if (source === "actual") return { label: t("table.tagActual"), tone: "accent" };
	return { label: t("table.tagForecast"), tone: "neutral" };
}

function recurringRowFor(monthResult: MonthlyResult, recurringId: number) {
	return monthResult.recurringRows.find((r) => r.id === recurringId) ?? null;
}
function aggregateActual(month: string) {
	return planStore.current!.monthlyActuals.find((a) => a.month === month) ?? null;
}
function overrideFor(month: string) {
	return planStore.current!.overrides.find((o) => o.month === month) ?? null;
}

/** Colored ink for signed figures; plain ink where the sign carries no meaning. */
function toneClass(value: Money, signed: boolean): string {
	if (!signed) return "text-ink";
	if (value.amountMinor < 0) return "text-danger";
	if (value.amountMinor > 0) return "text-accent";
	return "text-ink";
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

// The table uses border-separate (not collapse) because a collapsed border model renders
// the sticky first column's edges unreliably while scrolling sideways.
// The frozen column needs its own right edge — without it the scrolling values slide
// under the labels with nothing separating them.
const ROW_HEADER =
	"sticky left-0 z-20 min-w-[240px] whitespace-nowrap border-b border-r border-hairline px-3 py-2.5 text-left";
const GROUP_HEADER =
	"sticky left-0 z-20 border-r border-hairline px-3 pb-1.5 pt-4 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint";
const DATA_CELL = "min-w-[150px] border-b border-hairline px-3 py-2.5 align-top text-right";
</script>

<template>
	<div class="grid gap-6">
		<div class="grid gap-6 lg:grid-cols-2">
			<div class="rounded-card bg-surface p-5 shadow-card">
				<h3 class="font-display text-[15px] font-bold text-ink">{{ t("charts.incomeExpenseTitle") }}</h3>
				<p class="mb-1 text-xs text-ink-subtle">{{ t("charts.incomeExpenseSubtitle") }}</p>
				<IncomeExpenseChart :months="months" :currency="currency" />
				<div class="mt-1 flex flex-wrap gap-3.5 text-[11px] text-ink-muted">
					<span class="flex items-center gap-1.5">
						<span class="inline-block h-2.5 w-2.5 rounded-sm bg-series-income"></span>{{ t("charts.legendIncome") }}
					</span>
					<span class="flex items-center gap-1.5">
						<span class="inline-block h-2.5 w-2.5 rounded-sm bg-series-recurring"></span>{{ t("charts.legendRecurring") }}
					</span>
					<span class="flex items-center gap-1.5">
						<span class="inline-block h-2.5 w-2.5 rounded-sm bg-series-oneTime"></span>{{ t("charts.legendOneTime") }}
					</span>
				</div>
				<p class="mt-1.5 text-[11px] text-ink-faint">{{ t("charts.barsHint") }}</p>
			</div>

			<div class="rounded-card bg-surface p-5 shadow-card">
				<h3 class="font-display text-[15px] font-bold text-ink">{{ t("charts.balanceTitle") }}</h3>
				<p class="mb-1 text-xs text-ink-subtle">{{ t("charts.balanceSubtitle") }}</p>
				<CumulativeBalanceChart :months="months" />
			</div>
		</div>

		<div class="overflow-x-auto rounded-card bg-surface px-5 shadow-card">
			<table class="min-w-full border-separate border-spacing-0 text-sm">
				<thead>
					<tr>
						<th
							class="sticky left-0 z-30 min-w-[240px] border-b border-r border-hairline bg-surface px-3 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-subtle"
						>
							{{ t("table.month") }}
						</th>
						<th
							v-for="m in months"
							:key="m.month"
							class="min-w-[150px] border-b border-hairline bg-surface px-3 py-3.5 text-right font-display text-sm font-bold"
							:class="m.flags.negativeCumulativeBalance ? 'text-danger' : 'text-ink'"
						>
							{{ formatMonthHeader(m.month) }}
						</th>
					</tr>
				</thead>
				<tbody>
					<!-- Income -->
					<tr>
						<th :class="[ROW_HEADER, 'border-b-0 bg-surface font-normal text-ink']">{{ t("table.income") }}</th>
						<td v-for="m in months" :key="m.month" :class="[DATA_CELL, 'border-b-0']">
							<ActualCell
								:value="aggregateActual(m.month)?.income ?? null"
								:fallback="m.income.forecast"
								:currency="currency"
								:add-label="t('table.addActual')"
								:set-label="t('table.actualDone')"
								@update="onIncomeActual(m.month, $event)"
							/>
						</td>
					</tr>

					<!-- Expenses -->
					<tr>
						<th :class="[GROUP_HEADER, 'bg-surface']">{{ t("table.groupExpenses") }}</th>
						<td v-for="m in months" :key="m.month" class="bg-surface"></td>
					</tr>
					<tr v-for="item in recurringItems" :key="item.id">
						<th :class="[ROW_HEADER, 'bg-surface font-normal text-ink']">{{ item.name }}</th>
						<td v-for="m in months" :key="m.month" :class="DATA_CELL">
							<ActualCell
								v-if="recurringRowFor(m, item.id)"
								:value="recurringRowFor(m, item.id)!.actual"
								:fallback="recurringRowFor(m, item.id)!.forecast"
								:currency="currency"
								:add-label="t('table.addActual')"
								:set-label="t('table.actualDone')"
								@update="onRecurringActual(item.id, m.month, $event)"
							/>
							<span v-else class="text-ink-faint" :title="t('table.notApplicable')">—</span>
						</td>
					</tr>
					<tr>
						<th :class="[ROW_HEADER, 'bg-surface font-bold text-ink']">{{ t("table.recurringTotal") }}</th>
						<td v-for="m in months" :key="m.month" :class="[DATA_CELL, 'font-bold tabular-nums']">
							{{ formatMoney(m.recurringTotal.effective, "pl-PL") }}
						</td>
					</tr>
					<tr>
						<th :class="[ROW_HEADER, 'bg-surface font-normal text-ink']">{{ t("table.oneTimeTotal") }}</th>
						<td v-for="m in months" :key="m.month" :class="DATA_CELL">
							<ActualCell
								:value="aggregateActual(m.month)?.oneTimeExpense ?? null"
								:fallback="m.oneTimeTotal.forecast"
								:currency="currency"
								:add-label="t('table.addActual')"
								:set-label="t('table.actualDone')"
								@update="onOneTimeActual(m.month, $event)"
							/>
						</td>
					</tr>
					<tr>
						<th :class="[ROW_HEADER, 'bg-surface font-bold text-ink']">{{ t("table.expensesTotal") }}</th>
						<td v-for="m in months" :key="m.month" :class="[DATA_CELL, 'font-bold tabular-nums']">
							{{ formatMoney(m.expensesTotal.effective, "pl-PL") }}
						</td>
					</tr>
					<tr>
						<th :class="[ROW_HEADER, 'bg-surface font-bold text-ink']">{{ t("table.surplus") }}</th>
						<td
							v-for="m in months"
							:key="m.month"
							:class="[DATA_CELL, 'font-bold tabular-nums', toneClass(m.surplus.effective, true)]"
						>
							{{ formatMoney(m.surplus.effective, "pl-PL") }}
						</td>
					</tr>

					<!-- Investment -->
					<tr>
						<th :class="[GROUP_HEADER, 'bg-surface']">{{ t("table.groupInvestment") }}</th>
						<td v-for="m in months" :key="m.month" class="bg-surface"></td>
					</tr>
					<tr>
						<th :class="[ROW_HEADER, 'bg-surface font-normal text-ink']">{{ t("table.investment") }}</th>
						<td v-for="m in months" :key="m.month" :class="DATA_CELL">
							<ActualCell
								:value="aggregateActual(m.month)?.investment ?? null"
								:fallback="m.investment.forecast"
								:currency="currency"
								:add-label="t('table.addActual')"
								:set-label="t('table.actualDone')"
								@update="onInvestmentActual(m.month, $event)"
							/>
						</td>
					</tr>

					<!-- Monthly result -->
					<tr>
						<th :class="[GROUP_HEADER, 'bg-surface']">{{ t("table.groupResult") }}</th>
						<td v-for="m in months" :key="m.month" class="bg-surface"></td>
					</tr>
					<tr>
						<th :class="[ROW_HEADER, 'bg-surface font-bold text-ink']">{{ t("table.monthlyBalance") }}</th>
						<td v-for="m in months" :key="m.month" :class="DATA_CELL">
							<div class="flex flex-col items-end gap-1.5">
								<span class="font-bold tabular-nums" :class="toneClass(m.monthlyBalance.effective, true)">
									{{ formatMoney(m.monthlyBalance.effective, "pl-PL") }}
								</span>
								<Tag :tone="sourceTag(m.balanceSource).tone">{{ sourceTag(m.balanceSource).label }}</Tag>
								<Tag v-if="m.flags.negativeMonthlyBalance" tone="danger" :title="t('table.riskNegativeMonthly')">
									{{ t("table.tagNegative") }}
								</Tag>
							</div>
						</td>
					</tr>
					<tr>
						<th :class="[ROW_HEADER, 'bg-surface font-normal italic text-ink']">{{ t("table.override") }}</th>
						<td v-for="m in months" :key="m.month" :class="DATA_CELL">
							<ActualCell
								:value="overrideFor(m.month)?.balance ?? null"
								:fallback="m.monthlyBalance.effective"
								:currency="currency"
								:add-label="t('table.setOverride')"
								:set-label="t('table.overrideSet')"
								@update="onOverride(m.month, $event)"
							/>
						</td>
					</tr>
					<tr>
						<th :class="[ROW_HEADER, 'bg-surface font-bold text-ink']">{{ t("table.cumulativeBalance") }}</th>
						<td v-for="m in months" :key="m.month" :class="DATA_CELL">
							<div class="flex flex-col items-end gap-1.5">
								<span class="font-bold tabular-nums" :class="toneClass(m.cumulativeBalance.effective, true)">
									{{ formatMoney(m.cumulativeBalance.effective, "pl-PL") }}
								</span>
								<Tag v-if="m.flags.negativeCumulativeBalance" tone="danger" :title="t('table.riskNegativeCumulative')">
									{{ t("table.tagNegative") }}
								</Tag>
							</div>
						</td>
					</tr>
					<tr>
						<th :class="[ROW_HEADER, 'bg-surface font-bold text-ink']">{{ t("table.cumulativeInvested") }}</th>
						<td v-for="m in months" :key="m.month" :class="[DATA_CELL, 'font-bold tabular-nums']">
							{{ formatMoney(m.cumulativeInvested.effective, "pl-PL") }}
						</td>
					</tr>
					<tr>
						<th :class="[ROW_HEADER, 'bg-surface font-bold text-ink']">{{ t("table.variance") }}</th>
						<td
							v-for="m in months"
							:key="m.month"
							:class="[DATA_CELL, 'font-bold tabular-nums', toneClass(m.monthlyBalance.variance, true)]"
						>
							{{ formatMoney(m.monthlyBalance.variance, "pl-PL") }}
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<p class="text-xs text-ink-faint">{{ t("table.totalInvestedInvariantHint") }}</p>
	</div>
</template>
