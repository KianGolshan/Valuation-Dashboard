import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

function formatValue(value, format, profitable) {
  if (profitable) return "Profitable";
  if (value == null) return "—";
  switch (format) {
    case "pct":
      return `${value.toFixed(1)}%`;
    case "ratio":
      return `${value.toFixed(2)}x`;
    case "currency": {
      const abs = Math.abs(value);
      if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B/mo`;
      if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M/mo`;
      if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K/mo`;
      return `$${value.toFixed(0)}/mo`;
    }
    case "months":
      return value != null ? `${value.toFixed(1)} mo` : "—";
    default:
      return String(value);
  }
}

function formatDelta(delta, format) {
  if (delta == null) return null;
  const sign = delta >= 0 ? "+" : "";
  if (format === "pct") return `${sign}${delta.toFixed(1)}pp`;
  if (format === "ratio") return `${sign}${delta.toFixed(2)}x`;
  return `${sign}${delta.toFixed(2)}`;
}

function KPICard({ ratio }) {
  const { name, key, value, prior_value, delta, period, prior_period, format, profitable } = ratio;
  const hasValue = value != null || profitable;
  const deltaStr = formatDelta(delta, format);
  const deltaPositive = delta != null ? delta >= 0 : null;

  // For some ratios, positive delta is bad (e.g. Debt/Equity, Burn Rate)
  const invertedPositive = key === "debt_equity" || key === "burn_rate";
  const isGood = deltaPositive != null
    ? (invertedPositive ? !deltaPositive : deltaPositive)
    : null;

  return (
    <div className={`bg-white rounded-lg shadow p-4 flex flex-col gap-1 ${!hasValue ? "opacity-60" : ""}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
        {name}
      </p>

      <p className={`text-2xl font-bold ${hasValue ? "text-gray-900" : "text-gray-300"}`}>
        {formatValue(value, format, profitable)}
      </p>

      {deltaStr && (
        <span
          className={`text-xs font-medium ${
            isGood === true ? "text-green-600" :
            isGood === false ? "text-red-500" :
            "text-gray-500"
          }`}
        >
          {deltaStr} vs prior
        </span>
      )}

      {!deltaStr && prior_value != null && (
        <span className="text-xs text-gray-400">
          Prior: {formatValue(prior_value, format, false)}
        </span>
      )}

      <p className="text-xs text-gray-400 mt-auto pt-1 truncate">
        {period !== "N/A" ? period : "No data"}
        {prior_period && prior_period !== period && (
          <span className="text-gray-300"> / {prior_period}</span>
        )}
      </p>
    </div>
  );
}

export default function RatioKPICards({ investmentId }) {
  const [ratios, setRatios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchRatios = useCallback(async () => {
    if (!investmentId) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.getRatios(investmentId);
      setRatios(data.ratios || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [investmentId]);

  useEffect(() => {
    fetchRatios();
  }, [fetchRatios]);

  // Refetch when a statement is approved elsewhere in the app
  useEffect(() => {
    const handler = () => fetchRatios();
    window.addEventListener("statements-approved", handler);
    return () => window.removeEventListener("statements-approved", handler);
  }, [fetchRatios]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-4 animate-pulse">
            <div className="h-3 bg-gray-200 rounded w-3/4 mb-3" />
            <div className="h-7 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-500 bg-red-50 rounded px-4 py-3">
        Could not load ratios: {error}
      </div>
    );
  }

  if (ratios.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-4">
        No financial statements mapped to this investment yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {ratios.map((ratio) => (
        <KPICard key={ratio.key} ratio={ratio} />
      ))}
    </div>
  );
}
