<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
	tone?: "neutral" | "info" | "success" | "warn" | "danger";
	title?: string;
}>();

const toneClasses = computed(() => {
	switch (props.tone ?? "neutral") {
		case "info":
			return "bg-blue-50 text-blue-700 ring-blue-200";
		case "success":
			return "bg-emerald-50 text-emerald-700 ring-emerald-200";
		case "warn":
			return "bg-amber-50 text-amber-700 ring-amber-200";
		case "danger":
			return "bg-red-50 text-red-700 ring-red-200";
		default:
			return "bg-gray-100 text-gray-500 ring-gray-200";
	}
});
</script>

<template>
	<span
		class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset"
		:class="toneClasses"
		:title="title"
	>
		<slot />
	</span>
</template>
