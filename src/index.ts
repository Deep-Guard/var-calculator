#!/usr/bin/env node
import "dotenv/config";
import fs from "fs";
import path from "path";
import { Command } from "commander";
import chalk from "chalk";
import { ethers } from "ethers";

import { Config, PortfolioReport, AssetBreakdown, AssetVarResult } from "./types";
import { fetchCurrentPrices, fetchAllHistoricalPrices } from "./fetchers/prices";
import { fetchAllBalances } from "./fetchers/balances";
import { fetchAllLPPositions } from "./fetchers/lp";
import {
  alignPriceHistories,
  calculateHistoricalPortfolioValues,
  calculateDailyReturns,
  calculateAssetDailyReturns,
} from "./calculators/returns";
import { calculateHistoricalVaR, calculateReturnStatistics } from "./calculators/var";
import { printReport } from "./reporters/terminal";
import { writeHtmlReport } from "./reporters/html";
import { writeJsonReport } from "./reporters/json";

const METHODOLOGY = `Historical Simulation VaR
─────────────────────────
1. Current on-chain token and LP balances are fetched via an Ethereum RPC node.
2. Historical daily prices are sourced from CoinGecko for each asset.
3. Daily portfolio P&L returns are calculated over the lookback period.
   For LP positions, the constant-product formula (x*y=k) is applied to
   estimate portfolio value at each historical price point, correctly
   accounting for impermanent loss across the price path.
4. Returns are sorted ascending. The (1 - confidence) percentile return
   is taken as the 1-day VaR threshold.
5. Multi-day VaR is scaled using the square-root-of-time rule: VaR(T) = VaR(1) * sqrt(T).
   This assumes independent, identically distributed returns — a simplification.
   For non-normal or autocorrelated return distributions, consider Monte Carlo simulation.

This report is for informational purposes only and does not constitute financial advice.
For a professional risk assessment, contact Deep Guard: getaudited@deepguard.xyz`;

