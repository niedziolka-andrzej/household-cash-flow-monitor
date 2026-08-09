<script setup lang="ts">
import { ref, watch } from "vue";
import { parseMonthInput } from "../../shared/months";

/** Month counterpart of DateInput: text field in RRRR-MM order, paste-tolerant
 * (accepts "08.2026" and even a full pasted date, keeping its month). */
const props = defineProps<{
	modelValue: string;
	placeholder?: string;
	disabled?: boolean;
}>();
const emit = defineEmits<{
	"update:modelValue": [value: string];
	commit: [value: string];
}>();

const text = ref(props.modelValue);
const focused = ref(false);
const invalid = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

watch(
	() => props.modelValue,
	(value) => {
		if (!focused.value) {
			text.value = value;
			invalid.value = false;
		}
	},
);

function onBlur(): void {
	focused.value = false;
	const parsed = parseMonthInput(text.value);
	if (parsed === null && text.value.trim() !== "") {
		invalid.value = true;
		return;
	}
	invalid.value = false;
	text.value = parsed ?? "";
	emit("update:modelValue", text.value);
	emit("commit", text.value);
}

function onEnter(event: KeyboardEvent): void {
	(event.target as HTMLInputElement).blur();
}

defineExpose({ focus: () => inputEl.value?.focus() });
</script>

<template>
	<input
		ref="inputEl"
		v-model="text"
		type="text"
		inputmode="numeric"
		autocomplete="off"
		spellcheck="false"
		class="w-[6.5rem] rounded border px-2 py-1 tabular-nums focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
		:class="invalid ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-300 focus:border-blue-500'"
		:placeholder="placeholder ?? 'RRRR-MM'"
		:disabled="disabled"
		:title="invalid ? 'Nieprawidłowy miesiąc — użyj formatu RRRR-MM' : undefined"
		@focus="focused = true"
		@blur="onBlur"
		@keydown.enter="onEnter"
	/>
</template>
