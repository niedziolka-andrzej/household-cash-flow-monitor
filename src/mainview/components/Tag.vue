<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
	tone?: "neutral" | "accent" | "danger";
	title?: string;
}>();

const toneClasses = computed(() => {
	switch (props.tone ?? "neutral") {
		case "accent":
			return "bg-accent-soft text-accent";
		case "danger":
			return "bg-danger-soft text-danger";
		default:
			return "bg-neutralSoft text-ink-muted";
	}
});
</script>

<template>
	<span
		class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
		:class="toneClasses"
		:title="title"
	>
		<slot />
	</span>
</template>
