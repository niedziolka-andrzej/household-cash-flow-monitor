import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BrowserWindow, Updater, Utils } from "electrobun/bun";
import { createDatabase } from "./db/database";
import { createCashflowRpc } from "./rpc/handlers";
import { checkForUpdateWithConsent, registerUpdateMenu } from "./updater";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

/** Uses the Vite dev server (HMR) when it's up in dev mode, otherwise the bundled
 * views:// asset — same pattern as Electrobun's official Vue template. */
async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log("Vite dev server not running. Run 'bun run dev:hmr' for HMR support.");
		}
	}
	return "views://mainview/index.html";
}

// Utils.paths.userData resolves to the OS-appropriate per-app data directory
// (keyed by app.identifier + channel from electrobun.config.ts), e.g. under %APPDATA%
// on Windows. Using the framework's own convention instead of hardcoding a path.
const dataDir = Utils.paths.userData;
if (!existsSync(dataDir)) {
	mkdirSync(dataDir, { recursive: true });
}
const dbPath = join(dataDir, "cash-flow-monitor.sqlite");
const db = createDatabase(dbPath);
console.log(`Baza danych: ${dbPath}`);

// The RPC handlers need the window (to fit it to the display), but the window needs the
// RPC object at construction — hence the getter closing over a slot filled in just below.
let mainWindow: BrowserWindow | null = null;
const rpc = createCashflowRpc(db, () => mainWindow);
const url = await getMainViewUrl();

// A first-paint size only: once the webview mounts it reports the display metrics and the
// main process resizes the window to fill the available space and re-centers it (see
// `fitWindowToScreen`). These numbers just avoid a zero-sized flash before that lands.
mainWindow = new BrowserWindow({
	title: "Cash Flow Monitor",
	url,
	rpc,
	frame: {
		width: 1280,
		height: 820,
		x: 120,
		y: 80,
	},
});

console.log("Cash Flow Monitor: aplikacja wystartowała.");

registerUpdateMenu();

// Deliberately after the window exists so the app paints before any dialog appears.
// Awaiting the fetch yields to the event loop, so this doesn't hold up first paint.
await checkForUpdateWithConsent();
