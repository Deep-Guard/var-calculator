import fs from "fs";
import path from "path";
import { PortfolioReport } from "../types";

export function writeJsonReport(report: PortfolioReport, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `var-report-${report.generatedAt.slice(0, 10)}.json`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), "utf-8");
  return filepath;
}
