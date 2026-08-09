#!/usr/bin/env bun
/**
 * `bun run icons` — regenerates every packaged app icon from the Lucide "wallet-minimal" glyph.
 *
 * The output is committed, because CI only runs `bun run build` (see .github/workflows/
 * release.yml) and electrobun reads these files straight off disk while assembling the
 * bundle. Re-run this script only when the artwork below changes.
 *
 * Why we rasterize by hand instead of shelling out to a converter: the three obvious tools
 * are all unavailable or platform-locked here. `iconutil` is macOS-only, ImageMagick is not
 * installed (and `convert.exe` on Windows is the NTFS filesystem converter — running it on a
 * drive is destructive, so it must never be mistaken for one), and pulling in a rasterizer
 * would add a native dependency to a project that otherwise builds with just Bun and Vite.
 * Instead we evaluate the glyph as a signed distance field: the artwork decomposes into line
 * segments, quarter-circle arcs, and a dot, every one of which has a closed-form distance
 * function, so a few lines of arithmetic give exact anti-aliased coverage at any size —
 * including the 1024px macOS slice that a hand-drawn bitmap set would never cover.
 *
 * Usage:
 *   bun run icons
 *   bun run icons -- --out=/tmp/icons     # write elsewhere; leaves assets/ untouched
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------------------
// Artwork
// ---------------------------------------------------------------------------

/** Lucide's grid. The primitives below are copied verbatim from lucide-static v1.31.0
 * `icons/wallet-minimal.svg` (ISC licence), so the icon stays recognisably the upstream glyph.
 * The glyph is a single open outline — five straight edges joined by four quarter-circle
 * corners, deliberately left open at the flap fold — plus one dot. */
const GRID = 24;
const WALLET_EDGES: ReadonlyArray<readonly [number, number, number, number]> = [
	[7, 7, 19, 7], // flap fold
	[21, 9, 21, 19], // right side
	[19, 21, 5, 21], // bottom
	[3, 19, 3, 5], // left side
	[5, 3, 19, 3], // top
];
/** cx, cy, r, and the arc's angular span (radians) from `a0` to `a1`. */
const WALLET_CORNERS: ReadonlyArray<readonly [number, number, number, number, number]> = [
	[19, 9, 2, -Math.PI / 2, 0],
	[19, 19, 2, 0, Math.PI / 2],
	[3, 21, 2, 0, -Math.PI / 2],
	[5, 5, 2, Math.PI, Math.PI * 1.5],
];
/** The `M17 14h.01` sub-path. A segment that short with `stroke-linecap="round"` renders as a
 * dot one stroke-width across, so we draw it as exactly that. */
const DOT = { x: 17, y: 14 } as const;
const STROKE = 2;

/** `accent.DEFAULT` and `surface` from tailwind.config.js — the app's single accent, so the
 * icon reads as the same product as the UI behind it. */
const ACCENT = "#4338ca";
const ACCENT_RGB = [0x43, 0x38, 0xca] as const;

/** Fraction of the canvas the 24-unit glyph box spans. The glyph's own ink already leaves a
 * ~12.5% margin on every side of that box (it spans grid units 3–21), so this adds clearance
 * evenly rather than favouring one axis. */
const GLYPH_SCALE = 0.72;
/** Corner radius as a fraction of the icon's width. Full-bleed rounded square rather than a
 * padded squircle: Windows is the shipping target and draws the icon edge-to-edge. */
const BG_RADIUS = 0.225;

// ---------------------------------------------------------------------------
// Signed distance fields
// ---------------------------------------------------------------------------

/** Distance from (px,py) to a rounded rectangle centred on (cx,cy); negative inside. */
function sdRoundedRect(
	px: number,
	py: number,
	cx: number,
	cy: number,
	halfW: number,
	halfH: number,
	radius: number,
): number {
	const qx = Math.abs(px - cx) - halfW + radius;
	const qy = Math.abs(py - cy) - halfH + radius;
	return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius;
}

/** Distance from (px,py) to a circle; negative inside. */
function sdCircle(px: number, py: number, cx: number, cy: number, radius: number): number {
	return Math.hypot(px - cx, py - cy) - radius;
}

/** Unsigned distance from (px,py) to the line segment from (ax,ay) to (bx,by). */
function sdSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const abx = bx - ax;
	const aby = by - ay;
	const t = Math.min(Math.max(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby), 0), 1);
	return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

/** Unsigned distance from (px,py) to the circular arc of radius `r` centred on (cx,cy) that
 * runs from angle `a0` to `a1` (radians, span under a half-turn). Off the arc's span, the
 * nearest point is whichever endpoint is closer — same as a rounded line cap. */
