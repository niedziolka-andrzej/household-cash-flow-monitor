import type { Month } from "../months";

export interface AllocateInvestmentArgs {
	/** Covered months, ascending — already the intersection of the investment config's
	 * range and the plan's range. */
	months: readonly Month[];
	/** Forecast surplus (income - expenses) per month, in minor currency units. May be negative. */
	forecastSurplusMinor: ReadonlyMap<Month, number>;
	/** Precondition (enforced by validation.ts before this runs): totalTargetMinor >=
	 * monthlyMinimumMinor * months.length. Violating it breaks the exact-sum guarantee. */
	totalTargetMinor: number;
	monthlyMinimumMinor: number;
}

/**
 * Allocates the investment target across the covered months:
 *   1. every month gets the minimum first,
 *   2. the remaining pool is split proportionally to each month's *positive* forecast
 *      surplus (months with a zero/negative surplus get only the minimum),
 *   3. the split uses the largest-remainder method in integer minor units so the
 *      result sums to exactly `totalTargetMinor` — never a cent more or less.
 */
export function allocateInvestment(args: AllocateInvestmentArgs): Map<Month, number> {
	const { months, forecastSurplusMinor, totalTargetMinor, monthlyMinimumMinor } = args;
	const result = new Map<Month, number>();
	if (months.length === 0) return result;

	const baseSum = monthlyMinimumMinor * months.length;
	const pool = Math.max(0, totalTargetMinor - baseSum);

	const weights = months.map((m) => Math.max(0, forecastSurplusMinor.get(m) ?? 0));
	const totalWeight = weights.reduce((sum, w) => sum + w, 0);

	const extra = new Array<number>(months.length).fill(0);

	if (pool > 0) {
		if (totalWeight > 0) {
			distributeProportionally(pool, weights, extra);
		} else {
			// No month has a positive surplus: split the pool evenly so the sum
			// invariant still holds, remainder groszy going to the earliest months.
			const evenShare = Math.floor(pool / months.length);
			let remainder = pool - evenShare * months.length;
			for (let i = 0; i < months.length; i++) {
				extra[i] = evenShare + (remainder > 0 ? 1 : 0);
				if (remainder > 0) remainder--;
			}
		}
	}

	months.forEach((m, i) => result.set(m, monthlyMinimumMinor + extra[i]));
	return result;
}

/** Largest-remainder method: floor(pool * w_i / W) for each i, then hand out the
 * leftover minor units (always < months.length, see proof below) to the months
 * with the largest fractional remainder, ties broken by earlier month first.
 * BigInt avoids precision loss in `pool * weight`, which can approach 2^53. */
function distributeProportionally(pool: number, weights: readonly number[], extra: number[]): void {
	const poolBig = BigInt(pool);
	const totalWeightBig = weights.reduce((sum, w) => sum + BigInt(w), 0n);

	const remainders: { index: number; remainder: bigint }[] = [];
	let allocated = 0n;
	for (let i = 0; i < weights.length; i++) {
		const product = poolBig * BigInt(weights[i]);
		const share = product / totalWeightBig;
		extra[i] = Number(share);
		allocated += share;
		remainders.push({ index: i, remainder: product % totalWeightBig });
	}

	// sum_i floor(pool*w_i/W) <= pool, and each term loses less than 1 full unit of
	// `pool`, so `leftover` is strictly less than weights.length: one pass suffices.
	let leftover = poolBig - allocated;
	remainders.sort((a, b) => {
		if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
		return a.index - b.index;
	});
	for (let i = 0; leftover > 0n; i++, leftover--) {
		extra[remainders[i].index] += 1;
	}
}
