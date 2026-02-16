import { useState, useEffect } from "react";
import { api } from "../../api";

const METRIC_MAP = {
  "EV/Revenue": "ev_revenue",
  "EV/EBITDA": "ev_ebitda",
  "Revenue Growth %": "revenue_growth",
  "Gross Margin %": "gross_margin",
};

export default function BenchmarkPanel({ sector, analysisStats }) {
  const [benchmarks, setBenchmarks] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sector) {
      setBenchmarks(null);
      return;
    }
    (async () => {
      try {
        const data = await api.getBenchmarks(sector);
        setBenchmarks(data);
        setError("");
      } catch {
        setBenchmarks(null);
        setError(`No benchmarks available for "${sector}"`);
      }
    })();
  }, [sector]);

  if (!sector) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
          Sector Benchmarks
        </h3>
        <p className="text-sm text-gray-400">
          Set a sector in the Company Profile above to see benchmarks.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
          Sector Benchmarks
        </h3>
        <p className="text-sm text-gray-400">{error}</p>
      </div>
    );
  }

  if (!benchmarks) return null;

  // Build comparison data for display metrics
  const comparisonRows = Object.entries(METRIC_MAP).map(([metricLabel, benchKey]) => {
    const bench = benchmarks.benchmarks[benchKey];
    if (!bench) return null;

    // Find matching analysis stat
    let compMedian = null;
    if (analysisStats) {
      const stat = analysisStats.find((s) => s.metric === metricLabel);
      if (stat) compMedian = stat.median;
    }

    const suffix = metricLabel.includes("%") ? "%" : "x";
    const fmt = (v) => (v != null ? `${v.toFixed(1)}${suffix}` : "\u2014");

    return {
      label: metricLabel,
      benchP25: bench.p25,
      benchMedian: bench.median,
      benchP75: bench.p75,
      compMedian,
      suffix,
      fmt,
    };
  }).filter(Boolean);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
      >
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Sector Benchmarks: {sector}
        </h3>
        <span className="text-gray-400 text-xs">
          {expanded ? "\u25B2 Collapse" : "\u25BC Expand"}
        </span>
      </button>

      {expanded && (
        <div className="mt-4">
          <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 mb-3 inline-block">
            Illustrative Private Market Benchmarks
          </p>

          <div className="space-y-3">
            {comparisonRows.map((row) => (
              <div key={row.label} className="flex items-center gap-4">
                <div className="w-32 text-xs font-medium text-gray-600 text-right shrink-0">
                  {row.label}
                </div>

                {/* Visual range bar */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {row.compMedian != null && (
                      <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                        Your Comps: {row.fmt(row.compMedian)}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      Sector Median: {row.fmt(row.benchMedian)} ({row.fmt(row.benchP25)} - {row.fmt(row.benchP75)})
                    </span>
                  </div>

                  {/* Simple range visualization */}
                  <div className="relative h-2 bg-gray-100 rounded-full mt-1">
                    {/* Benchmark range */}
                    <div
                      className="absolute h-2 bg-gray-300 rounded-full"
                      style={{
                        left: `${(row.benchP25 / (row.benchP75 * 1.5)) * 100}%`,
                        width: `${((row.benchP75 - row.benchP25) / (row.benchP75 * 1.5)) * 100}%`,
                      }}
                    />
                    {/* Benchmark median */}
                    <div
                      className="absolute w-1 h-3 bg-gray-500 rounded -top-0.5"
                      style={{
                        left: `${(row.benchMedian / (row.benchP75 * 1.5)) * 100}%`,
                      }}
                    />
                    {/* Comp set median */}
                    {row.compMedian != null && (
                      <div
                        className="absolute w-1.5 h-3.5 bg-blue-600 rounded -top-0.5"
                        style={{
                          left: `${Math.min((row.compMedian / (row.benchP75 * 1.5)) * 100, 98)}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {benchmarks.benchmarks.by_stage && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">By Stage (EV/Revenue)</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(benchmarks.benchmarks.by_stage).map(([stage, data]) => (
                  <span
                    key={stage}
                    className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded"
                  >
                    {stage}: {data.ev_revenue?.median?.toFixed(1)}x
                    <span className="text-gray-400 ml-1">
                      ({data.ev_revenue?.p25?.toFixed(1)}-{data.ev_revenue?.p75?.toFixed(1)}x)
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
