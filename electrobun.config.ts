import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Cash Flow Monitor",
		identifier: "cashflowmonitor.electrobun.dev",
		version: "0.0.1",
	},
	release: {
		// GitHub's /releases/latest/download/ is a stable redirect to the newest
		// non-prerelease release, so this URL survives every new tag. The updater
		// appends the flat artifact names (stable-win-x64-*) that CI uploads.
		baseUrl:
			"https://github.com/niedziolka-andrzej/household-cash-flow-monitor/releases/latest/download",
	},
	build: {
		// Vite builds to dist/, we copy from there
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		// Ignore Vite output in watch mode — HMR handles view rebuilds separately
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
