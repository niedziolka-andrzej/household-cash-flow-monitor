<script setup lang="ts">
import { computed } from "vue";
import { formatMoney } from "../../shared/money";
import type { MonthlyResult } from "../../shared/types";

/**
 * The cumulative-balance path: dashed line for the forecast, solid for the effective
 * (actual-driven) balance, and an orange band under the zero line so the months where the
 * account goes negative are visible as a region rather than only as a red number.
 *
 * The solid line stops at the last month that has actuals or a manual override — beyond
 * that there is no reality to draw, and continuing it would imply certainty that isn't there.
 */
const props = defineProps<{ months: MonthlyResult[] }>();

const GEOMETRY = { width: 560, height: 190, left: 52, right: 10, top: 18, bottom: 26 };

const monthFormatter = new Intl.DateTimeFormat("pl-PL", { month: "short" });
function shortMonth(month: string): string {
	const [year, m] = month.split("-").map(Number);
	return monthFormatter.format(new Date(year, m - 1, 1));
}

const chart = computed(() => {
	const { width, height, left, right, top, bottom } = GEOMETRY;
	const plotWidth = width - left - right;
	const plotHeight = height - top - bottom;
	const months = props.months;

	const lastRealIndex = months.reduce(
		(last, m, index) => (m.hasAnyActual || m.hasOverride ? index : last),
		-1,
	);

	const major = (minor: number) => minor / 100;
	const forecastValues = months.map((m) => major(m.cumulativeBalance.forecast.amountMinor));
	const effectiveValues = months.map((m) => major(m.cumulativeBalance.effective.amountMinor));
	const drawnEffective = effectiveValues.slice(0, lastRealIndex + 1);

	const domainValues = [...forecastValues, ...drawnEffective, 0];
	const maxValue = Math.max(...domainValues);
	const minValue = Math.min(...domainValues);
	const padding = (maxValue - minValue) * 0.2 || 200;
	const domainMax = maxValue + padding;
	const domainMin = minValue - padding;

	const y = (value: number) => top + ((domainMax - value) / (domainMax - domainMin)) * plotHeight;
	const x = (index: number) => (months.length > 1 ? left + index * (plotWidth / (months.length - 1)) : left + plotWidth / 2);
	const zeroY = y(0);

	return {
		zeroY,
		hasNegative: minValue < 0,
		negativeBand: { x: left, y: zeroY, width: plotWidth, height: Math.max(0, top + plotHeight - zeroY) },
		axisRight: left + plotWidth,
		forecastPath: months.map((_, i) => `${x(i)},${y(forecastValues[i])}`).join(" "),
		forecastPoints: months.map((m, i) => ({ key: m.month, cx: x(i), cy: y(forecastValues[i]) })),
		effectivePath: drawnEffective.map((value, i) => `${x(i)},${y(value)}`).join(" "),
		effectivePoints: drawnEffective.map((value, i) => ({
			key: months[i].month,
			cx: x(i),
			cy: y(value),
			negative: value < 0,
			label: formatMoney(months[i].cumulativeBalance.effective, "pl-PL"),
		})),
		monthLabels: months.map((m, i) => ({ key: m.month, x: x(i), label: shortMonth(m.month) })),
		tooltips: months.map((m, i) => ({
			key: m.month,
			x: x(i) - 12,
			text: [
				shortMonth(m.month),
				`Prognoza: ${formatMoney(m.cumulativeBalance.forecast, "pl-PL")}`,
				`Wykonanie: ${formatMoney(m.cumulativeBalance.effective, "pl-PL")}`,
			].join("\n"),
		})),
	};
});
</script>

<template>
	<svg :viewBox="`0 0 ${GEOMETRY.width} ${GEOMETRY.height}`" class="block h-[190px] w-full" role="img">
		<rect
			v-if="chart.hasNegative"
			:x="chart.negativeBand.x"
			:y="chart.negativeBand.y"
			:width="chart.negativeBand.width"
			:height="chart.negativeBand.height"
			fill="rgba(194,65,12,0.08)"
		/>
		<line
			:x1="GEOMETRY.left"
			:y1="chart.zeroY"
			:x2="chart.axisRight"
			:y2="chart.zeroY"
			stroke="rgba(28,26,23,0.25)"
			stroke-dasharray="4 4"
		/>
		<text
			:x="GEOMETRY.left - 8"
			:y="chart.zeroY + 4"
			font-size="11"
			text-anchor="end"
			fill="rgba(28,26,23,0.45)"
			font-family="Manrope, sans-serif"
		>
			0 zł
		</text>

		<polyline
			:points="chart.forecastPath"
			fill="none"
			stroke="rgba(67,56,202,0.4)"
			stroke-width="2"
			stroke-dasharray="5 4"
		/>
		<circle
			v-for="point in chart.forecastPoints"
			:key="`f-${point.key}`"
			:cx="point.cx"
			:cy="point.cy"
			r="3.5"
			fill="#faf7f0"
			stroke="rgba(67,56,202,0.5)"
			stroke-width="1.5"
		/>

		<polyline v-if="chart.effectivePath" :points="chart.effectivePath" fill="none" stroke="#4338ca" stroke-width="2.5" />
		<g v-for="point in chart.effectivePoints" :key="`a-${point.key}`">
			<!-- 2px surface ring keeps the marker readable where it overlaps the forecast line. -->
			<circle :cx="point.cx" :cy="point.cy" r="4.5" :fill="point.negative ? '#c2410c' : '#4338ca'" stroke="#fff" stroke-width="2" />
			<text
				:x="point.cx"
				:y="point.cy + (point.negative ? 18 : -11)"
				font-size="11"
				text-anchor="middle"
				font-weight="600"
				:fill="point.negative ? '#c2410c' : '#4338ca'"
				font-family="Manrope, sans-serif"
			>
				{{ point.label }}
			</text>
		</g>

		<text
			v-for="label in chart.monthLabels"
			:key="`m-${label.key}`"
			:x="label.x"
			:y="GEOMETRY.height - 6"
			font-size="11"
			text-anchor="middle"
			fill="rgba(28,26,23,0.55)"
			font-family="Manrope, sans-serif"
		>
			{{ label.label }}
		</text>

		<!-- Invisible hit strips give each month a hover tooltip across the full plot height. -->
		<rect
			v-for="tip in chart.tooltips"
			:key="`t-${tip.key}`"
			:x="tip.x"
			:y="GEOMETRY.top"
			width="24"
			:height="GEOMETRY.height - GEOMETRY.top - GEOMETRY.bottom"
			fill="transparent"
		>
			<title>{{ tip.text }}</title>
		</rect>
	</svg>
</template>
