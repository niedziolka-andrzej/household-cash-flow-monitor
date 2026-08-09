import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ApplicationMenu, Updater, Utils } from "electrobun/bun";

/** Remembers the hash the user last said "Później" to, so declining doesn't turn into a
 * prompt on every single launch. Only ever silences that one build — a newer release has a
 * different hash and prompts again. Lives next to the database in userData. */
const declinedHashPath = join(Utils.paths.userData, "update-declined");

/** Guards against a second check starting while one is mid-download (menu clicked twice). */
let checkInFlight = false;

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

type CheckOptions = {
	/**
	 * A user-initiated check (menu → Sprawdź aktualizacje) reports its outcome either way and
	 * ignores an earlier "Później" — having explicitly asked, the user deserves an answer.
	 * The automatic startup check stays silent unless there's something to install.
	 */
	manual?: boolean;
};

/**
 * Checks GitHub Releases for a newer build and, with the user's consent, downloads and
 * installs it. `applyUpdate` relaunches the app, so this never returns in that branch.
 *
 * Updates are keyed on the build hash rather than the version string — that's what
 * Electrobun's updater compares — so any republished build counts as an update.
 */
export async function checkForUpdateWithConsent({
	manual = false,
}: CheckOptions = {}): Promise<void> {
	// The dev channel has no published artifacts to compare against; Updater
	// short-circuits it too, but bailing early keeps the logs quiet.
	if ((await Updater.localInfo.channel()) === "dev") {
		return;
	}

	if (checkInFlight) {
		console.log("Sprawdzanie aktualizacji już trwa.");
		return;
	}
	checkInFlight = true;

	try {
		let lastError = "";
		Updater.onStatusChange((entry) => {
			console.log(`[updater] ${entry.status}: ${entry.message}`);
			if (entry.status === "error") {
				lastError = entry.message;
			}
		});

		const info = await Updater.checkForUpdate();

		// Being offline, or hitting a release whose assets aren't published yet, is not
		// something to interrupt the user over on an automatic check — they keep running
		// the current version. A manual check has to say something, though.
		if (info.error) {
			console.log(`Sprawdzanie aktualizacji nieudane: ${info.error}`);
			if (manual) {
				await Utils.showMessageBox({
					type: "warning",
					title: "Cash Flow Monitor",
					message: "Nie udało się sprawdzić aktualizacji.",
					detail: `${info.error}\n\nSprawdź połączenie z internetem i spróbuj ponownie.`,
					buttons: ["OK"],
				});
			}
			return;
		}

		if (!info.updateAvailable) {
			if (manual) {
				await Utils.showMessageBox({
					type: "info",
					title: "Cash Flow Monitor",
					message: "Używasz najnowszej wersji.",
					detail: `Wersja ${await Updater.localInfo.version()}`,
					buttons: ["OK"],
				});
			}
			return;
		}

		if (!manual && info.hash === readDeclinedHash()) {
			console.log(
				`Aktualizacja ${info.hash.slice(0, 8)} została wcześniej odłożona.`,
			);
			return;
		}

		const { response } = await Utils.showMessageBox({
			type: "question",
			title: "Cash Flow Monitor",
			message: `Dostępna jest nowa wersja (${info.version}).`,
			detail:
				"Aktualizacja zostanie pobrana, a aplikacja uruchomi się ponownie. " +
				"Zapisz zmiany przed kontynuowaniem.",
			buttons: ["Zaktualizuj teraz", "Później"],
			defaultId: 0,
			cancelId: 1,
		});

		if (response !== 0) {
			rememberDeclinedHash(info.hash);
			console.log("Użytkownik odłożył aktualizację.");
			return;
		}

		lastError = "";
		await Updater.downloadUpdate();

		// downloadUpdate resolves void and reports failure only through status events;
		// applyUpdate would silently no-op on a failed download, so check before calling it.
		if (lastError) {
			await Utils.showMessageBox({
				type: "error",
				title: "Cash Flow Monitor",
				message: "Nie udało się pobrać aktualizacji.",
				detail: `${lastError}\n\nAplikacja będzie działać w obecnej wersji.`,
				buttons: ["OK"],
			});
			return;
		}

		await Updater.applyUpdate();
	} finally {
		checkInFlight = false;
	}
}

async function showAbout(): Promise<void> {
	const [version, hash] = await Promise.all([
		Updater.localInfo.version(),
		Updater.localInfo.hash(),
	]);
	await Utils.showMessageBox({
		type: "info",
		title: "Cash Flow Monitor",
		message: "Cash Flow Monitor",
		// The hash is what the updater actually compares, so it's the useful thing
		// to quote when diagnosing "why am I not getting the update?".
		detail: `Wersja ${version}\nKompilacja ${hash}`,
		buttons: ["OK"],
	});
}

/**
 * Installs the native "Pomoc" menu, giving the user a way to check for updates on demand —
 * otherwise declining a release leaves them waiting for the next one, and a long-running
 * session never notices releases published after launch.
 */
export function registerUpdateMenu(): void {
	ApplicationMenu.setApplicationMenu([
		{
			label: "Pomoc",
			submenu: [
				{ label: "Sprawdź aktualizacje…", action: "check-for-updates" },
				{ type: "divider" },
				{ label: "O programie", action: "about" },
			],
		},
	]);

	ApplicationMenu.on("application-menu-clicked", (event) => {
		const action = (event as { data?: { action?: string } }).data?.action;

		// Deferred off the click callback on purpose: showMessageBox is a synchronous FFI
		// call that dispatches to the OS main thread, and this handler can be invoked from
		// that same thread's message loop. Yielding first keeps it from dispatching into
		// a thread that's still busy delivering the click.
		if (action === "check-for-updates") {
			setTimeout(() => {
				checkForUpdateWithConsent({ manual: true }).catch((error) =>
					console.error("Sprawdzanie aktualizacji nie powiodło się:", error),
				);
			}, 0);
		} else if (action === "about") {
			setTimeout(() => {
				showAbout().catch((error) =>
					console.error("Nie udało się wyświetlić informacji:", error),
				);
			}, 0);
		}
	});
}
