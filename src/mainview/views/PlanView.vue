<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { goToPlanList, route, setTab } from "../store/navigation";
import { openPlan, planStore } from "../store/planStore";
import AssumptionsView from "./AssumptionsView.vue";
import MonthlyTableView from "./MonthlyTableView.vue";

const { t } = useI18n();

const planId = computed(() => (route.value.view === "plan" ? route.value.planId : null));
const tab = computed(() => (route.value.view === "plan" ? route.value.tab : "monthly"));

async function load(): Promise<void> {
	if (planId.value !== null) await openPlan(planId.value);
}
onMounted(load);
watch(planId, load);
</script>

<template>
	<div v-if="planStore.current" class="mx-auto max-w-6xl p-6">
		<div class="mb-4">
			<button class="mb-1 text-sm text-blue-600 hover:underline" @click="goToPlanList">← {{ t("common.back") }}</button>
			<h1 class="text-2xl font-semibold text-gray-900">{{ planStore.current.plan.name }}</h1>
		</div>

		<div class="mb-4 flex gap-1 border-b border-gray-200">
			<button
				class="border-b-2 px-4 py-2 text-sm font-medium"
				:class="
					tab === 'assumptions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
				"
				@click="setTab('assumptions')"
			>
				{{ t("nav.assumptions") }}
			</button>
			<button
				class="border-b-2 px-4 py-2 text-sm font-medium"
				:class="
					tab === 'monthly' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
				"
				@click="setTab('monthly')"
			>
				{{ t("nav.monthlyTable") }}
			</button>
		</div>

		<AssumptionsView v-if="tab === 'assumptions'" />
		<MonthlyTableView v-else />
	</div>
	<div v-else class="p-6 text-gray-500">{{ t("common.loading") }}</div>
</template>
