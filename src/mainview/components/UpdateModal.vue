<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
	acceptUpdate,
	dismissUpdate,
	updateInProgress,
	updateNoticeVisible,
	updateState,
} from "../store/updateStore";

const { t } = useI18n();

const phase = computed(() => updateState.value.phase);

const title = computed(() => {
	switch (phase.value) {
		case "checking":
			return t("updates.checking");
		case "available":
			return t("updates.availableTitle");
		case "downloading":
			return t("updates.downloading");
		case "applying":
			return t("updates.applying");
		case "upToDate":
			return t("updates.upToDateTitle");
		case "error":
			return t("updates.errorTitle");
		default:
			return "";
	}
});
</script>

<template>
	<div v-if="updateNoticeVisible" class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
		<div class="w-full max-w-sm rounded-card bg-surface p-6 shadow-xl">
			<h2 class="mb-2 font-display text-lg font-bold text-ink">{{ title }}</h2>

			<p v-if="phase === 'available'" class="mb-1 text-sm text-ink-muted">
				{{ t("updates.version", { version: updateState.version }) }}
			</p>
			<p v-if="phase === 'available'" class="mb-5 text-sm text-ink-muted">
				{{ t("updates.availableBody") }}
			</p>

			<p v-else-if="phase === 'upToDate'" class="mb-5 text-sm text-ink-muted">
				{{ t("updates.version", { version: updateState.version }) }}
			</p>

			<p v-else-if="phase === 'error'" class="mb-5 text-sm text-ink-muted">
				{{ t("updates.errorBody") }}
				<span v-if="updateState.detail" class="mt-2 block text-xs text-ink-subtle">{{ updateState.detail }}</span>
			</p>

			<p v-else-if="updateInProgress" class="mb-5 text-sm text-ink-muted">
				{{ t("updates.restartNotice") }}
				<span v-if="updateState.detail" class="mt-2 block text-xs text-ink-subtle">{{ updateState.detail }}</span>
			</p>

			<p v-else class="mb-5 text-sm text-ink-muted">{{ t("common.loading") }}</p>

			<!-- Nothing to cancel once the install is underway: the app restarts on its own. -->
			<div v-if="!updateInProgress && phase !== 'checking'" class="flex justify-end gap-3">
				<button
					class="rounded-control px-3.5 py-2 text-sm font-semibold text-ink-muted hover:bg-neutralSoft"
					@click="dismissUpdate"
				>
					{{ phase === "available" ? t("updates.later") : t("common.close") }}
				</button>
				<button
					v-if="phase === 'available'"
					class="rounded-control bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
					@click="acceptUpdate"
				>
					{{ t("updates.update") }}
				</button>
			</div>
		</div>
	</div>
</template>
