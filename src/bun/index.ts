import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BrowserWindow, Updater, Utils } from "electrobun/bun";
import { createDatabase } from "./db/database";
import { createCashflowRpc } from "./rpc/handlers";

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

const rpc = createCashflowRpc(db);
const url = await getMainViewUrl();

new BrowserWindow({
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
