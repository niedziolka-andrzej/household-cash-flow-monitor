<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { formatMoney, money } from "../../shared/money";
import type { PlanCoreInput, PlanSummary } from "../../shared/types";
import PlanFormModal, { type PlanFormInitial } from "../components/PlanFormModal.vue";
import Tag from "../components/Tag.vue";
import { goToPlan } from "../store/navigation";
import { checkForUpdates } from "../store/updateStore";
import {
	createPlan,
	deletePlan,
	duplicatePlan,
	loadPlans,
	openPlan,
	planStore,
	updatePlanCore,
} from "../store/planStore";

const { t } = useI18n();

onMounted(loadPlans);

const modalOpen = ref(false);
const modalMode = ref<"create" | "edit" | "duplicate">("create");
const modalInitial = ref<PlanFormInitial | null>(null);
const modalTargetPlanId = ref<number | null>(null);

function openCreateModal(): void {
	modalMode.value = "create";
	modalInitial.value = null;
	modalTargetPlanId.value = null;
	modalOpen.value = true;
}

async function openEditModal(summary: PlanSummary): Promise<void> {
	// Fetch the full plan (PlanSummary has no openingBalance) so the form is seeded with
	// the real value instead of a placeholder.
	await openPlan(summary.id);
	if (!planStore.current) return;
	modalMode.value = "edit";
	modalInitial.value = { ...planStore.current.plan };
	modalTargetPlanId.value = summary.id;
	modalOpen.value = true;
}

function openDuplicateModal(summary: PlanSummary): void {
	modalMode.value = "duplicate";
	modalInitial.value = {
		name: summary.name,
		startMonth: summary.startMonth,
		endMonth: summary.endMonth,
		currency: summary.currency,
		openingBalance: money(0, summary.currency), // not shown/sent for duplicate — the server copies the real value
	};
	modalTargetPlanId.value = summary.id;
	modalOpen.value = true;
}

async function onModalSubmit(payload: PlanCoreInput | { newName: string }): Promise<void> {
	if (modalMode.value === "create") {
		const snapshot = await createPlan(payload as PlanCoreInput);
		modalOpen.value = false;
		if (snapshot) goToPlan(snapshot.plan.id);
	} else if (modalMode.value === "edit" && modalTargetPlanId.value !== null) {
		await updatePlanCore(modalTargetPlanId.value, payload as PlanCoreInput);
		modalOpen.value = false;
	} else if (modalMode.value === "duplicate" && modalTargetPlanId.value !== null) {
		const { newName } = payload as { newName: string };
		const snapshot = await duplicatePlan(modalTargetPlanId.value, newName);
		modalOpen.value = false;
		if (snapshot) goToPlan(snapshot.plan.id);
	}
}

const deleteTarget = ref<PlanSummary | null>(null);

async function confirmDelete(): Promise<void> {
	if (!deleteTarget.value) return;
	await deletePlan(deleteTarget.value.id);
	deleteTarget.value = null;
}

const monthFormatter = new Intl.DateTimeFormat("pl-PL", { month: "short", year: "numeric" });
function formatMonth(month: string): string {
	const [year, monthNum] = month.split("-").map(Number);
	return monthFormatter.format(new Date(year, monthNum - 1, 1));
}
</script>

<template>
	<div class="mx-auto max-w-[1180px] px-8 pb-20 pt-8">
		<div class="mb-7 flex items-center justify-between gap-4">
			<h1 class="font-display text-3xl font-bold text-ink">{{ t("planList.title") }}</h1>
			<div class="flex items-center gap-3">
				<button
					type="button"
					class="rounded-control px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-neutralSoft"
					@click="checkForUpdates"
				>
					{{ t("updates.check") }}
				</button>
				<button
					class="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-accent hover:bg-accent-hover"
					@click="openCreateModal"
				>
					<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
						<path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" />
					</svg>
					{{ t("planList.newPlan") }}
				</button>
			</div>
		</div>

		<p
			v-if="planStore.plans.length === 0 && !planStore.loading"
			class="rounded-card bg-surface p-10 text-center text-ink-subtle shadow-card"
		>
			{{ t("planList.empty") }}
		</p>

		<div class="grid gap-6 sm:grid-cols-2">
			<div v-for="plan in planStore.plans" :key="plan.id" class="rounded-card bg-surface p-6 shadow-card">
				<div class="mb-1.5 flex items-start justify-between gap-3">
					<h2 class="font-display text-xl font-bold text-ink">{{ plan.name }}</h2>
					<Tag v-if="plan.hasRisk" tone="danger" :title="t('planList.risk')">⚠ {{ t("table.tagNegative") }}</Tag>
				</div>
				<p class="mb-4 text-sm text-ink-subtle">
					{{ formatMonth(plan.startMonth) }} – {{ formatMonth(plan.endMonth) }}
				</p>
				<dl class="mb-5 space-y-1.5 text-sm">
					<div class="flex justify-between gap-3">
						<dt class="text-ink-subtle">{{ t("planList.finalForecast") }}</dt>
						<dd class="tabular-nums">{{ formatMoney(plan.finalCumulativeForecast, "pl-PL") }}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class="text-ink-subtle">{{ t("planList.finalEffective") }}</dt>
						<dd
							class="font-semibold tabular-nums"
							:class="plan.finalCumulativeEffective.amountMinor < 0 ? 'text-danger' : 'text-accent'"
						>
							{{ formatMoney(plan.finalCumulativeEffective, "pl-PL") }}
						</dd>
					</div>
				</dl>
				<div class="flex flex-wrap gap-2 text-sm">
					<button
						class="rounded-control bg-accent px-3.5 py-2 font-semibold text-white hover:bg-accent-hover"
						@click="goToPlan(plan.id)"
					>
						{{ t("planList.open") }}
					</button>
					<button
						class="rounded-control border border-edge px-3.5 py-2 font-semibold text-ink-muted hover:bg-neutralSoft"
						@click="openEditModal(plan)"
					>
						{{ t("common.edit") }}
					</button>
					<button
						class="rounded-control border border-edge px-3.5 py-2 font-semibold text-ink-muted hover:bg-neutralSoft"
						@click="openDuplicateModal(plan)"
					>
						{{ t("planList.duplicate") }}
					</button>
					<button
						class="rounded-control border border-danger/30 px-3.5 py-2 font-semibold text-danger hover:bg-danger-soft"
						@click="deleteTarget = plan"
					>
						{{ t("common.delete") }}
					</button>
				</div>
			</div>
		</div>

		<PlanFormModal
			:open="modalOpen"
			:mode="modalMode"
			:initial="modalInitial"
			@close="modalOpen = false"
			@submit="onModalSubmit"
		/>

		<div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
			<div class="w-full max-w-sm rounded-card bg-surface p-6 shadow-xl">
				<h2 class="mb-2 font-display text-lg font-bold text-ink">{{ t("planList.deleteConfirmTitle") }}</h2>
				<p class="mb-5 text-sm text-ink-muted">{{ t("planList.deleteConfirmBody") }}</p>
				<div class="flex justify-end gap-3">
					<button
						class="rounded-control px-3.5 py-2 text-sm font-semibold text-ink-muted hover:bg-neutralSoft"
						@click="deleteTarget = null"
					>
						{{ t("common.cancel") }}
					</button>
					<button
						class="rounded-control bg-danger px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90"
						@click="confirmDelete"
					>
						{{ t("common.delete") }}
					</button>
				</div>
			</div>
		</div>
	</div>
</template>
