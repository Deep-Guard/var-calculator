// ─── Config Types ────────────────────────────────────────────────────────────

export interface TokenConfig {
  /** ERC20 contract address, or "native" for ETH/MATIC/etc. */
  address: string;
  symbol: string;
  /** CoinGecko coin ID — e.g. "ethereum", "usd-coin", "wrapped-bitcoin" */
  coingeckoId: string;
  decimals: number;
}

export interface WalletConfig {
  address: string;
  label: string;
}

export interface LPPositionConfig {
  protocol: "uniswap-v2";
  poolAddress: string;
  walletAddress: string;
  token0: TokenConfig;
  token1: TokenConfig;
  label: string;
}

export interface VarConfig {
  /** e.g. [0.95, 0.99] */
  confidenceLevels: number[];
  /** Number of historical days to use for simulation */
  lookbackDays: number;
  /** e.g. [1, 7] for 1-day and 7-day VaR */
  horizons: number[];
}

export interface Config {
  rpc: string;
  wallets: WalletConfig[];
  tokens: TokenConfig[];
  lpPositions?: LPPositionConfig[];
  var: VarConfig;
  /** Directory to write reports (default: ./reports) */
  outputDir?: string;
  /** Protocol or team name shown on the report */
  protocolName?: string;
}

// ─── Runtime Data Types ───────────────────────────────────────────────────────

export interface TokenBalance {
  token: TokenConfig;
  wallet: WalletConfig;
  rawBalance: bigint;
  formattedBalance: number;
  currentPriceUsd: number;
  valueUsd: number;
}

export interface LPBalance {
  config: LPPositionConfig;
  token0Amount: number;
  token1Amount: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
  valueUsd: number;
  shareOfPool: number;
}

export interface PriceHistory {
  coingeckoId: string;
  symbol: string;
  /** Array of [timestamp_ms, price_usd] */
  prices: [number, number][];
}

export interface DailyReturn {
  date: string;
  portfolioValueUsd: number;
  returnPct: number;
}

export interface VarResult {
  confidenceLevel: number;
  horizon: number;
  /** Absolute dollar loss */
  valueAtRiskUsd: number;
  /** As a percentage of current portfolio value */
  valueAtRiskPct: number;
}

export interface AssetVarResult {
  label: string;
  currentValueUsd: number;
  varResults: VarResult[];
}

export interface PortfolioReport {
  generatedAt: string;
  protocolName: string;
  totalValueUsd: number;
  assets: AssetBreakdown[];
  dailyReturns: DailyReturn[];
  portfolioVar: VarResult[];
  assetVar: AssetVarResult[];
  methodology: string;
  lookbackDays: number;
  dataSource: string;
}

export interface AssetBreakdown {
  label: string;
  type: "token" | "lp";
  valueUsd: number;
  allocationPct: number;
  tokens: { symbol: string; amount: number; priceUsd: number; valueUsd: number }[];
}
