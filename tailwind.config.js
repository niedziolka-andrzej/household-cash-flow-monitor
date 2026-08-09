/**
 * Design tokens from the "Cash Flow Monitor - UX" design comp (claude.ai/design):
 * a warm cream canvas, white cards with a hairline shadow, indigo as the single
 * accent and burnt orange reserved for "below zero".
 *
 * @type {import('tailwindcss').Config}
 */
export default {
	content: ["./src/mainview/**/*.{html,js,ts,vue}"],
	theme: {
		extend: {
			colors: {
				canvas: "#faf7f0",
				surface: "#ffffff",
				ink: {
					DEFAULT: "#1c1a17",
					muted: "rgba(28,26,23,0.6)",
					subtle: "rgba(28,26,23,0.5)",
					faint: "rgba(28,26,23,0.45)",
				},
				accent: {
					DEFAULT: "#4338ca",
					hover: "#372fa8",
					soft: "#eeecfb",
				},
				danger: {
					DEFAULT: "#c2410c",
					soft: "#fdece0",
				},
				neutralSoft: "#f1f0ed",
				hairline: "rgba(28,26,23,0.07)",
				edge: "rgba(28,26,23,0.12)",
				edgeStrong: "rgba(28,26,23,0.15)",
				// Chart series. The comp's #d8d5cd for recurring expenses fails contrast
				// against the cream canvas (1.43:1 — the bar all but disappears), so the
				// series uses the darker warm grey from the same family, which validates at
				// >= 3:1 with deutan separation ΔE 11.2 from the orange.
				series: {
					income: "#4338ca",
					recurring: "#8a8579",
					oneTime: "#c2410c",
				},
			},
			fontFamily: {
				// Remote webfonts per the comp, with system fallbacks so a packaged app
				// offline still renders in a sane sans instead of a serif default.
				display: ["General Sans", "Segoe UI", "system-ui", "sans-serif"],
				sans: ["Manrope", "Segoe UI", "system-ui", "sans-serif"],
			},
			borderRadius: {
				card: "20px",
				control: "10px",
			},
			boxShadow: {
				card: "0 1px 2px rgba(28,26,23,0.06)",
				accent: "0 6px 16px rgba(67,56,202,0.25)",
			},
		},
	},
	plugins: [],
};
