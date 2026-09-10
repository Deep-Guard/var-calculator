import fs from "fs";
import path from "path";
import { PortfolioReport, VarResult } from "../types";
import { buildReturnHistogram } from "../calculators/var";

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

function renderVarTable(varResults: VarResult[]): string {
  const horizons = [...new Set(varResults.map((r) => r.horizon))].sort((a, b) => a - b);
  const confidences = [...new Set(varResults.map((r) => r.confidenceLevel))].sort(
    (a, b) => a - b
  );

  const headers = ["Confidence", ...horizons.map((h) => `${h}-Day VaR`)];
  const headerRow = headers.map((h) => `<th>${h}</th>`).join("");

  const bodyRows = confidences
    .map((conf) => {
      const cells = horizons
        .map((horizon) => {
          const result = varResults.find(
            (r) => r.confidenceLevel === conf && r.horizon === horizon
          );
          if (!result) return "<td>—</td>";
          return `<td><strong>${formatUsd(result.valueAtRiskUsd)}</strong><br><span class="sub">${formatPct(result.valueAtRiskPct)}</span></td>`;
        })
        .join("");
      return `<tr><td>${(conf * 100).toFixed(0)}%</td>${cells}</tr>`;
    })
    .join("");

  return `<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function renderHistogramSvg(report: PortfolioReport): string {
  const histogram = buildReturnHistogram(report.dailyReturns);
  const maxCount = Math.max(...histogram.map((b) => b.count));
  const barH = 100;
  const barW = 36;
  const gap = 4;
  const totalW = histogram.length * (barW + gap);

  const bars = histogram
    .map((bucket, i) => {
      const h = Math.round((bucket.count / maxCount) * barH);
      const y = barH - h;
      const isNegative = bucket.label.startsWith("-");
      const fill = isNegative ? "#ef4444" : "#22c55e";
      const x = i * (barW + gap);
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fill}" rx="2"/>
              <text x="${x + barW / 2}" y="${barH + 14}" text-anchor="middle" font-size="8" fill="#94a3b8">${bucket.count}</text>`;
    })
    .join("\n");

  return `<svg viewBox="0 0 ${totalW} ${barH + 20}" xmlns="http://www.w3.org/2000/svg"
          style="width:100%;max-width:640px;display:block;margin:0 auto">
    ${bars}
  </svg>`;
}

