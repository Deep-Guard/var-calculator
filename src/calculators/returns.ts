import { PriceHistory, TokenBalance, LPBalance, DailyReturn } from "../types";
import { estimateLPValueAtPrices } from "../fetchers/lp";

/**
 * Align multiple price histories to a common set of dates.
 * CoinGecko returns slightly different timestamps per coin — we bucket by date string.
 */
export function alignPriceHistories(
  histories: PriceHistory[]
): Map<string, Map<string, number>> {
  // date (YYYY-MM-DD) → coingeckoId → price
  const aligned = new Map<string, Map<string, number>>();

  for (const history of histories) {
    for (const [ts, price] of history.prices) {
      const date = new Date(ts).toISOString().slice(0, 10);
      if (!aligned.has(date)) {
        aligned.set(date, new Map());
      }
      aligned.get(date)!.set(history.coingeckoId, price);
    }
  }

  return aligned;
}

/**
 * Calculate portfolio value on each historical date.
 * Combines token balances and LP positions, using historical prices.
 */
export function calculateHistoricalPortfolioValues(
  tokenBalances: TokenBalance[],
  lpBalances: LPBalance[],
  priceHistories: Map<string, PriceHistory>,
  alignedPrices: Map<string, Map<string, number>>
): Map<string, number> {
  const portfolioValues = new Map<string, number>();

  // Sort dates ascending
  const sortedDates = Array.from(alignedPrices.keys()).sort();

  for (const date of sortedDates) {
    const dayPrices = alignedPrices.get(date)!;
    let totalValue = 0;

    // Token balances: quantity is fixed (we use current balance as the position)
    for (const balance of tokenBalances) {
      const price = dayPrices.get(balance.token.coingeckoId);
      if (price !== undefined) {
        totalValue += balance.formattedBalance * price;
      }
    }

    // LP positions: use the constant-product formula to estimate historical value
    for (const lp of lpBalances) {
      const price0 = dayPrices.get(lp.config.token0.coingeckoId);
      const price1 = dayPrices.get(lp.config.token1.coingeckoId);

      if (price0 !== undefined && price1 !== undefined) {
        const historicalValue = estimateLPValueAtPrices(
          lp.shareOfPool,
          lp.token0Amount / lp.shareOfPool, // full pool reserve0
          lp.token1Amount / lp.shareOfPool, // full pool reserve1
          lp.token0PriceUsd,
          lp.token1PriceUsd,
          price0,
          price1
        );
        totalValue += historicalValue;
      }
    }

    if (totalValue > 0) {
      portfolioValues.set(date, totalValue);
    }
  }

  return portfolioValues;
}

/**
 * Calculate daily percentage returns from a time series of portfolio values.
 * Returns are sorted ascending by date.
 */
export function calculateDailyReturns(
  portfolioValues: Map<string, number>
): DailyReturn[] {
  const sorted = Array.from(portfolioValues.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const returns: DailyReturn[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const [date, currentValue] = sorted[i];
    const [, prevValue] = sorted[i - 1];

    if (prevValue > 0) {
      returns.push({
        date,
        portfolioValueUsd: currentValue,
        returnPct: (currentValue - prevValue) / prevValue,
      });
    }
  }

  return returns;
}

/**
 * Calculate daily returns for a single asset across its historical prices.
 */
export function calculateAssetDailyReturns(
  history: PriceHistory,
  currentAmount: number
): DailyReturn[] {
  const sorted = [...history.prices].sort(([a], [b]) => a - b);
  const returns: DailyReturn[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const [ts, currentPrice] = sorted[i];
    const [, prevPrice] = sorted[i - 1];

    if (prevPrice > 0) {
      returns.push({
        date: new Date(ts).toISOString().slice(0, 10),
        portfolioValueUsd: currentAmount * currentPrice,
        returnPct: (currentPrice - prevPrice) / prevPrice,
      });
    }
  }

  return returns;
}
