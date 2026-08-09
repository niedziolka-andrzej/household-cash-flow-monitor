<script setup lang="ts">
import { computed } from "vue";
import { formatMoney, money } from "../../shared/money";
import type { MonthlyResult } from "../../shared/types";

/**
 * Grouped bars per month: income beside expenses, where expenses stack recurring under
 * one-time. Where a month has actuals entered, the forecast bar drops to 30% opacity and
 * a narrow solid bar of the effective value is drawn over it — so forecast and reality are
 * legible in the same slot without a second axis or a second chart.
 *
 * Palette: series tokens from tailwind.config.js. The recurring grey is deliberately a
 * neutral (cost baseline) rather than a third hue; the legend plus the table underneath
 * carry identity, which is the secondary encoding a low-chroma series requires.
 */
const props = defineProps<{ months: MonthlyResult[]; currency: string }>();

const COLORS = { income: "#4338ca", recurring: "#8a8579", oneTime: "#c2410c" };
const GEOMETRY = { width: 560, height: 190, left: 6, right: 6, top: 10, bottom: 26 };
/** 2px surface gap between stacked fills and between the two bars of a month. */
const SEGMENT_GAP = 2;

const monthFormatter = new Intl.DateTimeFormat("pl-PL", { month: "short" });
function shortMonth(month: string): string {
	const [year, m] = month.split("-").map(Number);
	return monthFormatter.format(new Date(year, m - 1, 1));
}

interface Bar {
	x: number;
	y: number;
	width: number;
	height: number;
}
interface MonthGroup {
	key: string;
	label: string;
	labelX: number;
	hasActual: boolean;
	forecast: { income: Bar; recurring: Bar; oneTime: Bar };
	effective: { income: Bar; recurring: Bar; oneTime: Bar } | null;
	tooltip: string;
}

const chart = computed(() => {
	const { width, height, left, right, top, bottom } = GEOMETRY;
	const plotWidth = width - left - right;
	const plotHeight = height - top - bottom;
	const baseline = top + plotHeight;
	const months = props.months;

	const major = (minor: number) => minor / 100;
	const peak = months.reduce((max, m) => {
		const forecastExpenses = major(m.recurringTotal.forecast.amountMinor + m.oneTimeTotal.forecast.amountMinor);
		const effectiveExpenses = major(m.recurringTotal.effective.amountMinor + m.oneTimeTotal.effective.amountMinor);
		return Math.max(
			max,
			major(m.income.forecast.amountMinor),
			major(m.income.effective.amountMinor),
			forecastExpenses,
			effectiveExpenses,
		);
	}, 0);
	// Headroom so the tallest bar never touches the top edge; guard the all-zero case.
	const scale = peak > 0 ? plotHeight / (peak * 1.08) : 0;

	const groupWidth = months.length > 0 ? plotWidth / months.length : plotWidth;
	const barWidth = Math.min(18, Math.max(6, groupWidth / 4));
	const pairWidth = barWidth * 2 + SEGMENT_GAP * 4;
	const narrowWidth = barWidth * 0.5;

	const groups: MonthGroup[] = months.map((m, index) => {
		const groupX = left + index * groupWidth + (groupWidth - pairWidth) / 2;
		const expenseX = groupX + barWidth + SEGMENT_GAP * 4;

		const bar = (x: number, w: number, valueMinor: number, stackedBelowMinor = 0): Bar => {
			const barHeight = Math.max(0, major(valueMinor) * scale);
			const offset = major(stackedBelowMinor) * scale;
			const gap = stackedBelowMinor > 0 && barHeight > 0 ? SEGMENT_GAP : 0;
			return {
				x,
				y: baseline - offset - barHeight - gap,
				width: w,
				height: barHeight,
			};
		};

		const hasActual = m.hasAnyActual;
		const narrowIncomeX = groupX + (barWidth - narrowWidth) / 2;
		const narrowExpenseX = expenseX + (barWidth - narrowWidth) / 2;

		return {
			key: m.month,
			label: shortMonth(m.month),
			labelX: groupX + pairWidth / 2,
			hasActual,
			forecast: {
				income: bar(groupX, barWidth, m.income.forecast.amountMinor),
				recurring: bar(expenseX, barWidth, m.recurringTotal.forecast.amountMinor),
				oneTime: bar(expenseX, barWidth, m.oneTimeTotal.forecast.amountMinor, m.recurringTotal.forecast.amountMinor),
			},
			effective: hasActual
				? {
						income: bar(narrowIncomeX, narrowWidth, m.income.effective.amountMinor),
						recurring: bar(narrowExpenseX, narrowWidth, m.recurringTotal.effective.amountMinor),
						oneTime: bar(
							narrowExpenseX,
							narrowWidth,
							m.oneTimeTotal.effective.amountMinor,
							m.recurringTotal.effective.amountMinor,
						),
					}
				: null,
			tooltip: [
				shortMonth(m.month),
				`Wpływy: ${formatMoney(m.income.effective, "pl-PL")}`,
				`Wydatki stałe: ${formatMoney(m.recurringTotal.effective, "pl-PL")}`,
				`Wydatki jednorazowe: ${formatMoney(m.oneTimeTotal.effective, "pl-PL")}`,
				`Nadwyżka: ${formatMoney(m.surplus.effective, "pl-PL")}`,
			].join("\n"),
		};
	});

	return { groups, baseline, plotWidth, left, width, height, peakLabel: formatMoney(money(Math.round(peak * 100), props.currency), "pl-PL") };
});
</script>

