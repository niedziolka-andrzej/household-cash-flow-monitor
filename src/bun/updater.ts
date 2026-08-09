import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Updater, Utils } from "electrobun/bun";
import { IDLE_UPDATE_STATE, type UpdateState } from "../shared/update";

/** Remembers the hash the user last dismissed an offer for, so declining doesn't turn into a
 * prompt on every launch. Only ever silences that one build — a newer release has a different
 * hash and prompts again. Lives next to the database in userData. */
const declinedHashPath = join(Utils.paths.userData, "update-declined");

let state: UpdateState = IDLE_UPDATE_STATE;
let publish: (next: UpdateState) => void = () => {};

/** The hash of the build currently being offered, so a dismissal records the right one. */
let offeredHash = "";
/** Set from Updater's status stream; download failures surface only there. */
let lastError = "";

function readDeclinedHash(): string {
	try {
		return existsSync(declinedHashPath)
			? readFileSync(declinedHashPath, "utf8").trim()
			: "";
	} catch {
		return "";
	}
}

function rememberDeclinedHash(hash: string) {
	try {
		writeFileSync(declinedHashPath, hash, "utf8");
	} catch (error) {
		// Losing the marker only costs us an extra prompt next launch — never fatal.
		console.log(`Nie udało się zapisać odłożonej aktualizacji: ${error}`);
	}
}

function setState(next: UpdateState) {
	state = next;
	publish(state);
}

export function getUpdateState(): UpdateState {
	return state;
}

/**
 * Wires the state publisher (the RPC bridge to the webview) and subscribes to Updater's
 * status stream. Called once, from createCashflowRpc.
 */
export function initUpdater(publisher: (next: UpdateState) => void): void {
	publish = publisher;

	// Updater keeps a single callback slot, so this is registered once rather than per
	// download. Progress text is only forwarded while a download is actually in flight.
	Updater.onStatusChange((entry) => {
		console.log(`[updater] ${entry.status}: ${entry.message}`);
		if (entry.status === "error") {
			lastError = entry.message;
			return;
		}
		if (state.phase === "downloading") {
			setState({ ...state, detail: entry.message });
		}
	});
}

/** True while a cycle is running and a second one would collide with it. */
function isBusy(): boolean {
	return (
		state.phase === "checking" ||
		state.phase === "downloading" ||
		state.phase === "applying"
	);
}

/**
 * Asks GitHub Releases whether a newer build exists and parks the result in `state` for the
 * webview to act on. Never downloads anything — that needs consent, which arrives separately
 * as `acceptUpdate`.
 *
 * Updates are keyed on the build hash rather than the version string: that's what
 * Electrobun's updater compares, so any republished build counts as an update.
 */
export async function runUpdateCheck({
	userInitiated,
}: { userInitiated: boolean }): Promise<void> {
	if (isBusy()) {
		console.log("Sprawdzanie aktualizacji już trwa.");
		return;
	}

	setState({ phase: "checking", userInitiated });
	const info = await Updater.checkForUpdate();

	// Being offline, or hitting a release whose assets aren't published yet, lands here.
	// The webview shows it only for a user-initiated check.
	if (info.error) {
		console.log(`Sprawdzanie aktualizacji nieudane: ${info.error}`);
		setState({ phase: "error", userInitiated, detail: info.error });
		return;
	}

	if (!info.updateAvailable) {
		setState({
			phase: "upToDate",
			userInitiated,
			version: await Updater.localInfo.version(),
		});
		return;
	}

	// An explicit check overrides an earlier "Później" — having asked, the user gets the
	// offer again even for a build they previously deferred.
	if (!userInitiated && info.hash === readDeclinedHash()) {
		console.log(
			`Aktualizacja ${info.hash.slice(0, 8)} została wcześniej odłożona.`,
		);
		setState(IDLE_UPDATE_STATE);
		return;
	}

	offeredHash = info.hash;
	setState({ phase: "available", userInitiated, version: info.version });
}

/** Downloads the offered build and restarts into it. Only valid on an outstanding offer. */
export async function acceptUpdate(): Promise<void> {
	if (state.phase !== "available") {
		return;
	}
	const { userInitiated } = state;

	lastError = "";
	setState({ phase: "downloading", userInitiated });
	await Updater.downloadUpdate();

	// downloadUpdate resolves void and reports failure only through status events;
	// applyUpdate would silently no-op on a failed download, so check before calling it.
	if (lastError) {
		setState({ phase: "error", userInitiated, detail: lastError });
		return;
	}

	setState({ phase: "applying", userInitiated });
	await Updater.applyUpdate(); // relaunches the app, so this does not return
}

/**
 * Closes the current notice. Dismissing an *offer* also records the hash, which is what
 * keeps the startup check quiet about that build on later launches.
 */
export function dismissUpdate(): void {
	if (state.phase === "available" && offeredHash) {
		rememberDeclinedHash(offeredHash);
		console.log("Użytkownik odłożył aktualizację.");
	}
	setState(IDLE_UPDATE_STATE);
}
