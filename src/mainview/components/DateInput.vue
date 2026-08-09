<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { isValidIsoDate, parseDateInput } from "../../shared/dates";

/**
 * Date field that is both typeable/pasteable and pickable.
 *
 * The visible control is a plain text input in ISO order (RRRR-MM-DD) rather than a bare
 * `<input type="date">`: the native field renders in the OS locale (DD.MM.RRRR here) and
 * can't be pasted into reliably. Anything `parseDateInput` understands — including a
 * spreadsheet paste like "09.08.2026" or "2026-08-09 00:00:00" — is normalized on blur.
 *
 * The calendar button opens the real native picker via a hidden `<input type="date">` and
 * `showPicker()`, so pointer users keep the calendar without giving up paste or keyboard
 * entry. The hidden input carries `tabindex="-1"` so Tab keeps moving between real fields.
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

/** The native picker only accepts a valid ISO value; anything else leaves it empty
 * (it then opens on the current month, which is the sane fallback). */
const pickerValue = computed(() => {
	const parsed = parseDateInput(text.value);
	return parsed !== null && isValidIsoDate(parsed) ? parsed : "";
});

function commitValue(value: string): void {
	invalid.value = false;
	text.value = value;
	emit("update:modelValue", value);
	emit("commit", value);
}

function onBlur(): void {
	focused.value = false;
	const parsed = parseDateInput(text.value);
	if (parsed === null && text.value.trim() !== "") {
		// Keep the raw text on screen so the user can fix it instead of losing what they typed.
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
		// showPicker throws without user activation or where unsupported — the text field
		// remains fully usable, so there is nothing to recover from.
	}
}

function onPickerChange(event: Event): void {
	const picked = (event.target as HTMLInputElement).value; // always ISO from a native date input
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
			class="w-[7.5rem] rounded-l-lg border px-2 py-1.5 tabular-nums focus:outline-none disabled:bg-neutralSoft disabled:text-ink-faint"
			:class="invalid ? 'border-danger bg-danger-soft text-danger' : 'border-edgeStrong focus:border-accent'"
			:placeholder="placeholder ?? 'RRRR-MM-DD'"
			:disabled="disabled"
			:title="invalid ? 'Nieprawidłowa data — użyj formatu RRRR-MM-DD' : undefined"
			@focus="focused = true"
			@blur="onBlur"
			@keydown.enter="onEnter"
		/>
		<button
			type="button"
			tabindex="-1"
			class="rounded-r-lg border border-l-0 border-edgeStrong px-2 text-ink-faint hover:bg-neutralSoft hover:text-accent disabled:bg-neutralSoft"
			:disabled="disabled"
			title="Wybierz z kalendarza"
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
			type="date"
			tabindex="-1"
			aria-hidden="true"
			class="pointer-events-none absolute bottom-0 right-2 h-px w-px opacity-0"
			:value="pickerValue"
			@change="onPickerChange"
		/>
	</span>
</template>