<template>
	<svg :viewBox="`0 0 ${GEOMETRY.width} ${GEOMETRY.height}`" class="block h-[190px] w-full" role="img">
		<line
			:x1="chart.left"
			:y1="chart.baseline"
			:x2="chart.left + chart.plotWidth"
			:y2="chart.baseline"
			stroke="rgba(28,26,23,0.15)"
		/>
		<g v-for="group in chart.groups" :key="group.key">
			<title>{{ group.tooltip }}</title>
			<!-- Forecast: recessive when the month already has real numbers. -->
			<g :opacity="group.hasActual ? 0.3 : 1">
				<rect
					:x="group.forecast.income.x"
					:y="group.forecast.income.y"
					:width="group.forecast.income.width"
					:height="group.forecast.income.height"
					rx="3"
					:fill="COLORS.income"
				/>
				<rect
					:x="group.forecast.recurring.x"
					:y="group.forecast.recurring.y"
					:width="group.forecast.recurring.width"
					:height="group.forecast.recurring.height"
					:fill="COLORS.recurring"
				/>
				<rect
					:x="group.forecast.oneTime.x"
					:y="group.forecast.oneTime.y"
					:width="group.forecast.oneTime.width"
					:height="group.forecast.oneTime.height"
					rx="3"
					:fill="COLORS.oneTime"
				/>
			</g>
			<!-- Effective values overlaid, full strength. -->
			<g v-if="group.effective">
				<rect
					:x="group.effective.income.x"
					:y="group.effective.income.y"
					:width="group.effective.income.width"
					:height="group.effective.income.height"
					rx="2"
					:fill="COLORS.income"
				/>
				<rect
					:x="group.effective.recurring.x"
					:y="group.effective.recurring.y"
					:width="group.effective.recurring.width"
					:height="group.effective.recurring.height"
					:fill="COLORS.recurring"
				/>
				<rect
					:x="group.effective.oneTime.x"
					:y="group.effective.oneTime.y"
					:width="group.effective.oneTime.width"
					:height="group.effective.oneTime.height"
					rx="2"
					:fill="COLORS.oneTime"
				/>
			</g>
			<text
				:x="group.labelX"
				:y="GEOMETRY.height - 6"
				font-size="11"
				text-anchor="middle"
				fill="rgba(28,26,23,0.55)"
				font-family="Manrope, sans-serif"
			>
				{{ group.label }}
			</text>
		</g>
	</svg>
</template>
