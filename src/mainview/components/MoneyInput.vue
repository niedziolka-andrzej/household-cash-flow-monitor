<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { type Money, parseAmountInput } from "../../shared/money";

const props = defineProps<{
	modelValue: Money | null;
	currency: string;
	placeholder?: string;
	disabled?: boolean;
}>();
const emit = defineEmits<{
	"update:modelValue": [value: Money | null];
	/** Fires on blur with the parsed value, right after `update:modelValue`. Lets a parent
	 * react to "the user finished with this field" without depending on v-model timing. */
	commit: [value: Money | null];
}>();

function toDisplayText(value: Money | null): string {
	if (value === null) return "";
	return (value.amountMinor / 100).toLocaleString("pl-PL", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

const text = ref(toDisplayText(props.modelValue));
const focused = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

// Only resync from the outside while the user isn't actively typing, so an
// incoming snapshot refresh never clobbers a half-typed value.
watch(
	() => props.modelValue,
	(value) => {
		if (!focused.value) text.value = toDisplayText(value);
	},
);

function countDigits(s: string): number {
	return (s.match(/\d/g) ?? []).length;
}

/**
 * Groups the integer part of `raw` with spaces every 3 digits (Polish thousands
 * separator) — live, on every keystroke — leaving the decimal separator and fraction
 * untouched. Returns the caret position counted in *digits before it*, so inserting or
 * removing a grouping space never makes the caret jump away from where the user is
 * actually typing.
 */
function groupThousands(raw: string, caretPos: number): { formatted: string; caret: number } {
	const digitsBeforeCaret = countDigits(raw.slice(0, caretPos));

	const decimalMatch = /[.,]/.exec(raw);
	const splitAt = decimalMatch ? decimalMatch.index : raw.length;
	let intPart = raw.slice(0, splitAt);
	const rest = raw.slice(splitAt); // decimal separator + fraction, kept exactly as typed

	const negative = intPart.startsWith("-");
	if (negative) intPart = intPart.slice(1);
	intPart = intPart.replace(/\D/g, "");

	const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
	const formatted = (negative ? "-" : "") + grouped + rest;

	if (digitsBeforeCaret === 0) {
		return { formatted, caret: negative ? 1 : 0 };
	}
	let seen = 0;
	for (let i = 0; i < formatted.length; i++) {
		if (/\d/.test(formatted[i])) {
			seen++;
			if (seen === digitsBeforeCaret) return { formatted, caret: i + 1 };
		}
	}
	return { formatted, caret: formatted.length };
}

function onInput(): void {
	const el = inputEl.value;
	if (!el) return;
	const caretPos = el.selectionStart ?? el.value.length;
	const { formatted, caret } = groupThousands(el.value, caretPos);
	text.value = formatted;
	nextTick(() => {
		el.setSelectionRange(caret, caret);
	});
}

function onFocus(): void {
	focused.value = true;
}

function onBlur(): void {
	focused.value = false;
	const parsed = parseAmountInput(text.value, props.currency);
	emit("update:modelValue", parsed);
	text.value = toDisplayText(parsed);
	emit("commit", parsed);
}

function onEnter(event: KeyboardEvent): void {
	(event.target as HTMLInputElement).blur();
}

defineExpose({
	focus: () => inputEl.value?.focus(),
});
</script>

<template>
	<input
		ref="inputEl"
		:value="text"
		type="text"
		inputmode="decimal"
		class="w-full rounded border border-gray-300 px-2 py-1 text-right tabular-nums focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
		:placeholder="placeholder"
		:disabled="disabled"
		@input="onInput"
		@focus="onFocus"
		@blur="onBlur"
		@keydown.enter="onEnter"
	/>
</template>
