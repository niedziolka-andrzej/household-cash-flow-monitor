import { inflateSync } from "node:zlib";
import { describe, expect, test } from "bun:test";
import {
	ICO_SIZES,
	ICONSET,
	encodeIco,
	encodePng,
	renderIcon,
	renderSvg,
} from "../scripts/generate-icons";

/**
 * The icon generator writes PNG and ICO containers byte by byte, because no rasterizer is
 * available on the build machines (see the script's header). Nothing downstream validates
 * them — electrobun copies icon.ico into the bundle unread, and a malformed one degrades to
 * a blank icon rather than a build failure — so the structure is asserted here instead.
 */

/** Walks a PNG's chunk list, verifying every CRC. Returns the chunk types in order. */
function pngChunks(png: Uint8Array): string[] {
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	const types: string[] = [];
	let at = 8; // past the magic
	while (at < png.length) {
		const length = view.getUint32(at);
		const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
		// Recompute the CRC over type+data and compare with the stored trailer.
		let crc = 0xffffffff;
		for (const byte of png.subarray(at + 4, at + 8 + length)) {
			crc ^= byte;
			for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
		}
		expect(((crc ^ 0xffffffff) >>> 0), `CRC of ${type} chunk`).toBe(view.getUint32(at + 8 + length));
		types.push(type);
		at += 12 + length;
	}
	expect(at, "chunks must consume the file exactly").toBe(png.length);
	return types;
}

function pixel(rgba: Uint8Array, size: number, x: number, y: number) {
	const at = (y * size + x) * 4;
	return { r: rgba[at]!, g: rgba[at + 1]!, b: rgba[at + 2]!, a: rgba[at + 3]! };
}

describe("renderIcon", () => {
	test("fills the buffer for the requested size", () => {
		expect(renderIcon(32)).toHaveLength(32 * 32 * 4);
	});

	test("paints the accent square opaque and rounds the corners away", () => {
		const size = 64;
		const rgba = renderIcon(size);

		// Mid-left edge is background: inside the square, outside the glyph.
		const edge = pixel(rgba, size, 1, size / 2);
		expect(edge).toMatchObject({ r: 0x43, g: 0x38, b: 0xca, a: 0xff });

		// The very corner falls outside the rounded square.
		expect(pixel(rgba, size, 0, 0).a).toBe(0);
	});

	test("draws the glyph in white", () => {
		const size = 256;
		const rgba = renderIcon(size);
		// The wallet's left and right sides pass through the centre row; scan it for a fully
		// white pixel.
		let whitest = 0;
		for (let x = 0; x < size; x++) whitest = Math.max(whitest, pixel(rgba, size, x, size / 2).r);
		expect(whitest).toBe(0xff);
	});

	test("keeps the glyph clear of the edges at every shipped size", () => {
		for (const size of ICO_SIZES) {
			const rgba = renderIcon(size);
			// Top-centre is inside the square but above the wallet, so it must stay pure accent —
			// this catches a glyph scale or stroke boost that grew enough to touch the border.
			const top = pixel(rgba, size, Math.floor(size / 2), 0);
			expect({ size, ...top }).toMatchObject({ size, r: 0x43, g: 0x38, b: 0xca });
		}
	});
});

