import { ethers } from "ethers";
import { LPPositionConfig, LPBalance } from "../types";

const UNISWAP_V2_PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function decimals() view returns (uint8)",
];

/**
 * Fetch Uniswap v2 LP position details.
 * Calculates what share of the pool the wallet owns and the USD value.
 */
export async function fetchUniswapV2Position(
  provider: ethers.JsonRpcProvider,
  config: LPPositionConfig,
  token0PriceUsd: number,
  token1PriceUsd: number
): Promise<LPBalance> {
  const pair = new ethers.Contract(config.poolAddress, UNISWAP_V2_PAIR_ABI, provider);

  const [reserves, totalSupply, walletLpBalance] = await Promise.all([
    pair.getReserves(),
    pair.totalSupply(),
    pair.balanceOf(config.walletAddress),
  ]);

  const lpDecimals = 18; // Uniswap v2 LP tokens always have 18 decimals
  const totalSupplyFormatted = Number(ethers.formatUnits(totalSupply, lpDecimals));
  const walletLpFormatted = Number(ethers.formatUnits(walletLpBalance, lpDecimals));

  const shareOfPool = totalSupplyFormatted > 0 ? walletLpFormatted / totalSupplyFormatted : 0;

  const reserve0Formatted = Number(
    ethers.formatUnits(reserves.reserve0, config.token0.decimals)
  );
  const reserve1Formatted = Number(
    ethers.formatUnits(reserves.reserve1, config.token1.decimals)
  );

  const token0Amount = reserve0Formatted * shareOfPool;
  const token1Amount = reserve1Formatted * shareOfPool;
  const valueUsd = token0Amount * token0PriceUsd + token1Amount * token1PriceUsd;

  return {
    config,
    token0Amount,
    token1Amount,
    token0PriceUsd,
    token1PriceUsd,
    valueUsd,
    shareOfPool,
  };
}

/**
 * For Uniswap v2, estimate LP value at a given set of historical prices.
 * Uses the constant-product formula: V = 2 * sqrt(k * p0 * p1)
 * where k = reserve0 * reserve1 at time of snapshot, adjusted for share.
 *
 * This correctly accounts for impermanent loss across price paths.
 */
export function estimateLPValueAtPrices(
  shareOfPool: number,
  currentReserve0: number,
  currentReserve1: number,
  currentPrice0: number,
  currentPrice1: number,
  historicalPrice0: number,
  historicalPrice1: number
): number {
  // k (constant product) is invariant in the pool
  const k = currentReserve0 * currentReserve1;

  // At historical prices, the pool's reserves adjust to maintain k
  // x * y = k, and price ratio = historicalPrice0 / historicalPrice1
  // So x = sqrt(k * historicalPrice1 / historicalPrice0)
  //    y = sqrt(k * historicalPrice0 / historicalPrice1)
  const priceRatio = historicalPrice0 / historicalPrice1;
  const historicalReserve0 = Math.sqrt(k / priceRatio);
  const historicalReserve1 = Math.sqrt(k * priceRatio);

  const poolValueUsd =
    historicalReserve0 * historicalPrice0 + historicalReserve1 * historicalPrice1;

  return poolValueUsd * shareOfPool;
}

/**
 * Fetch all LP positions.
 */
export async function fetchAllLPPositions(
  provider: ethers.JsonRpcProvider,
  positions: LPPositionConfig[],
  currentPrices: Map<string, number>
): Promise<LPBalance[]> {
  const results: LPBalance[] = [];

  for (const position of positions) {
    const token0Price = currentPrices.get(position.token0.coingeckoId) ?? 0;
    const token1Price = currentPrices.get(position.token1.coingeckoId) ?? 0;

    process.stdout.write(`  Fetching LP position: ${position.label}...`);
    const balance = await fetchUniswapV2Position(
      provider,
      position,
      token0Price,
      token1Price
    );
    process.stdout.write(` $${balance.valueUsd.toFixed(2)}\n`);

    if (balance.valueUsd >= 0.01) {
      results.push(balance);
    }
  }

  return results;
}
