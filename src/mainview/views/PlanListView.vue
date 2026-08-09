<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { money } from "../../shared/money";
import type { PlanCoreInput, PlanSummary } from "../../shared/types";
import MoneyCell from "../components/MoneyCell.vue";
import PlanFormModal, { type PlanFormInitial } from "../components/PlanFormModal.vue";
import RiskBadge from "../components/RiskBadge.vue";
import { goToPlan } from "../store/navigation";
import { createPlan, deletePlan, duplicatePlan, loadPlans, openPlan, planStore, updatePlanCore } from "../store/planStore";

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
	// Fetch the full plan (PlanSummary has no openingBalance) so the form is
	// seeded with the real value instead of a placeholder.
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
		openingBalance: money(0, summary.currency), // not shown/sent for duplicate — server copies the real value
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
	<div class="mx-auto max-w-4xl p-6">
		<div class="mb-6 flex items-center justify-between">
			<h1 class="text-2xl font-semibold text-gray-900">{{ t("planList.title") }}</h1>
			<button
				class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
				@click="openCreateModal"
			>
				+ {{ t("planList.newPlan") }}
			</button>
		</div>

		<p v-if="planStore.plans.length === 0 && !planStore.loading" class="rounded border border-dashed border-gray-300 p-8 text-center text-gray-500">
			{{ t("planList.empty") }}
		</p>

		<div class="grid gap-4 sm:grid-cols-2">
			<div
				v-for="plan in planStore.plans"
				:key="plan.id"
				class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
			>
				<div class="mb-2 flex items-start justify-between gap-2">
					<h2 class="text-lg font-medium text-gray-900">{{ plan.name }}</h2>
					<RiskBadge v-if="plan.hasRisk" :label="t('planList.risk')" />
				</div>
				<p class="mb-3 text-sm text-gray-500">
					{{ t("planList.range") }}: {{ formatMonth(plan.startMonth) }} – {{ formatMonth(plan.endMonth) }}
				</p>
				<dl class="mb-4 space-y-1 text-sm">
					<div class="flex justify-between">
						<dt class="text-gray-500">{{ t("planList.finalForecast") }}</dt>
						<dd><MoneyCell :value="plan.finalCumulativeForecast" /></dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-gray-500">{{ t("planList.finalEffective") }}</dt>
						<dd><MoneyCell :value="plan.finalCumulativeEffective" variant="auto" /></dd>
					</div>
				</dl>
				<div class="flex flex-wrap gap-2 text-sm">
					<button class="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700" @click="goToPlan(plan.id)">
						{{ t("planList.open") }}
					</button>
					<button class="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50" @click="openEditModal(plan)">
						{{ t("common.edit") }}
					</button>
					<button class="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50" @click="openDuplicateModal(plan)">
						{{ t("planList.duplicate") }}
					</button>
					<button
						class="rounded border border-red-300 px-3 py-1 text-red-600 hover:bg-red-50"
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

		<div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
			<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
				<h2 class="mb-2 text-lg font-semibold text-gray-900">{{ t("planList.deleteConfirmTitle") }}</h2>
				<p class="mb-4 text-sm text-gray-600">{{ t("planList.deleteConfirmBody") }}</p>
				<div class="flex justify-end gap-2">
					<button class="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100" @click="deleteTarget = null">
						{{ t("common.cancel") }}
					</button>
					<button
						class="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
						@click="confirmDelete"
					>
						{{ t("common.delete") }}
					</button>
				</div>
			</div>
		</div>
	</div>
</template>