describe("encodePng", () => {
	test("writes a signature, one IHDR/IDAT/IEND, and valid CRCs", () => {
		const png = encodePng(16, renderIcon(16));
		expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		expect(pngChunks(png)).toEqual(["IHDR", "IDAT", "IEND"]);
	});

	test("declares the size and an 8-bit RGBA format", () => {
		const png = encodePng(48, renderIcon(48));
		const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
		expect(view.getUint32(16)).toBe(48); // IHDR width
		expect(view.getUint32(20)).toBe(48); // IHDR height
		expect(png[24]).toBe(8); // bit depth
		expect(png[25]).toBe(6); // colour type 6 = RGBA
	});

	test("compresses one filter byte plus one scanline per row", () => {
		// The IDAT is the part a hand-rolled encoder is most likely to get wrong. Inflating it
		// back proves the stream is well-formed zlib and that no row was dropped or doubled.
		const size = 64;
		const png = encodePng(size, renderIcon(size));
		const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
		// Layout: 8 magic + (12 + 13) IHDR = 33, so the IDAT header starts there.
		const idatLength = view.getUint32(33);
		// node:zlib, not Bun.inflateSync — PNG wraps the deflate stream in a zlib header, which
		// Bun's helper does not expect.
		const raw = inflateSync(png.subarray(41, 41 + idatLength));
		expect(raw.length).toBe(size * (size * 4 + 1));
		// Every scanline must declare filter 0 (None).
		for (let y = 0; y < size; y++) expect(raw[y * (size * 4 + 1)]).toBe(0);
	});
});

describe("encodeIco", () => {
	const entries = ICO_SIZES.map((size) => ({ size, png: encodePng(size, renderIcon(size)) }));
	const ico = encodeIco(entries);
	const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);

	test("writes an ICONDIR for every entry", () => {
		expect(view.getUint16(0, true)).toBe(0); // reserved
		expect(view.getUint16(2, true)).toBe(1); // type 1 = icon
		expect(view.getUint16(4, true)).toBe(entries.length);
	});

	test("lays payloads out contiguously with no trailing bytes", () => {
		let expected = 6 + entries.length * 16;
		entries.forEach((entry, i) => {
			const at = 6 + i * 16;
			expect(view.getUint32(at + 12, true), `entry ${i} offset`).toBe(expected);
			expect(view.getUint32(at + 8, true), `entry ${i} length`).toBe(entry.png.length);
			expected += entry.png.length;
		});
		expect(expected).toBe(ico.length);
	});

	test("stores each entry's dimensions, with 256 written as 0", () => {
		entries.forEach((entry, i) => {
			const at = 6 + i * 16;
			const encoded = entry.size >= 256 ? 0 : entry.size;
			expect(ico[at], `entry ${i} width`).toBe(encoded);
			expect(ico[at + 1], `entry ${i} height`).toBe(encoded);
			expect(view.getUint16(at + 4, true)).toBe(1); // colour planes
			expect(view.getUint16(at + 6, true)).toBe(32); // bits per pixel
		});
	});

	test("includes the sizes the Windows shell asks for", () => {
		expect(ICO_SIZES).toContain(16);
		expect(ICO_SIZES).toContain(32);
		expect(ICO_SIZES).toContain(48);
		expect(ICO_SIZES).toContain(256);
		// A single byte holds the dimension, so nothing larger can be described.
		expect(Math.max(...ICO_SIZES)).toBeLessThanOrEqual(256);
	});
});

describe("renderSvg", () => {
	test("keeps Lucide's wallet-minimal primitives verbatim", () => {
		const svg = renderSvg();
		expect(svg).toContain('d="M17 14h.01"');
		expect(svg).toContain('d="M7 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14"');
		expect(svg).toContain('stroke-linecap="round"');
	});

	test("is a self-contained square with no external references", () => {
		const svg = renderSvg();
		expect(svg).toContain('viewBox="0 0 24 24"');
		expect(svg).toContain("#4338ca");
		expect(svg).not.toContain("http://www.w3.org/1999/xlink");
		expect(svg).not.toMatch(/<image|url\(/);
	});
});

describe("ICONSET", () => {
	test("covers every size iconutil expects, with matching @2x pairs", () => {
		const byName = new Map(ICONSET);
		for (const base of [16, 32, 128, 256, 512]) {
			expect(byName.get(`icon_${base}x${base}.png`), `icon_${base}x${base}.png`).toBe(base);
			expect(byName.get(`icon_${base}x${base}@2x.png`), `icon_${base}x${base}@2x.png`).toBe(base * 2);
		}
	});
});
