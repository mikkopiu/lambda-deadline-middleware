/**
 * SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
 * SPDX-License-Identifier: MIT
 *
 * Validates benchmark results against performance thresholds.
 *
 * CI gate thresholds (per-request middleware overhead):
 * - p50 (median) < 50µs (0.05ms)
 * - p99 < 1000µs (1ms) — intentionally generous for shared CI runner noise
 *
 * Exits with code 1 if thresholds are exceeded or measurements are invalid.
 *
 * Usage: node --experimental-strip-types scripts/validate-bench.ts [path-to-bench-results.json]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const P50_THRESHOLD_MS = 0.05; // 50µs
const P99_THRESHOLD_MS = 1; // 1000µs — relaxed for shared CI runner noise

interface BenchmarkResult {
  name: string;
  median: number;
  mean: number;
  p75: number;
  p99: number;
  p995: number;
  p999: number;
  sampleCount: number;
  hz: number;
}

interface BenchGroup {
  fullName: string;
  benchmarks: BenchmarkResult[];
}

interface BenchFile {
  filepath: string;
  groups: BenchGroup[];
}

interface BenchResults {
  files: BenchFile[];
}

const main = (): void => {
  const resultsPath = process.argv[2] ?? resolve(process.cwd(), "bench-results.json");

  let raw: string;
  try {
    raw = readFileSync(resultsPath, "utf-8");
  } catch {
    console.error(`❌ Failed to read benchmark results: ${resultsPath}`);
    console.error("   Run benchmarks first: pnpm bench");
    process.exit(1);
  }

  let results: BenchResults;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse returns any
    results = JSON.parse(raw) as BenchResults;
  } catch {
    console.error("❌ Failed to parse benchmark results JSON — measurements invalid");
    process.exit(1);
  }

  // Validate structure
  if (!Array.isArray(results.files) || results.files.length === 0) {
    console.error("❌ No benchmark files found in results — measurements invalid");
    process.exit(1);
  }

  const allBenchmarks = results.files.flatMap((f) => f.groups.flatMap((g) => g.benchmarks));

  if (allBenchmarks.length === 0) {
    console.error("❌ No benchmark results found — measurements invalid");
    process.exit(1);
  }

  // Validate all measurements are valid numbers with sufficient samples
  const MIN_SAMPLES = 1000;
  let hasFailure = false;

  console.log("📊 Benchmark Performance Validation");
  console.log("═".repeat(70));
  console.log(
    `   Thresholds: p50 (median) < ${P50_THRESHOLD_MS * 1000}µs, p99 < ${P99_THRESHOLD_MS * 1000}µs`,
  );
  console.log("");

  for (const bench of allBenchmarks) {
    const { name, median, p99, sampleCount } = bench;

    // Validate measurement integrity
    if (Number.isNaN(median) || Number.isNaN(p99)) {
      console.error(`   ❌ ${name}: NaN values detected — measurement invalid`);
      hasFailure = true;
      continue;
    }

    if (!Number.isFinite(median) || !Number.isFinite(p99)) {
      console.error(`   ❌ ${name}: Non-finite values detected — measurement invalid`);
      hasFailure = true;
      continue;
    }

    if (sampleCount < MIN_SAMPLES) {
      console.error(
        `   ❌ ${name}: Insufficient samples (${sampleCount} < ${MIN_SAMPLES}) — measurement invalid`,
      );
      hasFailure = true;
      continue;
    }

    // Validate thresholds
    const p50Pass = median < P50_THRESHOLD_MS;
    const p99Pass = p99 < P99_THRESHOLD_MS;

    const p50Status = p50Pass ? "✓" : "✗";
    const p99Status = p99Pass ? "✓" : "✗";

    console.log(`   ${name}`);
    console.log(
      `     ${p50Status} p50 (median): ${(median * 1000).toFixed(2)}µs (threshold: ${P50_THRESHOLD_MS * 1000}µs)`,
    );
    console.log(
      `     ${p99Status} p99:          ${(p99 * 1000).toFixed(2)}µs (threshold: ${P99_THRESHOLD_MS * 1000}µs)`,
    );
    console.log(`       samples: ${sampleCount.toLocaleString()}`);
    console.log("");

    if (!p50Pass) {
      console.error(
        `   ❌ THRESHOLD EXCEEDED: ${name} p50 ${(median * 1000).toFixed(2)}µs > ${P50_THRESHOLD_MS * 1000}µs`,
      );
      hasFailure = true;
    }

    if (!p99Pass) {
      console.error(
        `   ❌ THRESHOLD EXCEEDED: ${name} p99 ${(p99 * 1000).toFixed(2)}µs > ${P99_THRESHOLD_MS * 1000}µs`,
      );
      hasFailure = true;
    }
  }

  console.log("═".repeat(70));

  if (hasFailure) {
    console.error("❌ Performance validation FAILED — build must not proceed");
    process.exit(1);
  }

  console.log("✅ All benchmarks within performance thresholds");
};

main();
