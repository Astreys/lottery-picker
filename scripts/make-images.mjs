/**
 * Generates the site's raster images: the social card and the PNG app icons.
 *
 * Written by hand rather than pulled from an image library — the project has no
 * other need for one, and these are just circles and digits. The icons mirror
 * static/favicon.svg, so change both together. Run with `npm run images`.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [0x14, 0x18, 0x1e];
const INK = [0x14, 0x18, 0x1e];
const HOT = [0xf0, 0x85, 0x4a];
const REG = [0x9a, 0xa3, 0xad];
const COLD = [0x5a, 0xa2, 0xe0];

function canvas(width, height, background) {
	const px = new Float64Array(width * height * 3);
	for (let i = 0; i < width * height; i++) {
		px[i * 3] = background[0];
		px[i * 3 + 1] = background[1];
		px[i * 3 + 2] = background[2];
	}

	/** Blend a colour into one pixel at the given coverage (0..1). */
	function blend(x, y, [r, g, b], a) {
		if (a <= 0 || x < 0 || y < 0 || x >= width || y >= height) return;
		const i = (y * width + x) * 3;
		px[i] += (r - px[i]) * a;
		px[i + 1] += (g - px[i + 1]) * a;
		px[i + 2] += (b - px[i + 2]) * a;
	}

	/** Antialiased disc — coverage falls off across the last pixel of radius. */
	function circle(cx, cy, r, colour, alpha = 1) {
		for (let y = Math.floor(cy - r - 2); y <= Math.ceil(cy + r + 2); y++) {
			for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
				const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
				blend(x, y, colour, Math.min(1, Math.max(0, r + 0.5 - d)) * alpha);
			}
		}
	}

	function rect(x0, y0, w, h, colour, alpha = 1) {
		for (let y = y0; y < y0 + h; y++)
			for (let x = x0; x < x0 + w; x++) blend(x, y, colour, alpha);
	}

	return { width, height, px, blend, circle, rect };
}

// A 5x7 bitmap font, digits only — nothing here needs letters.
const GLYPHS = {
	0: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
	1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
	2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
	3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
	4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
	5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
	6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
	7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
	8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
	9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100']
};

/** Draw a zero-padded two-digit number centred on (cx, cy). */
function number(c, value, cx, cy, scale, colour) {
	const text = String(value).padStart(2, '0');
	const gap = scale;
	const width = text.length * 5 * scale + (text.length - 1) * gap;
	let x = Math.round(cx - width / 2);
	const y = Math.round(cy - (7 * scale) / 2);

	for (const char of text) {
		const rows = GLYPHS[char];
		for (let r = 0; r < 7; r++)
			for (let col = 0; col < 5; col++)
				if (rows[r][col] === '1') c.rect(x + col * scale, y + r * scale, scale, scale, colour);
		x += 5 * scale + gap;
	}
}

/** A lottery ball: soft shadow, body, highlight, and optionally a number. */
function ball(c, cx, cy, r, colour, value) {
	c.circle(cx, cy + r * 0.07, r, [0, 0, 0], 0.28);
	c.circle(cx, cy, r, colour);
	c.circle(cx - r * 0.32, cy - r * 0.36, r * 0.42, [0xff, 0xff, 0xff], 0.16);
	if (value !== undefined) number(c, value, cx, cy, Math.round(r / 7.5), INK);
}

// ---- PNG encoding ----------------------------------------------------------

const CRC = Int32Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c;
});

function crc32(buf) {
	let c = 0xffffffff;
	for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

function save(c, path) {
	// Raw scanlines, each prefixed with filter type 0 (none).
	const raw = Buffer.alloc(c.height * (1 + c.width * 3));
	for (let y = 0; y < c.height; y++) {
		const row = y * (1 + c.width * 3);
		raw[row] = 0;
		for (let x = 0; x < c.width * 3; x++) {
			raw[row + 1 + x] = Math.round(Math.min(255, Math.max(0, c.px[y * c.width * 3 + x])));
		}
	}

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(c.width, 0);
	ihdr.writeUInt32BE(c.height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // colour type: truecolour RGB
	// bytes 10-12 stay zero: deflate, adaptive filtering, no interlace

	const png = Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);

	writeFileSync(path, png);
	console.log(`${path} — ${c.width}x${c.height}, ${(png.length / 1024).toFixed(1)} KB`);
}

// ---- The social card -------------------------------------------------------

function socialCard() {
	const W = 1200;
	const H = 630;
	const c = canvas(W, H, BG);

	const PICKS = [
		[7, HOT],
		[23, HOT],
		[31, REG],
		[44, COLD],
		[52, COLD]
	];
	const R = 88;
	const SPACING = 220;
	const startX = W / 2 - ((PICKS.length - 1) * SPACING) / 2;

	PICKS.forEach(([value, colour], i) => {
		const t = i - (PICKS.length - 1) / 2;
		// Centre ball highest, so the row reads as a gentle arc.
		ball(c, startX + i * SPACING, H / 2 - 34 + t * t * 8, R, colour, value);
	});

	// Band legend along the bottom: hot, regular, cold.
	const swatch = 96;
	const gapX = 26;
	const legend = [HOT, REG, COLD];
	const legendW = legend.length * swatch + (legend.length - 1) * gapX;
	legend.forEach((colour, i) =>
		c.rect(Math.round(W / 2 - legendW / 2 + i * (swatch + gapX)), H - 104, swatch, 10, colour)
	);

	save(c, 'static/og.png');
}

// ---- App icons -------------------------------------------------------------

/**
 * Three balls, matching favicon.svg. Laid out inside the middle 80% so the
 * design survives the circular crop iOS and Android apply.
 */
function icon(size, path) {
	const c = canvas(size, size, BG);
	const u = size / 64; // favicon.svg is authored on a 64-unit grid

	ball(c, 23 * u, 24 * u, 13 * u, HOT);
	ball(c, 42 * u, 30 * u, 11 * u, REG);
	ball(c, 30 * u, 44 * u, 12 * u, COLD);

	save(c, path);
}

socialCard();
icon(180, 'static/apple-touch-icon.png');
icon(192, 'static/icon-192.png');
icon(512, 'static/icon-512.png');
