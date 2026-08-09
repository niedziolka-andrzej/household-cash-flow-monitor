<script setup lang="ts">
import { ref, watch } from "vue";
import { parseDateInput } from "../../shared/dates";

/**
 * A plain text date field in ISO order (RRRR-MM-DD) rather than `<input type="date">`:
 * the native picker renders in the OS locale (DD.MM.RRRR here), can't be pasted into
 * reliably, and fights keyboard-only entry. Anything `parseDateInput` understands —
 * including a spreadsheet paste like "09.08.2026" or "2026-08-09 00:00:00" — is
 * normalized to ISO on blur.
 */
const props = defineProps<{
	modelValue: string;
	placeholder?: string;
	disabled?: boolean;
}>();
const emit = defineEmits<{
	"update:modelValue": [value: string];
	/** Fires after a successful normalize+commit, for callers that persist on change. */
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
	const parsed = parseDateInput(text.value);
	if (parsed === null && text.value.trim() !== "") {
		// Keep the raw text on screen so the user can fix it instead of losing what they typed.
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
		class="w-[7.5rem] rounded border px-2 py-1 tabular-nums focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
		:class="invalid ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-300 focus:border-blue-500'"
		:placeholder="placeholder ?? 'RRRR-MM-DD'"
		:disabled="disabled"
		:title="invalid ? 'Nieprawidłowa data — użyj formatu RRRR-MM-DD' : undefined"
		@focus="focused = true"
		@blur="onBlur"
		@keydown.enter="onEnter"
	/>
</template>