export function generateHtmlReport(report: PortfolioReport): string {
  const assetRows = report.assets
    .map((asset) => {
      const tokenDetail = asset.tokens
        .map(
          (t) =>
            `<div class="token-row"><span>${t.symbol}</span><span>${t.amount.toFixed(4)} @ ${formatUsd(t.priceUsd)}</span><span>${formatUsd(t.valueUsd)}</span></div>`
        )
        .join("");
      return `
      <div class="asset-card">
        <div class="asset-header">
          <span class="badge ${asset.type}">${asset.type.toUpperCase()}</span>
          <strong>${asset.label}</strong>
          <span class="asset-value">${formatUsd(asset.valueUsd)}</span>
          <span class="alloc">${formatPct(asset.allocationPct)}</span>
        </div>
        <div class="token-details">${tokenDetail}</div>
      </div>`;
    })
    .join("");

  const assetVarSections = report.assetVar
    .map(
      (a) => `
    <div class="section">
      <h3>${a.label} <span class="sub">${formatUsd(a.currentValueUsd)}</span></h3>
      ${renderVarTable(a.varResults)}
    </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VaR Report — ${report.protocolName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #0f172a; color: #e2e8f0; line-height: 1.6; padding: 2rem; }
    .container { max-width: 900px; margin: 0 auto; }
    .header { border-bottom: 1px solid #1e293b; padding-bottom: 1.5rem; margin-bottom: 2rem; }
    .header h1 { font-size: 1.75rem; color: #f1f5f9; }
    .header .meta { color: #64748b; font-size: 0.875rem; margin-top: 0.25rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 1rem; margin-bottom: 2rem; }
    .stat-card { background: #1e293b; border-radius: 8px; padding: 1rem 1.25rem; }
    .stat-card .label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-card .value { font-size: 1.5rem; font-weight: 700; color: #22c55e; margin-top: 0.25rem; }
    .section { margin-bottom: 2.5rem; }
    .section h2 { font-size: 1rem; font-weight: 600; text-transform: uppercase;
                  letter-spacing: 0.1em; color: #94a3b8; border-bottom: 1px solid #1e293b;
                  padding-bottom: 0.5rem; margin-bottom: 1rem; }
    .section h3 { font-size: 1rem; color: #e2e8f0; margin-bottom: 0.75rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { background: #1e293b; color: #94a3b8; text-align: left; padding: 0.625rem 0.875rem;
         font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
    td { padding: 0.625rem 0.875rem; border-bottom: 1px solid #1e293b; }
    td strong { color: #fbbf24; font-size: 1rem; }
    .sub { color: #64748b; font-size: 0.75rem; }
    .asset-card { background: #1e293b; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 0.75rem; }
    .asset-header { display: flex; align-items: center; gap: 0.75rem; }
    .asset-value { margin-left: auto; font-weight: 600; color: #22c55e; }
    .alloc { color: #64748b; font-size: 0.875rem; }
    .badge { font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;
             text-transform: uppercase; letter-spacing: 0.05em; }
    .badge.token { background: #1d4ed8; color: #bfdbfe; }
    .badge.lp { background: #7e22ce; color: #e9d5ff; }
    .token-details { margin-top: 0.75rem; border-top: 1px solid #0f172a; padding-top: 0.75rem; }
    .token-row { display: flex; justify-content: space-between; font-size: 0.8125rem;
                 color: #94a3b8; padding: 0.2rem 0; }
    .methodology { background: #1e293b; border-radius: 8px; padding: 1.25rem;
                   font-size: 0.8125rem; color: #64748b; line-height: 1.7; }
    .footer { margin-top: 3rem; border-top: 1px solid #1e293b; padding-top: 1.5rem;
              text-align: center; font-size: 0.8125rem; color: #475569; }
    .footer a { color: #3b82f6; text-decoration: none; }
  </style>
</head>
<body>
<div class="container">

  <div class="header">
    <h1>Value at Risk Report</h1>
    <div class="meta">${report.protocolName} &nbsp;·&nbsp; Generated ${report.generatedAt} &nbsp;·&nbsp; ${report.lookbackDays}-day lookback &nbsp;·&nbsp; Data: ${report.dataSource}</div>
  </div>

  <div class="summary-grid">
    <div class="stat-card">
      <div class="label">Total Portfolio Value</div>
      <div class="value">${formatUsd(report.totalValueUsd)}</div>
    </div>
    <div class="stat-card">
      <div class="label">Assets</div>
      <div class="value" style="color:#e2e8f0">${report.assets.length}</div>
    </div>
    <div class="stat-card">
      <div class="label">Days Analysed</div>
      <div class="value" style="color:#e2e8f0">${report.dailyReturns.length}</div>
    </div>
    <div class="stat-card">
      <div class="label">1-Day VaR (95%)</div>
      <div class="value" style="color:#ef4444">${formatUsd(
        report.portfolioVar.find((v) => v.confidenceLevel === 0.95 && v.horizon === 1)
          ?.valueAtRiskUsd ?? 0
      )}</div>
    </div>
  </div>

  <div class="section">
    <h2>Asset Breakdown</h2>
    ${assetRows}
  </div>

  <div class="section">
    <h2>Portfolio Value at Risk — Historical Simulation</h2>
    ${renderVarTable(report.portfolioVar)}
  </div>

  ${assetVarSections ? `<div class="section"><h2>Asset-Level VaR</h2>${assetVarSections}</div>` : ""}

  <div class="section">
    <h2>Daily Return Distribution</h2>
    ${renderHistogramSvg(report)}
    <p class="sub" style="text-align:center;margin-top:0.5rem">Each bar = one return bucket. Red = negative return days, green = positive.</p>
  </div>

  <div class="section">
    <h2>Methodology</h2>
    <div class="methodology">${report.methodology.replace(/\n/g, "<br>")}</div>
  </div>

  <div class="footer">
    Generated by <a href="https://github.com/Deep-Guard/var-calculator">Deep Guard VaR Calculator</a> &nbsp;·&nbsp;
    For a professional risk assessment, contact <a href="mailto:getaudited@deepguard.xyz">Deep Guard</a>
  </div>

</div>
</body>
</html>`;
}

export function writeHtmlReport(report: PortfolioReport, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `var-report-${report.generatedAt.slice(0, 10)}.html`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, generateHtmlReport(report), "utf-8");
  return filepath;
}
