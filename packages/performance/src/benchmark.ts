/**
 * Benchmark utilities
 */

export interface BenchmarkResult {
  name: string;
  library: string;
  ops: number;
  opsPerSec: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
}

export interface BenchmarkOptions {
  iterations?: number;
  warmupIterations?: number;
}

/**
 * Run a benchmark
 */
export async function benchmark(
  name: string,
  library: string,
  fn: () => void,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const { iterations = 10000, warmupIterations = 1000 } = options;

  // Warmup
  for (let i = 0; i < warmupIterations; i++) {
    fn();
  }

  // Force GC if available
  if (typeof (globalThis as { gc?: () => void }).gc === "function") {
    (globalThis as { gc?: () => void }).gc!();
  }

  const times: number[] = [];
  const batchSize = 100;
  const batches = Math.ceil(iterations / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const start = performance.now();
    for (let i = 0; i < batchSize; i++) {
      fn();
    }
    const end = performance.now();
    times.push((end - start) / batchSize);
  }

  const totalTime = times.reduce((a, b) => a + b, 0);
  const avgTime = totalTime / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSec = 1000 / avgTime;

  return {
    name,
    library,
    ops: iterations,
    opsPerSec: Math.round(opsPerSec),
    avgTime: Number(avgTime.toFixed(4)),
    minTime: Number(minTime.toFixed(4)),
    maxTime: Number(maxTime.toFixed(4)),
  };
}

/**
 * Run async benchmark
 */
export async function benchmarkAsync(
  name: string,
  library: string,
  fn: () => Promise<void>,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const { iterations = 1000, warmupIterations = 100 } = options;

  // Warmup
  for (let i = 0; i < warmupIterations; i++) {
    await fn();
  }

  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const totalTime = times.reduce((a, b) => a + b, 0);
  const avgTime = totalTime / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSec = 1000 / avgTime;

  return {
    name,
    library,
    ops: iterations,
    opsPerSec: Math.round(opsPerSec),
    avgTime: Number(avgTime.toFixed(4)),
    minTime: Number(minTime.toFixed(4)),
    maxTime: Number(maxTime.toFixed(4)),
  };
}

/**
 * Format results as table
 */
export function formatResults(results: BenchmarkResult[]): string {
  // Group by benchmark name
  const grouped = new Map<string, BenchmarkResult[]>();
  for (const result of results) {
    if (!grouped.has(result.name)) {
      grouped.set(result.name, []);
    }
    grouped.get(result.name)!.push(result);
  }

  let output = "";

  for (const [name, benchResults] of grouped) {
    output += `\n## ${name}\n\n`;
    output += "| Library | Ops/sec | Avg (ms) | Min (ms) | Max (ms) |\n";
    output += "|---------|---------|----------|----------|----------|\n";

    // Sort by ops/sec descending
    benchResults.sort((a, b) => b.opsPerSec - a.opsPerSec);

    for (const result of benchResults) {
      output += `| ${result.library.padEnd(10)} | ${result.opsPerSec.toLocaleString().padStart(10)} | ${result.avgTime.toFixed(4).padStart(8)} | ${result.minTime.toFixed(4).padStart(8)} | ${result.maxTime.toFixed(4).padStart(8)} |\n`;
    }
  }

  return output;
}

/**
 * Console table output
 */
export function printResults(results: BenchmarkResult[]): void {
  // Group by benchmark name
  const grouped = new Map<string, BenchmarkResult[]>();
  for (const result of results) {
    if (!grouped.has(result.name)) {
      grouped.set(result.name, []);
    }
    grouped.get(result.name)!.push(result);
  }

  for (const [name, benchResults] of grouped) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 ${name}`);
    console.log(`${"=".repeat(60)}`);

    // Sort by ops/sec descending
    benchResults.sort((a, b) => b.opsPerSec - a.opsPerSec);

    const fastest = benchResults[0];

    for (const result of benchResults) {
      const relative =
        result === fastest
          ? "🏆 fastest"
          : `${((fastest.opsPerSec / result.opsPerSec - 1) * 100).toFixed(1)}% slower`;

      console.log(
        `  ${result.library.padEnd(12)} ${result.opsPerSec.toLocaleString().padStart(12)} ops/sec  (avg: ${result.avgTime.toFixed(4)}ms)  ${relative}`
      );
    }
  }
}

