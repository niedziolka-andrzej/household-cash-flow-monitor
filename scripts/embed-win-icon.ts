#!/usr/bin/env bun
/**
 * Build hook (`scripts.postBuild` / `scripts.postPackage` in electrobun.config.ts) that stamps
 * assets/icon.ico into the Windows executables.
 *
 * Why this exists: electrobun already tries to do exactly this, and cannot. Its CLI ships as a
 * Bun single-file executable, and the three embed sites in electrobun 1.18.1 all locate the
 * tool with `require.resolve("rcedit/package.json")` — which inside a compiled binary resolves
 * against the paths baked in when *electrobun itself* was built. On any machine but its CI
 * runner that yields a dead path and the build logs:
 *
 *   Warning: Failed to embed icon into launcher.exe: ResolveMessage: Cannot find module
 *   'D:\a\electrobun\electrobun\package\node_modules\rcedit\package.json' from 'B:\~BUN\root\electrobun'
 *
 * It is only a warning, so the build "succeeds" while every executable keeps electrobun's
 * default blue icon. `build.win.icon` still gets copied to Resources/app.ico, but on Windows
 * the icon shown in Explorer, the taskbar and Alt-Tab comes from the PE resource inside the
 * .exe, so without this hook the app icon is invisible where users actually look for it.
 *
 * We run as a plain script rather than a compiled binary, so the same `require.resolve` finds
 * the rcedit that is already in node_modules as an electrobun dependency — no new dependency,
 * and it drops out on its own once upstream fixes the resolution.
 */
import { existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, relative } from "node:path";

/** Bundle-relative executables electrobun tries to stamp. `launcher.exe` is what shortcuts
 * point at; `bun.exe` hosts the process that owns the window, so the taskbar reads its icon.
 * The other bundled binaries (bspatch, zig-zstd) are internal and never surface to the user. */
const BUNDLE_EXES = ["launcher.exe", "bun.exe"] as const;

