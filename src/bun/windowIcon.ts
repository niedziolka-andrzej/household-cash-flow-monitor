/**
 * Puts the app icon on the Windows window itself.
 *
 * Why this is needed on top of the PE resource that scripts/embed-win-icon.ts stamps into the
 * executables: those two mechanisms cover different surfaces. The PE resource is what Explorer,
 * shortcuts and the installer read off disk. The title bar, the taskbar button and Alt-Tab
 * instead read the icon attached to the *window*, and electrobun 1.18.1's native layer registers
 * its window class with a NULL `hIcon` and never sends `WM_SETICON` — verified on a live window:
 * `WM_GETICON` returns 0 for ICON_BIG/ICON_SMALL/ICON_SMALL2 and `GCLP_HICON` is 0. With nothing
 * set, Windows falls back to the icon of the process that owns the window, which is the bundled
 * `bin/bun.exe` rather than `launcher.exe` — a fallback that also depends on the shell's icon
 * cache noticing that we rewrote a 116 MB binary in place. Setting the icon directly is
 * deterministic, so it is what actually makes the icon appear while the app is running.
 *
 * Everything here is best-effort: an icon is cosmetic, and no failure in it should stop the app
 * from starting.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
// Type-only, so it erases at runtime and this module still loads where bun:ffi has no user32.
import type { Pointer } from "bun:ffi";

/** `Resources/app.ico` — electrobun copies `build.win.icon` there for every Windows build, so it
 * sits two levels above the bundled bun entrypoint (`Resources/app/bun/index.js`). */
export function bundledIconPath(): string {
	return join(import.meta.dir, "..", "..", "app.ico");
}

/** UTF-16LE + NUL, the string form every `...W` Win32 entry point expects. */
function wide(value: string): Buffer {
	return Buffer.from(`${value}\0`, "utf16le");
}

const IMAGE_ICON = 1;
const LR_LOADFROMFILE = 0x10;
/** Ask for a real 32x32/16x16 image out of the .ico rather than letting Windows scale one. */
const WM_SETICON = 0x80;
const ICON_SMALL = 0;
const ICON_BIG = 1;

/**
 * Attaches `icoPath` to the top-level window titled `title` that belongs to this process.
 *
 * Scoped to our own process id on purpose: `FindWindowEx` matches by title across the whole
 * desktop, and an editor tab or a second copy of the app can easily carry the same words.
 * Returns false when the window isn't there yet, which is the caller's cue to retry.
 */
export function setWindowIcon(title: string, icoPath: string): boolean {
	// Imported lazily so this module stays loadable (and testable) on macOS and Linux, where
	// user32.dll does not exist and the whole file is a no-op anyway.
	const { dlopen, FFIType, ptr } = require("bun:ffi") as typeof import("bun:ffi");

	const user32 = dlopen("user32.dll", {
		FindWindowExW: {
			args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
			returns: FFIType.ptr,
		},
		GetWindowThreadProcessId: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.u32 },
		LoadImageW: {
			args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32],
			returns: FFIType.ptr,
		},
		SendMessageW: {
			args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.u64],
			returns: FFIType.u64,
		},
	});

	try {
		const wideTitle = wide(title);
		const pidOut = new Uint32Array(1);
		let hwnd: Pointer;
		// Walk every window with this title until one belongs to us.
		for (let previous: Pointer | null = null; ; ) {
			const candidate: Pointer | null = user32.symbols.FindWindowExW(null, previous, null, ptr(wideTitle));
			if (!candidate) return false;
			user32.symbols.GetWindowThreadProcessId(candidate, ptr(pidOut));
			if (pidOut[0] === process.pid) {
				hwnd = candidate;
				break;
			}
			previous = candidate;
		}

		const widePath = wide(icoPath);
		let applied = false;
		for (const [slot, size] of [
			[ICON_BIG, 32],
			[ICON_SMALL, 16],
		] as const) {
			const icon = user32.symbols.LoadImageW(null, ptr(widePath), IMAGE_ICON, size, size, LR_LOADFROMFILE);
			if (!icon) continue;
			user32.symbols.SendMessageW(hwnd, WM_SETICON, BigInt(slot), BigInt(icon));
			applied = true;
		}
		return applied;
	} finally {
		user32.close();
	}
}

/**
 * Retries `setWindowIcon` until the native window exists. `new BrowserWindow()` returns before
 * the OS window is necessarily registered, and there is no event to hook, so we poll briefly
 * rather than race it. Resolves to whether the icon was set.
 */
export async function applyWindowIcon(
	title: string,
	icoPath: string = bundledIconPath(),
	attempts = 40,
	delayMs = 50,
): Promise<boolean> {
	if (process.platform !== "win32") return false;
	if (!existsSync(icoPath)) {
		console.warn(`Nie znaleziono ikony okna: ${icoPath}`);
		return false;
	}
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			if (setWindowIcon(title, icoPath)) return true;
		} catch (error) {
			// A broken FFI call will keep being broken — don't spin on it for two seconds.
			console.warn(`Nie udało się ustawić ikony okna: ${(error as Error).message}`);
			return false;
		}
		await Bun.sleep(delayMs);
	}
	return false;
}