async function run(configPath: string, options: { html: boolean; json: boolean; output: string }) {
  // ── Load config ────────────────────────────────────────────────────────────
  const configFile = path.resolve(configPath);
  if (!fs.existsSync(configFile)) {
    console.error(chalk.red(`Config file not found: ${configFile}`));
    process.exit(1);
  }

  const config: Config = JSON.parse(fs.readFileSync(configFile, "utf-8"));

  // Override RPC from env if not set in config
  if (!config.rpc && process.env.RPC_URL) {
    config.rpc = process.env.RPC_URL;
  }

  if (!config.rpc) {
    console.error(chalk.red("No RPC URL provided. Set RPC_URL in .env or add rpc to your config."));
    process.exit(1);
  }

  const outputDir = options.output || config.outputDir || "./reports";

  console.log(chalk.bold.white("\nDeep Guard — Value at Risk Calculator"));
  console.log(chalk.gray("─".repeat(50)));

  // ── Connect provider ───────────────────────────────────────────────────────
  const provider = new ethers.JsonRpcProvider(config.rpc);
  const network = await provider.getNetwork();
  console.log(chalk.gray(`Connected to chain ID ${network.chainId}\n`));

  // ── Collect unique coins needed ────────────────────────────────────────────
  const coinSet = new Map<string, { coingeckoId: string; symbol: string }>();

  for (const token of config.tokens) {
    coinSet.set(token.coingeckoId, { coingeckoId: token.coingeckoId, symbol: token.symbol });
  }

  for (const lp of config.lpPositions ?? []) {
    coinSet.set(lp.token0.coingeckoId, { coingeckoId: lp.token0.coingeckoId, symbol: lp.token0.symbol });
    coinSet.set(lp.token1.coingeckoId, { coingeckoId: lp.token1.coingeckoId, symbol: lp.token1.symbol });
  }

  const coins = Array.from(coinSet.values());

  // ── Fetch current prices ───────────────────────────────────────────────────
  console.log(chalk.bold("Fetching current prices..."));
  const currentPrices = await fetchCurrentPrices(coins.map((c) => c.coingeckoId));
  for (const [id, price] of currentPrices) {
    const sym = coinSet.get(id)?.symbol ?? id;
    console.log(chalk.gray(`  ${sym.padEnd(12)} $${price.toFixed(4)}`));
  }

  // ── Fetch on-chain balances ────────────────────────────────────────────────
  console.log(chalk.bold("\nFetching on-chain balances..."));
  const tokenBalances = await fetchAllBalances(provider, config.wallets, config.tokens, currentPrices);
  for (const b of tokenBalances) {
    console.log(
      chalk.gray(
        `  ${b.token.symbol.padEnd(10)} ${b.formattedBalance.toFixed(4).padStart(16)} @ $${b.currentPriceUsd.toFixed(2)} = $${b.valueUsd.toFixed(2)}`
      )
    );
  }

  // ── Fetch LP positions ─────────────────────────────────────────────────────
  const lpBalances = config.lpPositions?.length
    ? (console.log(chalk.bold("\nFetching LP positions...")),
       await fetchAllLPPositions(provider, config.lpPositions, currentPrices))
    : [];

  // ── Total portfolio value ──────────────────────────────────────────────────
  const totalValueUsd =
    tokenBalances.reduce((s, b) => s + b.valueUsd, 0) +
    lpBalances.reduce((s, b) => s + b.valueUsd, 0);

  console.log(chalk.bold(`\nTotal portfolio value: ${chalk.green(`$${totalValueUsd.toFixed(2)}`)}`));

  // ── Fetch historical prices ────────────────────────────────────────────────
  console.log(chalk.bold(`\nFetching ${config.var.lookbackDays}-day price history...`));
  const priceHistories = await fetchAllHistoricalPrices(coins, config.var.lookbackDays);

  // ── Calculate portfolio returns ────────────────────────────────────────────
  const alignedPrices = alignPriceHistories(Array.from(priceHistories.values()));
  const portfolioValues = calculateHistoricalPortfolioValues(
    tokenBalances,
    lpBalances,
    priceHistories,
    alignedPrices
  );
  const dailyReturns = calculateDailyReturns(portfolioValues);

  console.log(chalk.gray(`\n  ${dailyReturns.length} daily returns computed`));

  const stats = calculateReturnStatistics(dailyReturns);
  console.log(chalk.gray(`  Mean daily return:  ${(stats.mean * 100).toFixed(2)}%`));
  console.log(chalk.gray(`  Std deviation:      ${(stats.stdDev * 100).toFixed(2)}%`));
  console.log(chalk.gray(`  Worst day:          ${stats.worstDay.date} (${(stats.worstDay.returnPct * 100).toFixed(2)}%)`));
  console.log(chalk.gray(`  Best day:           ${stats.bestDay.date} (+${(stats.bestDay.returnPct * 100).toFixed(2)}%)`));

  // ── Calculate portfolio VaR ────────────────────────────────────────────────
  const portfolioVar = calculateHistoricalVaR(dailyReturns, totalValueUsd, config.var);

  // ── Per-asset VaR ──────────────────────────────────────────────────────────
  const assetVar: AssetVarResult[] = [];

  for (const balance of tokenBalances) {
    const history = priceHistories.get(balance.token.coingeckoId);
    if (!history) continue;
    const assetReturns = calculateAssetDailyReturns(history, balance.formattedBalance);
    if (assetReturns.length < 30) continue;
    const varResults = calculateHistoricalVaR(assetReturns, balance.valueUsd, config.var);
    assetVar.push({
      label: `${balance.token.symbol} (${balance.wallet.label})`,
      currentValueUsd: balance.valueUsd,
      varResults,
    });
  }

  // ── Build asset breakdown ──────────────────────────────────────────────────
  const assets: AssetBreakdown[] = [];

  // Group token balances by wallet+token label
  for (const balance of tokenBalances) {
    assets.push({
      label: `${balance.token.symbol} — ${balance.wallet.label}`,
      type: "token",
      valueUsd: balance.valueUsd,
      allocationPct: balance.valueUsd / totalValueUsd,
      tokens: [
        {
          symbol: balance.token.symbol,
          amount: balance.formattedBalance,
          priceUsd: balance.currentPriceUsd,
          valueUsd: balance.valueUsd,
        },
      ],
    });
  }

  for (const lp of lpBalances) {
    assets.push({
      label: lp.config.label,
      type: "lp",
      valueUsd: lp.valueUsd,
      allocationPct: lp.valueUsd / totalValueUsd,
      tokens: [
        {
          symbol: lp.config.token0.symbol,
          amount: lp.token0Amount,
          priceUsd: lp.token0PriceUsd,
          valueUsd: lp.token0Amount * lp.token0PriceUsd,
        },
        {
          symbol: lp.config.token1.symbol,
          amount: lp.token1Amount,
          priceUsd: lp.token1PriceUsd,
          valueUsd: lp.token1Amount * lp.token1PriceUsd,
        },
      ],
    });
  }

  // ── Assemble report ────────────────────────────────────────────────────────
  const report: PortfolioReport = {
    generatedAt: new Date().toISOString(),
    protocolName: config.protocolName ?? "Protocol",
    totalValueUsd,
    assets,
    dailyReturns,
    portfolioVar,
    assetVar,
    methodology: METHODOLOGY,
    lookbackDays: config.var.lookbackDays,
    dataSource: "CoinGecko",
  };

  // ── Output ─────────────────────────────────────────────────────────────────
  printReport(report);

  if (options.json) {
    const jsonPath = writeJsonReport(report, outputDir);
    console.log(chalk.gray(`JSON report written: ${jsonPath}`));
  }

  if (options.html) {
    const htmlPath = writeHtmlReport(report, outputDir);
    console.log(chalk.green(`HTML report written: ${htmlPath}`));
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("var-calc")
  .description("Value at Risk calculator for on-chain treasury and LP positions")
  .version("1.0.0")
  .argument("<config>", "Path to your config JSON file")
  .option("--html", "Write an HTML report to the output directory", false)
  .option("--json", "Write a JSON report to the output directory", false)
  .option("--output <dir>", "Output directory for reports", "./reports")
  .action((configPath: string, options: { html: boolean; json: boolean; output: string }) => {
    run(configPath, options).catch((err) => {
      console.error(chalk.red("\nError: " + (err instanceof Error ? err.message : String(err))));
      process.exit(1);
    });
  });

program.parse();
