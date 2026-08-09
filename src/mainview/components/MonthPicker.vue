<script setup lang="ts">
defineProps<{ modelValue: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

function onInput(event: Event): void {
	emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
	<input
		type="month"
		class="rounded border border-gray-300 px-2 py-1 focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
		:value="modelValue"
		:disabled="disabled"
		@input="onInput"
	/>
</template>
