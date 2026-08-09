<script setup lang="ts">
import { computed } from "vue";
import { formatMoney, type Money } from "../../shared/money";

const props = defineProps<{
	value: Money;
	/** "auto" colors by sign; "positive"/"negative" force a color; "default" is plain. */
	variant?: "auto" | "positive" | "negative" | "default";
	muted?: boolean;
}>();

const resolvedVariant = computed(() => {
	if (props.variant === "auto") {
		if (props.value.amountMinor > 0) return "positive";
		if (props.value.amountMinor < 0) return "negative";
		return "default";
	}
	return props.variant ?? "default";
});

const text = computed(() => formatMoney(props.value, "pl-PL"));
</script>

<template>
	<span
		class="tabular-nums"
		:class="{
			'text-emerald-600': resolvedVariant === 'positive',
			'text-red-600': resolvedVariant === 'negative',
			'text-gray-400': muted,
		}"
		>{{ text }}</span
	>
</template>
