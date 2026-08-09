import { computed, ref } from "vue";
import { IDLE_UPDATE_STATE, type UpdateState } from "../../shared/update";
import { call, onUpdateState, sendMessage } from "../rpc/client";

/** Mirror of the bun process's updater state; the bun side is the only writer. */
export const updateState = ref<UpdateState>(IDLE_UPDATE_STATE);

onUpdateState((next) => {
	updateState.value = next;
});

/**
 * The startup check can finish before this view is listening, in which case the pushed
 * message is lost. Asking once on mount closes that gap.
 */
export async function syncUpdateState(): Promise<void> {
	try {
		updateState.value = await call("getUpdateState", {});
	} catch {
		// Purely an optimization over the pushed message — a failure changes nothing.
	}
}

/**
 * Whether the update notice should be on screen. An offer or an in-flight install always
 * shows; the "nothing to install" and failure outcomes only show when the user asked, so
 * the startup check stays silent.
 */
export const updateNoticeVisible = computed(() => {
	switch (updateState.value.phase) {
		case "available":
		case "downloading":
		case "applying":
			return true;
		case "checking":
		case "upToDate":
		case "error":
			return updateState.value.userInitiated;
		default:
			return false;
	}
});

/** True once the install is underway and there is nothing left to cancel. */
export const updateInProgress = computed(
	() =>
		updateState.value.phase === "downloading" ||
		updateState.value.phase === "applying",
);

export function checkForUpdates(): void {
	sendMessage("requestUpdateCheck", {});
}

export function acceptUpdate(): void {
	sendMessage("acceptUpdate", {});
}

export function dismissUpdate(): void {
	sendMessage("dismissUpdate", {});
}
