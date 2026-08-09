<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import { money, type Money } from "../../shared/money";
import type { PlanCoreInput } from "../../shared/types";
import MoneyInput from "./MoneyInput.vue";
import MonthPicker from "./MonthPicker.vue";

const DEFAULT_CURRENCY = "PLN";

/** Structural subset of PlanCore this modal actually needs — lets callers that only
 * have a PlanSummary (no openingBalance) build a stub for "duplicate" mode, where
 * those fields are collected but never shown or sent (the copy inherits them server-side). */
export interface PlanFormInitial {
	name: string;
	startMonth: string;
	endMonth: string;
	currency: string;
	openingBalance: Money;
}

const props = defineProps<{
	open: boolean;
	mode: "create" | "edit" | "duplicate";
	initial?: PlanFormInitial | null;
}>();
const emit = defineEmits<{
	close: [];
	submit: [payload: PlanCoreInput | { newName: string }];
}>();

const { t } = useI18n();

const form = reactive({
	name: "",
	startMonth: "",
	endMonth: "",
	openingBalance: null as Money | null,
	currency: DEFAULT_CURRENCY,
});

function currentMonth(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function resetForm(): void {
	if (props.mode === "create" || !props.initial) {
		form.name = "";
		form.startMonth = currentMonth();
		form.endMonth = currentMonth();
		form.openingBalance = money(0, DEFAULT_CURRENCY);
		form.currency = DEFAULT_CURRENCY;
		return;
	}
	form.name = props.mode === "duplicate" ? `${props.initial.name} (kopia)` : props.initial.name;
	form.startMonth = props.initial.startMonth;
	form.endMonth = props.initial.endMonth;
	form.openingBalance = props.initial.openingBalance;
	form.currency = props.initial.currency;
}

watch(
	() => props.open,
	(isOpen) => {
		if (isOpen) resetForm();
	},
	{ immediate: true },
);

const title = computed(() => {
	if (props.mode === "create") return t("planForm.createTitle");
	if (props.mode === "duplicate") return t("planForm.duplicateTitle");
	return t("planForm.editTitle");
});

function onSubmit(): void {
	if (props.mode === "duplicate") {
		emit("submit", { newName: form.name });
		return;
	}
	emit("submit", {
		name: form.name,
		startMonth: form.startMonth,
		endMonth: form.endMonth,
		currency: form.currency,
		openingBalance: form.openingBalance ?? money(0, form.currency),
	});
}
</script>

<template>
	<div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
		<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">{{ title }}</h2>

			<form class="space-y-4" @submit.prevent="onSubmit">
				<div>
					<label class="mb-1 block text-sm font-medium text-gray-700">{{ t("planForm.name") }}</label>
					<input
						v-model="form.name"
						type="text"
						required
						class="w-full rounded border border-gray-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
						:placeholder="mode === 'duplicate' ? t('planForm.duplicateNamePlaceholder') : t('planForm.namePlaceholder')"
					/>
				</div>

				<template v-if="mode !== 'duplicate'">
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">{{ t("planForm.startMonth") }}</label>
							<MonthPicker v-model="form.startMonth" />
						</div>
						<div>
							<label class="mb-1 block text-sm font-medium text-gray-700">{{ t("planForm.endMonth") }}</label>
							<MonthPicker v-model="form.endMonth" />
						</div>
					</div>
					<div>
						<label class="mb-1 block text-sm font-medium text-gray-700">{{ t("planForm.openingBalance") }}</label>
						<MoneyInput v-model="form.openingBalance" :currency="form.currency" />
					</div>
				</template>

				<div class="flex justify-end gap-2 pt-2">
					<button
						type="button"
						class="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
						@click="emit('close')"
					>
						{{ t("common.cancel") }}
					</button>
					<button type="submit" class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
						{{ t("common.save") }}
					</button>
				</div>
			</form>
		</div>
	</div>
</template>
