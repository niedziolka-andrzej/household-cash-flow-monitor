<script setup lang="ts">
import { computed } from "vue";
import { route } from "./store/navigation";
import PlanListView from "./views/PlanListView.vue";
import PlanView from "./views/PlanView.vue";

const isPlanView = computed(() => route.value.view === "plan");
</script>

<template>
	<div class="min-h-screen bg-gray-50 text-gray-900">
		<PlanView v-if="isPlanView" />
		<PlanListView v-else />
	</div>
</template>
