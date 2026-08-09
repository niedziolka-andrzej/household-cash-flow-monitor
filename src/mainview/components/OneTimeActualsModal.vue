<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { formatMoney, formatSignedMoney, type Money, sameAmount, subtractMoney, sumMoney } from "../../shared/money";
import type { OneTimeExpenseRow } from "../../shared/types";
import MoneyInput from "./MoneyInput.vue";

/**
 * Per-item corrections for one month's one-time expenses: for each item the plan figure is
 * shown struck through and the amount actually paid is typed beside it. The forecast is
 * never touched — the month's effective total is recomputed server-side from
 * corrected-or-forecast items (ADR 0002), which is why an item left blank still counts at
 * its plan value rather than at zero.
 *
 * A lump sum for the whole month would have been one field instead of N, but it loses which
 * item drifted — and that is the only question worth asking of a list of one-off spends.
 */
const props = defineProps<{
	open: boolean;
	/** Long-form month label ("sierpień 2026") for the subtitle. */
	monthLabel: string;
	rows: OneTimeExpenseRow[];
	currency: string;
}>();
const emit = defineEmits<{
	close: [];
	update: [oneTimeExpenseId: number, value: Money | null];
}>();

const { t } = useI18n();

const dialogEl = ref<HTMLElement | null>(null);

const forecastTotal = computed(() =>
	sumMoney(
		props.currency,
		props.rows.map((r) => r.forecast),
	),
);
const actualTotal = computed(() =>
	sumMoney(
		props.currency,
		props.rows.map((r) => r.effective),
	),
);
const delta = computed(() => subtractMoney(actualTotal.value, forecastTotal.value));

// Land the caret in the first amount field on open — the dialog exists to be typed into.
watch(
	() => props.open,
	async (isOpen) => {
		if (!isOpen) return;
		await nextTick();
		dialogEl.value?.querySelector("input")?.focus();
	},
);

/** MoneyInput commits on blur; only send an RPC when the amount actually changed, so
 * tabbing through an untouched row doesn't write. */
function onCommit(row: OneTimeExpenseRow, parsed: Money | null): void {
	if (!sameAmount(row.actual, parsed)) emit("update", row.id, parsed);
}
</script>

<template>
	<div
		v-if="open"
		class="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6"
		@click="emit('close')"
	>
		<div
			ref="dialogEl"
			class="max-h-[82vh] w-[480px] max-w-full overflow-y-auto rounded-card bg-surface p-6 shadow-xl"
			role="dialog"
			aria-modal="true"
			@click.stop
		>
			<div class="mb-1 flex items-start justify-between gap-4">
				<h2 class="font-display text-lg font-bold text-ink">{{ t("oneTimeActuals.title") }}</h2>
				<button
					type="button"
					class="-mr-1.5 -mt-1 rounded-control p-1 text-ink-faint hover:text-ink"
					:aria-label="t('common.close')"
					@click="emit('close')"
				>
					<svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4" aria-hidden="true">
						<path
							d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 0 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 0 0-1.06-1.06L10 8.94 5.28 4.22Z"
						/>
					</svg>
				</button>
			</div>
			<p class="mb-4 text-[13px] text-ink-muted">
				{{ t("oneTimeActuals.subtitle", { month: monthLabel }) }}
			</p>

			<p v-if="rows.length === 0" class="border-t border-hairline py-4 text-sm text-ink-subtle">
				{{ t("oneTimeActuals.empty") }}
			</p>

			<div
				v-for="row in rows"
				:key="row.id"
				class="flex items-center justify-between gap-3.5 border-t border-hairline py-2.5"
			>
				<div class="min-w-0">
					<div class="truncate text-sm font-semibold text-ink">{{ row.name }}</div>
					<div class="flex gap-2 text-xs text-ink-subtle">
						<span class="tabular-nums">{{ row.date }}</span>
						<span class="tabular-nums line-through">
							{{ t("oneTimeActuals.planPrefix") }} {{ formatMoney(row.forecast, "pl-PL") }}
						</span>
					</div>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<span class="w-[118px]">
						<MoneyInput
							:model-value="row.actual"
							:currency="currency"
							:placeholder="t('oneTimeActuals.amountPlaceholder')"
							hide-currency
							@commit="onCommit(row, $event)"
						/>
					</span>
					<button
						type="button"
						class="rounded-control p-1"
						:class="row.actual !== null ? 'text-ink-faint hover:text-danger' : 'text-edge'"
						:disabled="row.actual === null"
						:aria-label="t('oneTimeActuals.clearCorrection')"
						:title="t('oneTimeActuals.clearCorrection')"
						@click="emit('update', row.id, null)"
					>
						<svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5" aria-hidden="true">
							<path
								d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L8.94 10l-4.72 4.72a.75.75 0 1 0 1.06 1.06L10 11.06l4.72 4.72a.75.75 0 0 0 1.06-1.06L11.06 10l4.72-4.72a.75.75 0 0 0-1.06-1.06L10 8.94 5.28 4.22Z"
							/>
						</svg>
					</button>
				</div>
			</div>

			<div class="mt-2 flex items-baseline justify-between border-t border-edge pt-3.5 text-[13px] text-ink-muted">
				<span>
					{{ t("oneTimeActuals.forecastTotal") }}
					<span class="font-bold tabular-nums text-ink">{{ formatMoney(forecastTotal, "pl-PL") }}</span>
				</span>
				<span>
					{{ t("oneTimeActuals.actualTotal") }}
					<span class="font-bold tabular-nums text-ink">{{ formatMoney(actualTotal, "pl-PL") }}</span>
					<span
						v-if="delta.amountMinor !== 0"
						class="ml-1 font-bold tabular-nums"
						:class="delta.amountMinor > 0 ? 'text-danger' : 'text-accent'"
					>
						{{ formatSignedMoney(delta, "pl-PL") }}
					</span>
				</span>
			</div>

			<div class="mt-4 flex justify-end">
				<button
					type="button"
					class="rounded-control bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
					@click="emit('close')"
				>
					{{ t("oneTimeActuals.done") }}
				</button>
			</div>
		</div>
	</div>
</template>
