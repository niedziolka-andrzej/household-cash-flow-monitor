<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { formatMoney, sameAmount, type Money } from "../../shared/money";
import MoneyInput from "./MoneyInput.vue";

/**
 * One editable figure in the monthly table. Collapsed by default — an amount plus a small
 * pill affordance — so the table reads as numbers rather than a wall of input boxes; it
 * expands into a MoneyInput only while being edited. Once a value is stored the pill flips
 * to "✓ Wykonano" (or "Korekta"), which is what makes it scannable which months are settled.
 */
const props = defineProps<{
	/** The stored actual/override. null = nothing entered, engine falls back to `fallback`. */
	value: Money | null;
	/** What the engine uses when `value` is null (forecast, or the computed balance). */
	fallback: Money;
	currency: string;
	/** Pill label when nothing is stored yet, e.g. "+ Wykonanie". */
	addLabel: string;
	/** Pill label when a value is stored, e.g. "✓ Wykonano". */
	setLabel: string;
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
	if (!sameAmount(props.value, parsed)) emit("update", parsed);
}

function clear(): void {
	editing.value = false;
	if (props.value !== null) emit("update", null);
}
</script>

<template>
	<div class="flex flex-col items-end gap-1.5">
		<MoneyInput
			v-if="editing"
			ref="inputRef"
			:model-value="value"
			:currency="currency"
			:placeholder="formatMoney(fallback, 'pl-PL')"
			@commit="onCommit"
		/>
		<template v-else>
			<span v-if="value !== null" class="tabular-nums font-semibold text-ink">
				{{ formatMoney(value, "pl-PL") }}
			</span>
			<span v-else class="tabular-nums text-ink">{{ formatMoney(fallback, "pl-PL") }}</span>
			<span v-if="value !== null" class="text-[10px] text-ink-faint tabular-nums">
				{{ t("table.forecastPrefix") }} {{ formatMoney(fallback, "pl-PL") }}
			</span>
			<button
				type="button"
				class="rounded-full px-2.5 py-1 text-[11px] font-semibold"
				:class="value !== null ? 'bg-accent-soft text-accent' : 'bg-neutralSoft text-ink-muted hover:bg-accent-soft hover:text-accent'"
				:disabled="disabled"
				@click="startEditing"
			>
				{{ value !== null ? setLabel : addLabel }}
			</button>
			<button
				v-if="value !== null && !disabled"
				type="button"
				class="text-[10px] text-ink-faint hover:text-danger hover:underline"
				@click="clear"
			>
				{{ t("table.clearValue") }}
			</button>
		</template>
	</div>
</template>
