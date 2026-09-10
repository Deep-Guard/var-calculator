import chalk from "chalk";
import {
  PortfolioReport,
  VarResult,
  AssetBreakdown,
} from "../types";
import { buildReturnHistogram } from "../calculators/var";

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

function divider(char = "─", width = 70): string {
  return chalk.gray(char.repeat(width));
}

function confidenceLabel(level: number): string {
  return `${(level * 100).toFixed(0)}%`;
}

function printVarTable(varResults: VarResult[]): void {
  const horizons = [...new Set(varResults.map((r) => r.horizon))].sort(
    (a, b) => a - b
  );
  const confidences = [...new Set(varResults.map((r) => r.confidenceLevel))].sort(
    (a, b) => a - b
  );

  // Header row
  const header = ["", ...horizons.map((h) => `${h}-Day VaR`)].map((h) =>
    chalk.bold.white(h.padEnd(20))
  );
  console.log(header.join(""));
  console.log(divider("─", header.join("").replace(/\x1B\[[0-9;]*m/g, "").length));

  for (const conf of confidences) {
    const row = [chalk.cyan(`${confidenceLabel(conf)} Confidence`.padEnd(20))];
    for (const horizon of horizons) {
      const result = varResults.find(
        (r) => r.confidenceLevel === conf && r.horizon === horizon
      );
      if (result) {
        const usd = formatUsd(result.valueAtRiskUsd);
        const pct = formatPct(result.valueAtRiskPct);
        row.push(chalk.yellow(`${usd} (${pct})`.padEnd(20)));
      }
    }
    console.log(row.join(""));
  }
}

function printHistogram(dailyReturns: { returnPct: number }[]): void {
  const histogram = buildReturnHistogram(
    dailyReturns.map((r, i) => ({ date: String(i), portfolioValueUsd: 0, returnPct: r.returnPct }))
  );
  const maxCount = Math.max(...histogram.map((b) => b.count));
  const barWidth = 30;

  for (const bucket of histogram) {
    const barLen = Math.round((bucket.count / maxCount) * barWidth);
    const bar = "█".repeat(barLen);
    const color = bucket.label.startsWith("-") ? chalk.red : chalk.green;
    const label = bucket.label.padEnd(22);
    const countStr = chalk.gray(` ${bucket.count}`);
    console.log(`  ${chalk.gray(label)} ${color(bar)}${countStr}`);
  }
}

export function printReport(report: PortfolioReport): void {
  console.log("\n");
  console.log(divider("═"));
  console.log(
    chalk.bold.white(
      `  Value at Risk Report — ${report.protocolName}`
    )
  );
  console.log(chalk.gray(`  Generated: ${report.generatedAt}`));
  console.log(chalk.gray(`  Lookback:  ${report.lookbackDays} days   |   Data: ${report.dataSource}`));
  console.log(divider("═"));

  // ── Portfolio Summary ──────────────────────────────────────────────────────
  console.log("\n" + chalk.bold.white("  PORTFOLIO SUMMARY\n"));
  console.log(
    `  Total Value:  ${chalk.bold.green(formatUsd(report.totalValueUsd))}`
  );
  console.log(`  Assets:       ${report.assets.length}`);
  console.log(`  Daily Returns Analysed: ${report.dailyReturns.length}\n`);

  // ── Asset Breakdown ────────────────────────────────────────────────────────
  console.log(chalk.bold.white("  ASSET BREAKDOWN\n"));
  for (const asset of report.assets) {
    const typeTag =
      asset.type === "lp"
        ? chalk.magenta("[LP]")
        : chalk.blue("[Token]");
    console.log(
      `  ${typeTag} ${chalk.white(asset.label.padEnd(30))} ${chalk.green(
        formatUsd(asset.valueUsd)
      )} ${chalk.gray(`(${formatPct(asset.allocationPct)})`)}`
    );
    for (const t of asset.tokens) {
      console.log(
        chalk.gray(
          `         ${t.symbol.padEnd(10)} ${t.amount.toFixed(4).padStart(14)} @ ${formatUsd(
            t.priceUsd
          )} = ${formatUsd(t.valueUsd)}`
        )
      );
    }
  }

  // ── Portfolio VaR ──────────────────────────────────────────────────────────
  console.log("\n" + divider());
  console.log(chalk.bold.white("\n  PORTFOLIO VALUE AT RISK (Historical Simulation)\n"));
  printVarTable(report.portfolioVar);

  // ── Per-Asset VaR ──────────────────────────────────────────────────────────
  if (report.assetVar.length > 0) {
    console.log("\n" + divider());
    console.log(chalk.bold.white("\n  ASSET-LEVEL VaR\n"));
    for (const asset of report.assetVar) {
      console.log(
        chalk.white(`  ${asset.label}`) +
          chalk.gray(` — ${formatUsd(asset.currentValueUsd)}`)
      );
      printVarTable(asset.varResults);
      console.log();
    }
  }

  // ── Return Distribution ────────────────────────────────────────────────────
  console.log(divider());
  console.log(chalk.bold.white("\n  DAILY RETURN DISTRIBUTION\n"));
  printHistogram(report.dailyReturns);

  // ── Methodology Note ───────────────────────────────────────────────────────
  console.log("\n" + divider());
  console.log(chalk.gray("\n  " + report.methodology.split("\n").join("\n  ")));
  console.log("\n" + divider("═") + "\n");
}
