const METRIC_LABELS = {
  "EV/Revenue": "EV / Revenue",
  "EV/EBITDA": "EV / EBITDA",
  "Revenue Growth %": "Revenue Growth",
  "Gross Margin %": "Gross Margin",
  "EBITDA Margin %": "EBITDA Margin",
  "Rule of 40": "Rule of 40",
};

const BAR_COLORS = [
  "#1e3a5f", // navy
  "#2d5986", // slate blue
  "#3b7ab8", // medium blue
  "#5a9bd5", // steel blue
  "#7eb8e0", // light blue
  "#94a3b8", // cool gray
];

export default function ValuationRangeChart({ statistics }) {
  if (!statistics || statistics.length === 0) return null;

  // Filter out metrics with no data
  const validStats = statistics.filter(
    (s) => s.median != null && s.q1 != null && s.q3 != null
  );

  if (validStats.length === 0) return null;

  // Build data for the horizontal bar chart
  // Each bar represents Q1-Q3 range with whiskers to min/max
  const chartData = validStats.map((s, i) => ({
    name: METRIC_LABELS[s.metric] || s.metric,
    q1: s.q1,
    q3: s.q3,
    median: s.median,
    mean: s.mean,
    min: s.min,
    max: s.max,
    // For the bar: start at q1, width is q3-q1
    barStart: s.q1,
    barWidth: s.q3 - s.q1,
    color: BAR_COLORS[i % BAR_COLORS.length],
  }));

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
        Valuation Range (Football Field)
      </h3>
      <div className="space-y-4">
        {chartData.map((d, idx) => (
          <FootballFieldRow key={d.name} data={d} color={BAR_COLORS[idx % BAR_COLORS.length]} />
        ))}
      </div>
    </div>
  );
}

function FootballFieldRow({ data, color }) {
  const { name, min, q1, median, q3, max, mean } = data;

  // Calculate positions as percentages
  const rangeMin = min ?? q1;
  const rangeMax = max ?? q3;
  const totalRange = rangeMax - rangeMin;

  if (totalRange <= 0) return null;

  const pct = (val) => ((val - rangeMin) / totalRange) * 100;

  const q1Pct = pct(q1);
  const q3Pct = pct(q3);
  const medianPct = pct(median);

  // Format display value
  const suffix = name.includes("Growth") || name.includes("Margin") ? "%" : "x";
  const fmt = (v) => (v != null ? `${v.toFixed(1)}${suffix}` : "");

  return (
    <div className="flex items-center gap-3">
      {/* Label */}
      <div className="w-32 text-xs font-medium text-gray-600 text-right shrink-0">
        {name}
      </div>

      {/* Chart area */}
      <div className="flex-1 relative h-8">
        {/* Whisker line (min to max) */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-px bg-gray-400"
          style={{ left: "0%", right: "0%" }}
        />

        {/* Min whisker cap */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-gray-400"
          style={{ left: "0%" }}
        />

        {/* Max whisker cap */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-gray-400"
          style={{ right: "0%" }}
        />

        {/* Q1-Q3 bar */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-5 rounded opacity-80"
          style={{
            left: `${q1Pct}%`,
            width: `${q3Pct - q1Pct}%`,
            backgroundColor: color,
          }}
        />

        {/* Median marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-7 bg-white"
          style={{ left: `${medianPct}%` }}
        />
        <div
          className="absolute -top-1 w-0.5 h-2 rounded"
          style={{ left: `${medianPct}%`, backgroundColor: "#ef4444" }}
        />
      </div>

      {/* Values */}
      <div className="w-44 text-xs text-gray-500 font-mono shrink-0 flex gap-2 justify-end">
        <span title="Min">{fmt(min)}</span>
        <span className="text-gray-300">|</span>
        <span title="Q1">{fmt(q1)}</span>
        <span className="font-semibold text-gray-800" title="Median">{fmt(median)}</span>
        <span title="Q3">{fmt(q3)}</span>
        <span className="text-gray-300">|</span>
        <span title="Max">{fmt(max)}</span>
      </div>
    </div>
  );
}