function sdArc(px: number, py: number, cx: number, cy: number, r: number, a0: number, a1: number): number {
	const vx = px - cx;
	const vy = py - cy;
	const u0x = Math.cos(a0);
	const u0y = Math.sin(a0);
	const u1x = Math.cos(a1);
	const u1y = Math.sin(a1);
	// Angles of v and u1, measured relative to u0 — avoids a branch cut at ±π.
	const relV = Math.atan2(u0x * vy - u0y * vx, u0x * vx + u0y * vy);
	const relEnd = Math.atan2(u0x * u1y - u0y * u1x, u0x * u1x + u0y * u1y);
	const within = relEnd >= 0 ? relV >= 0 && relV <= relEnd : relV <= 0 && relV >= relEnd;
	if (within) return Math.abs(Math.hypot(vx, vy) - r);
	return Math.min(Math.hypot(px - (cx + r * u0x), py - (cy + r * u0y)), Math.hypot(px - (cx + r * u1x), py - (cy + r * u1y)));
}

/** Coverage of a pixel whose centre sits `d` pixels from the edge. Linear ramp across the one
 * pixel straddling the boundary, which is what a distance field buys us over supersampling. */
function coverage(d: number): number {
	return Math.min(Math.max(0.5 - d, 0), 1);
}

/** Optical correction. A 2/24 stroke scaled to 16px is under a pixel wide, and linear
 * anti-aliasing renders sub-pixel strokes as a pale smear — the glyph dissolves into its own
 * background in the taskbar. Thickening it at small sizes keeps the shape legible; by 48px
 * the stroke covers enough pixels to stand on its own. */
function strokeBoost(size: number): number {
	if (size <= 16) return 1.45;
	if (size <= 24) return 1.25;
	if (size <= 32) return 1.12;
	return 1;
}

/** Renders the icon at `size`x`size` as non-premultiplied RGBA. */
export function renderIcon(size: number): Uint8Array {
	const rgba = new Uint8Array(size * size * 4);
	const centre = size / 2;
	const bgRadius = size * BG_RADIUS;
	/** Pixels per Lucide grid unit, so the primitives keep their upstream numbers. */
	const unit = (size / GRID) * GLYPH_SCALE;
	const halfStroke = (STROKE * strokeBoost(size)) / 2;

	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const sx = x + 0.5;
			const sy = y + 0.5;

			const bg = coverage(sdRoundedRect(sx, sy, centre, centre, centre, centre, bgRadius));

			// Map the pixel centre into the glyph's 24-unit space.
			const gx = (sx - centre) / unit + GRID / 2;
			const gy = (sy - centre) / unit + GRID / 2;
			// The outline is a curve, not a filled region, so distance-to-curve is already the
			// ink boundary; the union of pieces is the min of distances.
			let d = Infinity;
			for (const [ax, ay, bx, by] of WALLET_EDGES) d = Math.min(d, sdSegment(gx, gy, ax, ay, bx, by));
			for (const [cx, cy, r, a0, a1] of WALLET_CORNERS) d = Math.min(d, sdArc(gx, gy, cx, cy, r, a0, a1));
			d -= halfStroke;
			d = Math.min(d, sdCircle(gx, gy, DOT.x, DOT.y, halfStroke));
			// Back to pixels before anti-aliasing, and clipped to the square it sits on.
			const ink = Math.min(coverage(d * unit), bg);

			const at = (y * size + x) * 4;
			for (let c = 0; c < 3; c++) {
				rgba[at + c] = Math.round(ACCENT_RGB[c]! + (0xff - ACCENT_RGB[c]!) * ink);
			}
			rgba[at + 3] = Math.round(bg * 0xff);
		}
	}
	return rgba;
}

/** Trims binary-float noise (0.28 * 24 / 2 is 3.3600000000000003) out of the markup. */
function num(value: number): string {
	return Number(value.toFixed(4)).toString();
}

