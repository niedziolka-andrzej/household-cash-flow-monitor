<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { formatMoney, type Money } from "../../shared/money";
import MoneyInput from "./MoneyInput.vue";
import Tag from "./Tag.vue";

/**
 * One editable figure in the monthly table. Collapsed by default — an amount plus a small
 * "+ Wykonanie" affordance — so the table reads as numbers rather than a wall of input
 * boxes; it expands into a MoneyInput only while being edited. Once a value is stored the
 * tag flips to "✓ Wykonano" (or "Korekta"), which is what makes it scannable which months
 * are already settled.
 */
const props = defineProps<{
	/** The stored actual/override. null = nothing entered, engine falls back to `fallback`. */
	value: Money | null;
	/** What the engine uses when `value` is null (forecast, or the computed balance). */
	fallback: Money;
	currency: string;
	/** Tag label when nothing is stored yet, e.g. "+ Wykonanie". */
	addLabel: string;
	/** Tag label when a value is stored, e.g. "✓ Wykonano". */
	setLabel: string;
	setTone?: "info" | "warn" | "success";
	disabled?: boolean;
}>();
const emit = defineEmits<{ update: [value: Money | null] }>();

const { t } = useI18n();

const editing = ref(false);
const inputRef = ref<InstanceType<typeof MoneyInput> | null>(null);

async function startEditing(): Promise<void> {
	if (props.disabled) return;
	editing.value = true;
	await nextTick();
	inputRef.value?.focus();
}

/** MoneyInput's `commit` fires on blur with the parsed amount — only send an RPC when the
 * value actually changed, so merely tabbing through a cell doesn't trigger a save. */
function onCommit(parsed: Money | null): void {
	editing.value = false;
	const before = props.value?.amountMinor ?? null;
	const after = parsed?.amountMinor ?? null;
	if (before !== after) emit("update", parsed);
}

function clear(): void {
	editing.value = false;
	if (props.value !== null) emit("update", null);
}
</script>

<template>
	<div class="flex flex-col items-end gap-1">
		<MoneyInput
			v-if="editing"
			ref="inputRef"
			:model-value="value"
			:currency="currency"
			:placeholder="formatMoney(fallback, 'pl-PL')"
			@commit="onCommit"
		/>
		<template v-else>
			<button
				type="button"
				class="flex flex-col items-end gap-1 rounded px-1 py-0.5 text-right hover:bg-blue-50/60 disabled:cursor-default disabled:hover:bg-transparent"
				:disabled="disabled"
				@click="startEditing"
			>
				<span class="tabular-nums" :class="value !== null ? 'font-medium text-gray-900' : 'text-gray-600'">
					{{ formatMoney(value ?? fallback, "pl-PL") }}
				</span>
				<span v-if="value !== null" class="text-[10px] text-gray-400">
					{{ t("table.forecastPrefix") }} {{ formatMoney(fallback, "pl-PL") }}
				</span>
				<Tag v-if="value !== null" :tone="setTone ?? 'info'">{{ setLabel }}</Tag>
				<span v-else class="text-[10px] font-medium text-blue-600 hover:underline">{{ addLabel }}</span>
			</button>
			<button
				v-if="value !== null && !disabled"
				type="button"
				class="text-[10px] text-gray-400 hover:text-red-600 hover:underline"
				@click="clear"
			>
				{{ t("table.clearValue") }}
			</button>
		</template>
	</div>
</template>
