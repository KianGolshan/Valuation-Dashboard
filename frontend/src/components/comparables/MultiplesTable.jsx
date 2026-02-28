import { useState, useMemo } from "react";

const COLUMNS = [
  { key: "ticker", label: "Ticker", format: (v) => v, align: "left", mono: true },
  { key: "company_name", label: "Company", format: (v) => v, align: "left" },
  { key: "market_cap", label: "Market Cap", format: formatMarketCap, align: "right", mono: true },
  { key: "ev_revenue", label: "EV/Revenue", format: fmtX, align: "right", mono: true },
  { key: "ev_ebitda", label: "EV/EBITDA", format: fmtX, align: "right", mono: true },
  { key: "revenue_growth", label: "Rev Growth %", format: fmtPct, align: "right", mono: true },
  { key: "gross_margin", label: "Gross Margin %", format: fmtPct, align: "right", mono: true },
  { key: "ebitda_margin", label: "EBITDA Margin %", format: fmtPct, align: "right", mono: true },
  { key: "rule_of_40", label: "Rule of 40", format: fmtNum, align: "right", mono: true },
];

function fmtX(v) {
  return v != null ? `${v.toFixed(1)}x` : "\u2014";
}

function fmtPct(v) {
  return v != null ? `${v.toFixed(1)}%` : "\u2014";
}

function fmtNum(v) {
  return v != null ? v.toFixed(1) : "\u2014";
}

function formatMarketCap(v) {
  if (v == null) return "\u2014";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function isOutlier(value, median, stdDev) {
  if (value == null || median == null || stdDev == null || stdDev === 0) return false;
  return Math.abs(value - median) > 2 * stdDev;
}

export default function MultiplesTable({ analysis }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  // Compute standard deviations for outlier highlighting
  const stdDevs = useMemo(() => {
    const metrics = ["ev_revenue", "ev_ebitda", "revenue_growth", "gross_margin", "ebitda_margin", "rule_of_40"];
    const result = {};
    const included = analysis.companies.filter((c) => c.include_in_median);

    for (const m of metrics) {
      const vals = included.map((c) => c[m]).filter((v) => v != null);
      if (vals.length < 2) {
        result[m] = null;
        continue;
      }
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      result[m] = Math.sqrt(variance);
    }
    return result;
  }, [analysis]);

  // Get median for each metric from stats
  const medians = useMemo(() => {
    const result = {};
    for (const s of analysis.statistics) {
      const key = {
        "EV/Revenue": "ev_revenue",
        "EV/EBITDA": "ev_ebitda",
        "Revenue Growth %": "revenue_growth",
        "Gross Margin %": "gross_margin",
        "EBITDA Margin %": "ebitda_margin",
        "Rule of 40": "rule_of_40",
      }[s.metric];
      if (key) result[key] = s.median;
    }
    return result;
  }, [analysis]);

  const sortedCompanies = useMemo(() => {
    const arr = [...analysis.companies];
    if (sortKey) {
      arr.sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "string") return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortAsc ? av - bv : bv - av;
      });
    }
    return arr;
  }, [analysis.companies, sortKey, sortAsc]);

  // Find stats for summary rows
  const statsByMetric = {};
  for (const s of analysis.statistics) {
    statsByMetric[s.metric] = s;
  }

  const summaryMetricMap = {
    ev_revenue: "EV/Revenue",
    ev_ebitda: "EV/EBITDA",
    revenue_growth: "Revenue Growth %",
    gross_margin: "Gross Margin %",
    ebitda_margin: "EBITDA Margin %",
    rule_of_40: "Rule of 40",
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Valuation Multiples
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 text-gray-500 uppercase text-xs">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-3 py-2 cursor-pointer hover:bg-gray-100 select-none ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1">{sortAsc ? "\u25B2" : "\u25BC"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedCompanies.map((company) => (
              <tr
                key={company.ticker}
                className={`hover:bg-gray-50 ${
                  !company.include_in_median || company.data_unavailable ? "opacity-40" : ""
                }`}
              >
                {company.data_unavailable ? (
                  <>
                    <td className="px-3 py-2 font-mono text-gray-900">{company.ticker}</td>
                    <td className="px-3 py-2 text-gray-900">{company.company_name}</td>
                    <td
                      colSpan={COLUMNS.length - 2}
                      className="px-3 py-2 text-xs text-orange-600 italic"
                    >
                      Data unavailable (not covered by current FMP plan)
                    </td>
                  </>
                ) : (
                  COLUMNS.map((col) => {
                    const val = company[col.key];
                    const outlier =
                      col.mono &&
                      col.key !== "ticker" &&
                      col.key !== "market_cap" &&
                      company.include_in_median &&
                      isOutlier(val, medians[col.key], stdDevs[col.key]);
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-2 ${
                          col.align === "right" ? "text-right" : "text-left"
                        } ${col.mono ? "font-mono" : ""} ${
                          outlier ? "text-amber-600 font-semibold" : "text-gray-900"
                        }`}
                      >
                        {col.format(val)}
                      </td>
                    );
                  })
                )}
              </tr>
            ))}

            {/* Summary rows */}
            {["median", "mean", "q1", "q3"].map((stat) => (
              <tr
                key={stat}
                className="bg-gray-50 font-semibold border-t-2 border-gray-200"
              >
                <td className="px-3 py-2 text-gray-700" colSpan={2}>
                  {stat === "q1" ? "Q1 (25th)" : stat === "q3" ? "Q3 (75th)" : stat.charAt(0).toUpperCase() + stat.slice(1)}
                </td>
                <td className="px-3 py-2"></td>
                {["ev_revenue", "ev_ebitda", "revenue_growth", "gross_margin", "ebitda_margin", "rule_of_40"].map(
                  (metricKey) => {
                    const s = statsByMetric[summaryMetricMap[metricKey]];
                    const val = s ? s[stat] : null;
                    const col = COLUMNS.find((c) => c.key === metricKey);
                    return (
                      <td
                        key={metricKey}
                        className="px-3 py-2 text-right font-mono text-gray-700"
                      >
                        {col ? col.format(val) : "\u2014"}
                      </td>
                    );
                  }
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
