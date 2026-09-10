import { DailyReturn, VarResult, VarConfig } from "../types";

/**
 * Historical Simulation VaR.
 *
 * Methodology:
 * 1. Collect the last N daily portfolio returns (as percentages)
 * 2. Sort them ascending (worst to best)
 * 3. Take the return at the (1 - confidence) percentile
 * 4. That is the 1-day VaR return — multiply by current portfolio value for dollar VaR
 * 5. Scale to multi-day VaR using the square-root-of-time rule: VaR(T) = VaR(1) * sqrt(T)
 *
 * Note: The square-root-of-time scaling assumes i.i.d. returns, which is a
 * simplification. For more accurate multi-day VaR, use Monte Carlo simulation.
 */
export function calculateHistoricalVaR(
  dailyReturns: DailyReturn[],
  currentPortfolioValue: number,
  config: VarConfig
): VarResult[] {
  if (dailyReturns.length < 30) {
    throw new Error(
      `Insufficient data: need at least 30 daily returns, got ${dailyReturns.length}. ` +
        `Increase lookbackDays in your config.`
    );
  }

  // Sort returns ascending (worst first)
  const sortedReturns = [...dailyReturns]
    .map((r) => r.returnPct)
    .sort((a, b) => a - b);

  const results: VarResult[] = [];

  for (const confidenceLevel of config.confidenceLevels) {
    // Index into the sorted array for the loss threshold
    // e.g. at 95% confidence with 100 observations → index 4 (5th worst day)
    const index = Math.floor((1 - confidenceLevel) * sortedReturns.length);
    const oneDayReturnAtPercentile = sortedReturns[Math.max(index, 0)];

    // VaR is expressed as a positive loss amount
    const oneDayVarPct = Math.abs(Math.min(oneDayReturnAtPercentile, 0));
    const oneDayVarUsd = oneDayVarPct * currentPortfolioValue;

    for (const horizon of config.horizons) {
      // Scale by sqrt(T) for multi-day horizons
      const scaledVarPct = oneDayVarPct * Math.sqrt(horizon);
      const scaledVarUsd = oneDayVarUsd * Math.sqrt(horizon);

      results.push({
        confidenceLevel,
        horizon,
        valueAtRiskUsd: scaledVarUsd,
        valueAtRiskPct: scaledVarPct,
      });
    }
  }

  return results;
}

/**
 * Calculate additional descriptive statistics about the return distribution.
 * Useful for the report's context section.
 */
export function calculateReturnStatistics(dailyReturns: DailyReturn[]): {
  mean: number;
  stdDev: number;
  minReturn: number;
  maxReturn: number;
  positivedays: number;
  negativeDays: number;
  worstDay: DailyReturn;
  bestDay: DailyReturn;
} {
  const returns = dailyReturns.map((r) => r.returnPct);

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  const sorted = [...dailyReturns].sort((a, b) => a.returnPct - b.returnPct);

  return {
    mean,
    stdDev,
    minReturn: Math.min(...returns),
    maxReturn: Math.max(...returns),
    positivedays: returns.filter((r) => r > 0).length,
    negativeDays: returns.filter((r) => r < 0).length,
    worstDay: sorted[0],
    bestDay: sorted[sorted.length - 1],
  };
}

/**
 * Build a simple return distribution histogram (for terminal/HTML display).
 * Returns an array of buckets with label and count.
 */
export function buildReturnHistogram(
  dailyReturns: DailyReturn[],
  buckets = 10
): { label: string; count: number; pct: number }[] {
  const returns = dailyReturns.map((r) => r.returnPct);
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const bucketSize = (max - min) / buckets;

  const counts = Array(buckets).fill(0) as number[];
  for (const r of returns) {
    const idx = Math.min(Math.floor((r - min) / bucketSize), buckets - 1);
    counts[idx]++;
  }

  return counts.map((count, i) => {
    const lo = (min + i * bucketSize) * 100;
    const hi = (min + (i + 1) * bucketSize) * 100;
    return {
      label: `${lo.toFixed(1)}% to ${hi.toFixed(1)}%`,
      count,
      pct: count / returns.length,
    };
  });
}