/** Resolves rcedit's platform binary from node_modules, or null if it isn't installed. */
export function findRcedit(): string | null {
	let packageJson: string;
	try {
		packageJson = require.resolve("rcedit/package.json");
	} catch {
		return null;
	}
	const bin = join(dirname(packageJson), "bin");
	for (const name of ["rcedit-x64.exe", "rcedit.exe"]) {
		const candidate = join(bin, name);
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

/**
 * Every executable worth stamping under `buildDir` and `artifactDir`. Located by scanning rather
 * than by assembling paths, so a rename of the app folder or the setup file doesn't silently stop
 * matching.
 *
 * The two hook passes see different trees, and this deliberately covers both:
 *   postBuild   — `<bundle>/bin/{launcher,bun}.exe`, before electrobun archives bin/ into a
 *                 .tar.zst (which is why they must be stamped here: afterwards they're inside the
 *                 archive, and what gets extracted on the user's machine is whatever we wrote now).
 *   postPackage — `<buildDir>/*-Setup.exe`, the self-extracting installer, which does not exist
 *                 yet during postBuild.
 */
export function findTargets(buildDir: string, artifactDir?: string): string[] {
	const targets: string[] = [];
	if (existsSync(buildDir)) {
		for (const name of BUNDLE_EXES) {
			for (const hit of new Bun.Glob(`**/bin/${name}`).scanSync({ cwd: buildDir, absolute: true })) {
				targets.push(hit);
			}
		}
		// Top level only — the installer sits directly in the build folder.
		for (const hit of new Bun.Glob("*.exe").scanSync({ cwd: buildDir, absolute: true })) {
			targets.push(hit);
		}
	}
	if (artifactDir && existsSync(artifactDir)) {
		for (const hit of new Bun.Glob("*.exe").scanSync({ cwd: artifactDir, absolute: true })) {
			targets.push(hit);
		}
	}
	return targets;
}

/** Escapes a path for a single-quoted PowerShell string literal. */
function psQuote(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Replaces the stamped executables inside the artifact zips.
 *
 * Needed because electrobun builds the installer and zips it in one uninterrupted stretch, with no
 * hook in between — by the time postPackage runs, `artifacts/*-Setup.zip` already holds an
 * un-stamped copy of the .exe, and that zip is exactly what CI publishes and users download. So we
 * stamp the loose .exe and then swap it into the zip.
 *
 * Delegates to .NET's ZipArchive via PowerShell rather than hand-rolling a zip writer: Bun has no
 * zip encoder, rewriting central-directory offsets by hand is easy to get subtly wrong, and this
 * whole file is Windows-only anyway. Returns the number of entries replaced.
 */
export function refreshZipEntries(
	artifactDir: string,
	stamped: string[],
	log: (message: string) => void = () => {},
): number {
	if (!existsSync(artifactDir) || stamped.length === 0) return 0;
	const zips = [...new Bun.Glob("*.zip").scanSync({ cwd: artifactDir, absolute: true })];
	if (zips.length === 0) return 0;

	let replaced = 0;
	for (const zip of zips) {
		for (const exe of stamped) {
			const entryName = basename(exe);
			// -Command over -File: no temp script, and the quoting is fully under our control.
			const script = [
				"Add-Type -AssemblyName System.IO.Compression.FileSystem;",
				`$z=[System.IO.Compression.ZipFile]::Open(${psQuote(zip)},'Update');`,
				// Match on the entry's own name so a nested copy (.installer\...) is left alone.
				`$e=$z.Entries | Where-Object { $_.Name -eq ${psQuote(entryName)} } | Select-Object -First 1;`,
				"if ($e) { $n=$e.FullName; $e.Delete();",
				`[void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z,${psQuote(exe)},$n);`,
				'Write-Output "replaced" } else { Write-Output "absent" };',
				"$z.Dispose()",
			].join(" ");

			let output: string;
			try {
				output = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
				});
			} catch (error) {
				throw new Error(`could not update ${basename(zip)}: ${error instanceof Error ? error.message : String(error)}`);
			}
			if (output.includes("replaced")) {
				replaced++;
				log(`  icon -> ${entryName} inside ${basename(zip)}`);
			}
		}
	}
	return replaced;
}

export type EmbedResult = { stamped: string[]; skipped: string[] };

/** Stamps `icon` into each target. Throws on an rcedit failure: a target we found and could
 * not write is a real problem, not the missing-tool case the caller already handled. */
export function embed(
	rcedit: string,
	icon: string,
	targets: string[],
	log: (message: string) => void = () => {},
): EmbedResult {
	const result: EmbedResult = { stamped: [], skipped: [] };
	for (const target of targets) {
		if (!existsSync(target)) {
			result.skipped.push(target);
			continue;
		}
		try {
			execFileSync(rcedit, [target, "--set-icon", icon], { stdio: "pipe" });
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			throw new Error(`rcedit could not write the icon into ${target}: ${detail}`);
		}
		result.stamped.push(target);
		log(`  icon -> ${relative(process.cwd(), target)} (${(statSync(target).size / 1e6).toFixed(1)} MB)`);
	}
	return result;
}

if (import.meta.main) {
	const targetOs = process.env.ELECTROBUN_OS;
	// The hook is wired unconditionally, so a mac or linux build must fall straight through:
	// PE resources are a Windows-only concept, and those platforms read the icon electrobun
	// already placed in Resources/ instead.
	if (targetOs && targetOs !== "win") {
		console.log(`embed-win-icon: target is ${targetOs}, nothing to do.`);
		process.exit(0);
	}

	const root = join(import.meta.dir, "..");
	const icon = join(root, "assets", "icon.ico");
	if (!existsSync(icon)) {
		console.error(`embed-win-icon: ${icon} is missing. Run \`bun run icons\` to regenerate it.`);
		process.exit(1);
	}

	const rcedit = findRcedit();
	if (!rcedit) {
		// Don't fail the build over a cosmetic resource we cannot write.
		console.warn("embed-win-icon: WARNING rcedit not found in node_modules — executables keep the default icon.");
		process.exit(0);
	}

	const buildDir = process.env.ELECTROBUN_BUILD_DIR ?? join(root, "build");
	const targets = findTargets(buildDir, process.env.ELECTROBUN_ARTIFACT_DIR);
	if (targets.length === 0) {
		console.warn(`embed-win-icon: WARNING no executables found under ${buildDir} — bundle layout may have changed upstream.`);
		process.exit(0);
	}

	try {
		const { stamped } = embed(rcedit, icon, targets, (m) => console.log(m));
		const artifactDir = process.env.ELECTROBUN_ARTIFACT_DIR;
		const refreshed = artifactDir ? refreshZipEntries(artifactDir, stamped, (m) => console.log(m)) : 0;
		console.log(
			`embed-win-icon: stamped ${stamped.length} executable(s)` +
				`${refreshed > 0 ? `, refreshed ${refreshed} zip entr${refreshed === 1 ? "y" : "ies"}` : ""}.`,
		);
	} catch (error) {
		console.error(`embed-win-icon: ${(error as Error).message}`);
		process.exit(1);
	}
}
