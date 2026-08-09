<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { isValidMonth, parseMonthInput } from "../../shared/months";

/** Month counterpart of DateInput: a paste-tolerant text field in RRRR-MM order (accepts
 * "08.2026", or a full pasted date whose month it keeps) plus a native month picker
 * behind the calendar button. See DateInput for the reasoning. */
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
const pickerEl = ref<HTMLInputElement | null>(null);

watch(
	() => props.modelValue,
	(value) => {
		if (!focused.value) {
			text.value = value;
			invalid.value = false;
		}
	},
);

const pickerValue = computed(() => {
	const parsed = parseMonthInput(text.value);
	return parsed !== null && isValidMonth(parsed) ? parsed : "";
});

function commitValue(value: string): void {
	invalid.value = false;
	text.value = value;
	emit("update:modelValue", value);
	emit("commit", value);
}

function onBlur(): void {
	focused.value = false;
	const parsed = parseMonthInput(text.value);
	if (parsed === null && text.value.trim() !== "") {
		invalid.value = true;
		return;
	}
	commitValue(parsed ?? "");
}

function onEnter(event: KeyboardEvent): void {
	(event.target as HTMLInputElement).blur();
}

function openPicker(): void {
	const picker = pickerEl.value;
	if (!picker || props.disabled) return;
	try {
		picker.showPicker();
	} catch {
		// Unsupported or lacking user activation — the text field still works on its own.
	}
}

function onPickerChange(event: Event): void {
	const picked = (event.target as HTMLInputElement).value; // 'YYYY-MM' from a native month input
	if (picked !== "") commitValue(picked);
}

defineExpose({ focus: () => inputEl.value?.focus() });
</script>

<template>
	<span class="relative inline-flex items-stretch">
		<input
			ref="inputEl"
			v-model="text"
			type="text"
			inputmode="numeric"
			autocomplete="off"
			spellcheck="false"
			class="w-[6.5rem] rounded-l-lg border px-2 py-1.5 tabular-nums focus:outline-none disabled:bg-neutralSoft disabled:text-ink-faint"
			:class="invalid ? 'border-danger bg-danger-soft text-danger' : 'border-edgeStrong focus:border-accent'"
			:placeholder="placeholder ?? 'RRRR-MM'"
			:disabled="disabled"
			:title="invalid ? 'Nieprawidłowy miesiąc — użyj formatu RRRR-MM' : undefined"
			@focus="focused = true"
			@blur="onBlur"
			@keydown.enter="onEnter"
		/>
		<button
			type="button"
			tabindex="-1"
			class="rounded-r-lg border border-l-0 border-edgeStrong px-2 text-ink-faint hover:bg-neutralSoft hover:text-accent disabled:bg-neutralSoft"
			:disabled="disabled"
			title="Wybierz miesiąc"
			@click="openPicker"
		>
			<svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4" aria-hidden="true">
				<path
					fill-rule="evenodd"
					d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm10 6H4v7h12V8Z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>
		<input
			ref="pickerEl"
			type="month"
			tabindex="-1"
			aria-hidden="true"
			class="pointer-events-none absolute bottom-0 right-2 h-px w-px opacity-0"
			:value="pickerValue"
			@change="onPickerChange"
		/>
	</span>
</template>
