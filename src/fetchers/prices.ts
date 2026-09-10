import axios from "axios";
import { PriceHistory } from "../types";

const BASE_URL = "https://api.coingecko.com/api/v3";
const PRO_BASE_URL = "https://pro-api.coingecko.com/api/v3";

function getBaseUrl(): string {
  return process.env.COINGECKO_API_KEY ? PRO_BASE_URL : BASE_URL;
}

function buildHeaders(): Record<string, string> {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { "x-cg-pro-api-key": key } : {};
}

/** Pause execution for ms milliseconds — used to respect CoinGecko rate limits */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch historical daily prices for a coin from CoinGecko.
 * Returns [timestamp_ms, price_usd] pairs.
 */
export async function fetchHistoricalPrices(
  coingeckoId: string,
  symbol: string,
  days: number
): Promise<PriceHistory> {
  const url = `${getBaseUrl()}/coins/${coingeckoId}/market_chart`;

  try {
    const response = await axios.get(url, {
      headers: buildHeaders(),
      params: {
        vs_currency: "usd",
        days: days,
        interval: "daily",
      },
    });

    const prices: [number, number][] = response.data.prices;

    // CoinGecko returns one price per day; the last entry is the current price
    return { coingeckoId, symbol, prices };
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      console.warn(`  Rate limited by CoinGecko. Waiting 60s before retrying ${symbol}...`);
      await wait(60_000);
      return fetchHistoricalPrices(coingeckoId, symbol, days);
    }
    throw new Error(
      `Failed to fetch prices for ${symbol} (${coingeckoId}): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Fetch current USD prices for multiple coins in a single request.
 * Returns a map of coingeckoId → price_usd.
 */
export async function fetchCurrentPrices(
  coingeckoIds: string[]
): Promise<Map<string, number>> {
  const url = `${getBaseUrl()}/simple/price`;

  const response = await axios.get(url, {
    headers: buildHeaders(),
    params: {
      ids: coingeckoIds.join(","),
      vs_currencies: "usd",
    },
  });

  const priceMap = new Map<string, number>();
  for (const id of coingeckoIds) {
    const price = response.data[id]?.usd;
    if (price !== undefined) {
      priceMap.set(id, price);
    }
  }

  return priceMap;
}

/**
 * Fetch historical prices for multiple coins, with a wait between requests
 * to stay within CoinGecko's free-tier rate limit (10–30 calls/min).
 */
export async function fetchAllHistoricalPrices(
  coins: { coingeckoId: string; symbol: string }[],
  days: number,
  waitMs = 2_000
): Promise<Map<string, PriceHistory>> {
  const results = new Map<string, PriceHistory>();

  for (const coin of coins) {
    process.stdout.write(`  Fetching ${coin.symbol} price history...`);
    const history = await fetchHistoricalPrices(coin.coingeckoId, coin.symbol, days);
    results.set(coin.coingeckoId, history);
    process.stdout.write(` ${history.prices.length} days\n`);

    if (coins.indexOf(coin) < coins.length - 1) {
      await wait(waitMs);
    }
  }

  return results;
}