/** The same artwork as SVG — the favicon, and the human-editable record of the composition. */
export function renderSvg(): string {
	const inset = (GRID * (1 - GLYPH_SCALE)) / 2; // scale about the centre
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" width="512" height="512" role="img" aria-label="Cash Flow Monitor">
	<title>Cash Flow Monitor</title>
	<rect width="${GRID}" height="${GRID}" rx="${num(GRID * BG_RADIUS)}" fill="${ACCENT}"/>
	<!-- Lucide "wallet-minimal" (lucide-static v1.31.0, ISC), scaled about the centre. -->
	<g transform="translate(${num(inset)} ${num(inset)}) scale(${GLYPH_SCALE})" fill="none" stroke="#fff" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">
		<path d="M${DOT.x} ${DOT.y}h.01"/>
		<path d="M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14"/>
	</g>
</svg>
`;
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** length + type + data + CRC32 over (type + data). */
function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function encodePng(size: number, rgba: Uint8Array): Uint8Array {
	const ihdr = new Uint8Array(13);
	const view = new DataView(ihdr.buffer);
	view.setUint32(0, size);
	view.setUint32(4, size);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // colour type 6 = RGBA
	// [10] compression, [11] filter method, [12] interlace — all 0, the only values PNG defines.

	// Each scanline carries a leading filter byte. Filter 0 (None) is enough: the artwork is
	// flat colour over most of its area, which deflate already collapses.
	const stride = size * 4;
	const raw = new Uint8Array((stride + 1) * size);
	for (let y = 0; y < size; y++) {
		raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
	}

	return concat([
		PNG_MAGIC,
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", deflateSync(raw, { level: 9 })),
		pngChunk("IEND", new Uint8Array(0)),
	]);
}

/** Wraps already-encoded PNGs in an ICO directory. Windows has accepted PNG-compressed
 * entries since Vista, which is what lets one file hold a 256px slice without bloating. */
export function encodeIco(entries: { size: number; png: Uint8Array }[]): Uint8Array {
	const header = new Uint8Array(6 + entries.length * 16);
	const view = new DataView(header.buffer);
	view.setUint16(2, 1, true); // resource type 1 = icon ([0] reserved, stays 0)
	view.setUint16(4, entries.length, true);

	let offset = header.length;
	entries.forEach((entry, i) => {
		const at = 6 + i * 16;
		// Width and height are one byte each, so 256 is encoded as 0.
		header[at] = entry.size >= 256 ? 0 : entry.size;
		header[at + 1] = entry.size >= 256 ? 0 : entry.size;
		// [at+2] palette size (0 = truecolour), [at+3] reserved.
		view.setUint16(at + 4, 1, true); // colour planes
		view.setUint16(at + 6, 32, true); // bits per pixel
		view.setUint32(at + 8, entry.png.length, true);
		view.setUint32(at + 12, offset, true);
		offset += entry.png.length;
	});

	return concat([header, ...entries.map((e) => e.png)]);
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** Windows shell sizes. Nothing above 256 — the ICO directory cannot describe it. */
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256] as const;
/** Linux copies a single PNG to `Resources/appIcon.png`; 512 covers every desktop's grid. */
export const LINUX_SIZE = 512;
/** Names `iconutil` expects inside an `.iconset` folder. Only consumed on a macOS build. */
export const ICONSET: ReadonlyArray<readonly [string, number]> = [
	["icon_16x16.png", 16],
	["icon_16x16@2x.png", 32],
	["icon_32x32.png", 32],
	["icon_32x32@2x.png", 64],
	["icon_128x128.png", 128],
	["icon_128x128@2x.png", 256],
	["icon_256x256.png", 256],
	["icon_256x256@2x.png", 512],
	["icon_512x512.png", 512],
	["icon_512x512@2x.png", 1024],
];

/**
 * Writes every icon under `outDir`, plus the favicon copy at `faviconPath` when given.
 *
 * The favicon has to live inside the Vite root and be referenced relatively, so Vite emits it
 * into `dist/assets/` — the only directory `build.copy` in electrobun.config.ts lifts into the
 * bundle. A `public/` file would land in `dist/` itself and silently vanish from the package.
 */
export function generate(
	outDir: string,
	opts: { faviconPath?: string; log?: (message: string) => void } = {},
): void {
	const log = opts.log ?? (() => {});
	const cache = new Map<number, Uint8Array>();
	const png = (size: number): Uint8Array => {
		let hit = cache.get(size);
		if (!hit) {
			hit = encodePng(size, renderIcon(size));
			cache.set(size, hit);
		}
		return hit;
	};

	const writeTo = (path: string, label: string, bytes: Uint8Array | string): void => {
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, bytes);
		const size = typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.length;
		log(`  ${label.padEnd(32)} ${size.toLocaleString()} bytes`);
	};
	const write = (relative: string, bytes: Uint8Array | string): void =>
		writeTo(join(outDir, relative), relative, bytes);

	const svg = renderSvg();
	write("icon.svg", svg);
	write("icon.ico", encodeIco(ICO_SIZES.map((size) => ({ size, png: png(size) }))));
	write("icon.png", png(LINUX_SIZE));
	for (const [name, size] of ICONSET) {
		write(join("icon.iconset", name), png(size));
	}
	if (opts.faviconPath) writeTo(opts.faviconPath, "(favicon) icon.svg", svg);
}

if (import.meta.main) {
	const outFlag = process.argv.slice(2).find((a) => a.startsWith("--out="));
	const root = join(import.meta.dir, "..");
	const outDir = outFlag ? outFlag.slice("--out=".length) : join(root, "assets");

	console.log(`Generating icons in ${outDir}`);
	generate(outDir, {
		// Only the default target owns the checked-in favicon; `--out=` is for inspecting output.
		faviconPath: outFlag ? undefined : join(root, "src", "mainview", "icon.svg"),
		log: (m) => console.log(m),
	});
	console.log("\nDone. Referenced from electrobun.config.ts (win/mac/linux) and src/mainview/index.html.");
}
