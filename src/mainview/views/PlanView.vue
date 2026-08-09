<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { compareMonths } from "../../shared/months";
import { goToPlan, goToPlanList, route, setTab } from "../store/navigation";
import { loadPlans, openPlan, planStore } from "../store/planStore";
import AssumptionsView from "./AssumptionsView.vue";
import MonthlyTableView from "./MonthlyTableView.vue";

const { t } = useI18n();

const planId = computed(() => (route.value.view === "plan" ? route.value.planId : null));
const tab = computed(() => (route.value.view === "plan" ? route.value.tab : "monthly"));

async function load(): Promise<void> {
	if (planId.value !== null) await openPlan(planId.value);
}
onMounted(async () => {
	await load();
	// The header's prev/next needs the sibling list, which may not be loaded if the app
	// opened straight into a plan.
	if (planStore.plans.length === 0) await loadPlans();
});
watch(planId, load);

/** Plans in chronological order, so prev/next moves through time rather than insertion order. */
const orderedPlans = computed(() =>
	[...planStore.plans].sort((a, b) => compareMonths(a.startMonth, b.startMonth) || a.name.localeCompare(b.name, "pl")),
);
const currentIndex = computed(() => orderedPlans.value.findIndex((p) => p.id === planId.value));
const previousPlan = computed(() => (currentIndex.value > 0 ? orderedPlans.value[currentIndex.value - 1] : null));
const nextPlan = computed(() =>
	currentIndex.value >= 0 && currentIndex.value < orderedPlans.value.length - 1
		? orderedPlans.value[currentIndex.value + 1]
		: null,
);

const timeFormatter = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const savedLabel = computed(() => {
	if (planStore.loading) return t("save.saving");
	if (planStore.lastSavedAt === null) return t("save.autoSaveHint");
	return t("save.autoSavedAt", { time: timeFormatter.format(new Date(planStore.lastSavedAt)) });
});

/**
 * Everything on these screens persists on field blur, so "save now" flushes whatever field
 * still holds focus. That covers the investment card too, which autosaves on blur once its
 * four values are locally valid.
 */
function saveNow(): void {
	(document.activeElement as HTMLElement | null)?.blur();
}
</script>

<template>
	<div v-if="planStore.current" class="mx-auto max-w-[1180px] px-8 pb-20">
		<!-- z-40 keeps this above the monthly table's sticky first column (z-20/z-30), which
		     otherwise paints over the header once the table is scrolled sideways. -->
		<div class="sticky top-0 z-40 bg-canvas pt-7">
			<div class="flex items-center gap-5">
				<button
					type="button"
					class="flex items-center gap-1.5 rounded-control px-2.5 py-2 text-sm font-semibold text-ink-muted hover:bg-neutralSoft"
					@click="goToPlanList"
				>
					<svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
						<path
							d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"
						/>
					</svg>
					{{ t("nav.plans") }}
				</button>

				<div class="flex flex-1 items-center justify-center gap-2.5">
					<button
						type="button"
						class="flex h-8 w-8 items-center justify-center rounded-control border border-edge bg-surface text-ink disabled:opacity-35"
						:disabled="!previousPlan"
						:title="previousPlan?.name"
						:aria-label="t('nav.previousPlan')"
						@click="previousPlan && goToPlan(previousPlan.id, tab)"
					>
						<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
							<path
								d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"
							/>
						</svg>
					</button>
					<h1 class="min-w-[5ch] text-center font-display text-2xl font-bold">{{ planStore.current.plan.name }}</h1>
					<button
						type="button"
						class="flex h-8 w-8 items-center justify-center rounded-control border border-edge bg-surface text-ink disabled:opacity-35"
						:disabled="!nextPlan"
						:title="nextPlan?.name"
						:aria-label="t('nav.nextPlan')"
						@click="nextPlan && goToPlan(nextPlan.id, tab)"
					>
						<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
							<path
								d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"
							/>
						</svg>
					</button>
				</div>

				<div class="flex items-center gap-3">
					<span class="text-xs text-ink-subtle">{{ savedLabel }}</span>
					<button
						type="button"
						class="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-accent hover:bg-accent-hover disabled:opacity-60"
						:disabled="planStore.loading"
						@click="saveNow"
					>
						<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
							<path
								d="M223.14,72.44l-40-40A8,8,0,0,0,176,32H56A16,16,0,0,0,40,48V216a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V88A8,8,0,0,0,223.14,72.44ZM144,80H88V48h56Zm32,136H80V152h96Z"
							/>
						</svg>
						{{ t("save.saveNow") }}
					</button>
				</div>
			</div>

			<div class="mt-5 flex items-center justify-between gap-4 pb-5">
				<div class="inline-flex gap-1 rounded-2xl border border-edge bg-surface p-1">
					<button
						type="button"
						class="rounded-control px-4 py-2 text-sm font-semibold"
						:class="tab === 'assumptions' ? 'bg-accent text-white' : 'text-ink-muted hover:bg-neutralSoft'"
						@click="setTab('assumptions')"
					>
						{{ t("nav.assumptions") }}
					</button>
					<button
						type="button"
						class="rounded-control px-4 py-2 text-sm font-semibold"
						:class="tab === 'monthly' ? 'bg-accent text-white' : 'text-ink-muted hover:bg-neutralSoft'"
						@click="setTab('monthly')"
					>
						{{ t("nav.monthlyTable") }}
					</button>
				</div>

				<div v-if="tab === 'monthly'" class="flex items-center gap-2">
					<span class="rounded-full bg-neutralSoft px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
						{{ t("table.tagForecast") }}
					</span>
					<span class="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
						{{ t("table.tagActual") }}
					</span>
					<span class="rounded-full bg-danger-soft px-2.5 py-1 text-[11px] font-semibold text-danger">
						{{ t("table.tagNegative") }}
					</span>
				</div>
			</div>
		</div>

		<div v-if="planStore.error" class="mb-4 rounded-control bg-danger-soft px-4 py-2.5 text-sm text-danger">
			{{ t(`errors.${planStore.error.code}`) }}
		</div>

		<AssumptionsView v-if="tab === 'assumptions'" />
		<MonthlyTableView v-else />
	</div>
	<div v-else class="p-8 text-ink-subtle">{{ t("common.loading") }}</div>
</template>
