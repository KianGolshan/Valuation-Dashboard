import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { api } from "../api";

function formatCurrency(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPPS(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const METHODOLOGIES = [
  "Revenue Multiple",
  "EBITDA Multiple",
  "DCF",
  "Comparable Transactions",
  "Book Value",
  "Other",
];

const FINANCIAL_METRICS = [
  "LTM Revenue",
  "LTM EBITDA",
  "NTM Revenue",
  "NTM EBITDA",
  "LTM EBIT",
  "Book Value",
  "Other",
];

const CONFIDENCE_BADGES = {
  high:   { label: "High",   cls: "bg-green-100 text-green-700" },
  medium: { label: "Medium", cls: "bg-yellow-100 text-yellow-700" },
  low:    { label: "Low",    cls: "bg-red-100 text-red-700" },
};

function ConfidenceBadge({ flag }) {
  const badge = CONFIDENCE_BADGES[flag] || { label: flag || "—", cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

function LatestValuationSummary({ valuation }) {
  if (!valuation) {
    return (
      <div className="text-center py-6 text-gray-400 text-sm">
        No valuations recorded yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Enterprise Value</p>
        <p className="text-lg font-bold text-gray-900">
          {formatCurrency(valuation.implied_enterprise_value)}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Equity Value</p>
        <p className="text-lg font-bold text-gray-900">
          {formatCurrency(valuation.implied_equity_value)}
        </p>
      </div>
      {valuation.price_per_share != null && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Price / Share</p>
          <p className="text-lg font-bold text-gray-900">
            {formatPPS(valuation.price_per_share)}
          </p>
        </div>
      )}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Methodology</p>
        <p className="text-sm font-medium text-gray-700">{valuation.methodology}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Confidence</p>
        <ConfidenceBadge flag={valuation.confidence_flag} />
      </div>
    </div>
  );
}

// ── Chart ────────────────────────────────────────────────────────────────────

const LINE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];

function ValuationHistoryChart({ valuations, securities }) {
  const withPPS = valuations.filter((v) => v.price_per_share != null);
  if (withPPS.length < 2) return null;

  // Group by security_id (null → "Unspecified")
  const groups = {};
  for (const v of withPPS) {
    const key = v.security_id ?? "null";
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  }

  // Build chart data: one entry per date, columns per security
  const dateSet = new Set(withPPS.map((v) => v.valuation_date));
  const dates = Array.from(dateSet).sort();
  const groupKeys = Object.keys(groups);

  const chartData = dates.map((date) => {
    const entry = { date };
    for (const key of groupKeys) {
      const match = groups[key].find((v) => v.valuation_date === date);
      entry[key] = match?.price_per_share ?? null;
    }
    return entry;
  });

  function securityName(key) {
    if (key === "null") return "Unspecified";
    const sec = securities.find((s) => String(s.id) === String(key));
    return sec ? (sec.security_name || sec.name || `Security ${key}`) : `Security ${key}`;
  }

  return (
    <div className="mt-4 bg-gray-50 rounded-lg p-4">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
        Price per Share Over Time
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(v) => `$${v.toLocaleString()}`}
            tick={{ fontSize: 11 }}
            width={72}
          />
          <Tooltip
            formatter={(value, name) => [
              formatPPS(value),
              securityName(name),
            ]}
          />
          {groupKeys.length > 1 && (
            <Legend formatter={(value) => securityName(value)} wrapperStyle={{ fontSize: 11 }} />
          )}
          {groupKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={key}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              dot={{ r: 3 }}
              connectNulls={false}
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

function ValuationForm({ investmentId, existing, securities, onSave, onCancel }) {
  const [form, setForm] = useState({
    valuation_date: existing?.valuation_date || new Date().toISOString().split("T")[0],
    methodology: existing?.methodology || "Revenue Multiple",
    security_id: existing?.security_id ?? "",
    multiple: existing?.multiple ?? "",
    financial_metric: existing?.financial_metric || "",
    financial_metric_value: existing?.financial_metric_value ?? "",
    price_per_share: existing?.price_per_share ?? "",
    implied_enterprise_value: existing?.implied_enterprise_value ?? "",
    implied_equity_value: existing?.implied_equity_value ?? "",
    discount_rate: existing?.discount_rate ?? "",
    confidence_flag: existing?.confidence_flag || "medium",
    analyst_notes: existing?.analyst_notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [periods, setPeriods] = useState([]);  // for Pull from Financials

  // Load available periods once
  useEffect(() => {
    api.getKeyMetricsByPeriod(investmentId)
      .then((data) => setPeriods(data.periods || []))
      .catch(() => {});
  }, [investmentId]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handlePullFromFinancials(e) {
    const idx = parseInt(e.target.value);
    if (isNaN(idx)) return;
    const entry = periods[idx];
    if (!entry) return;
    // Auto-fill financial_metric + value based on current methodology selection
    const metricMap = {
      "Revenue Multiple": "LTM Revenue",
      "EBITDA Multiple": "LTM EBITDA",
    };
    const preferredMetric = metricMap[form.methodology];
    const metrics = entry.metrics;
    let chosenMetric = preferredMetric && metrics[preferredMetric] != null
      ? preferredMetric
      : Object.keys(metrics)[0];
    if (chosenMetric) {
      setForm((prev) => ({
        ...prev,
        financial_metric: chosenMetric,
        financial_metric_value: metrics[chosenMetric] ?? prev.financial_metric_value,
      }));
    }
  }

  const isDCF = form.methodology === "DCF";

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        valuation_date: form.valuation_date,
        methodology: form.methodology,
        security_id: form.security_id === "" ? null : parseInt(form.security_id),
        multiple: form.multiple === "" ? null : parseFloat(form.multiple),
        financial_metric: form.financial_metric || null,
        financial_metric_value:
          form.financial_metric_value === "" ? null : parseFloat(form.financial_metric_value),
        price_per_share: form.price_per_share === "" ? null : parseFloat(form.price_per_share),
        implied_enterprise_value:
          form.implied_enterprise_value === "" ? null : parseFloat(form.implied_enterprise_value),
        implied_equity_value:
          form.implied_equity_value === "" ? null : parseFloat(form.implied_equity_value),
        discount_rate: isDCF && form.discount_rate !== "" ? parseFloat(form.discount_rate) : null,
        confidence_flag: form.confidence_flag,
        analyst_notes: form.analyst_notes || null,
      };
      if (existing) {
        await api.updateValuation(investmentId, existing.id, payload);
      } else {
        await api.createValuation(investmentId, payload);
      }
      onSave();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-4 space-y-3">
      {/* Row 1: Date + Methodology */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
          <input
            type="date"
            value={form.valuation_date}
            onChange={(e) => handleChange("valuation_date", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Methodology</label>
          <select
            value={form.methodology}
            onChange={(e) => handleChange("methodology", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            {METHODOLOGIES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Security + Multiple + Price/Share */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Security</label>
          <select
            value={form.security_id}
            onChange={(e) => handleChange("security_id", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="">— None —</option>
            {securities.map((s) => (
              <option key={s.id} value={s.id}>
                {s.investment_round || s.description || `Security #${s.id}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {isDCF ? "Discount Rate (%)" : "Multiple"}
          </label>
          <input
            type="number"
            step="any"
            value={isDCF ? form.discount_rate : form.multiple}
            onChange={(e) =>
              handleChange(isDCF ? "discount_rate" : "multiple", e.target.value)
            }
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder={isDCF ? "e.g. 10.0" : "e.g. 5.0"}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Price / Share</label>
          <input
            type="number"
            step="any"
            value={form.price_per_share}
            onChange={(e) => handleChange("price_per_share", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="e.g. 12.50"
          />
        </div>
      </div>

      {/* Row 3: Financial Metric + Value (with Pull from Financials) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Financial Metric</label>
          <input
            list="fin-metrics"
            value={form.financial_metric}
            onChange={(e) => handleChange("financial_metric", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="e.g. LTM Revenue"
          />
          <datalist id="fin-metrics">
            {FINANCIAL_METRICS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600">Metric Value ($)</label>
            {periods.length > 0 && (
              <select
                defaultValue=""
                onChange={handlePullFromFinancials}
                className="text-xs text-blue-600 border-none bg-transparent cursor-pointer"
              >
                <option value="">↓ Pull from Financials</option>
                {periods.map((p, i) => (
                  <option key={i} value={i}>
                    {p.period_label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <input
            type="number"
            step="any"
            value={form.financial_metric_value}
            onChange={(e) => handleChange("financial_metric_value", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="e.g. 10000000"
          />
        </div>
      </div>

      {/* Row 4: EV + Equity Value */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Implied Enterprise Value
          </label>
          <input
            type="number"
            step="any"
            value={form.implied_enterprise_value}
            onChange={(e) => handleChange("implied_enterprise_value", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Implied Equity Value
          </label>
          <input
            type="number"
            step="any"
            value={form.implied_equity_value}
            onChange={(e) => handleChange("implied_equity_value", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Row 5: Confidence */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Confidence</label>
          <select
            value={form.confidence_flag}
            onChange={(e) => handleChange("confidence_flag", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Analyst Notes</label>
        <textarea
          value={form.analyst_notes}
          onChange={(e) => handleChange("analyst_notes", e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          rows={2}
        />
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 border border-gray-300 rounded"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded disabled:opacity-50"
        >
          {saving ? "Saving..." : existing ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}

// ── History Table ─────────────────────────────────────────────────────────────

function ValuationHistoryTable({ valuations, investmentId, securities, onEdit, onRefresh }) {
  async function handleDelete(id) {
    if (!confirm("Delete this valuation record?")) return;
    try {
      await api.deleteValuation(investmentId, id);
      onRefresh();
    } catch (err) {
      alert(err.message);
    }
  }

  if (valuations.length === 0) return null;

  function securityName(secId) {
    if (!secId) return "—";
    const s = securities.find((x) => x.id === secId);
    return s ? (s.security_name || s.name || `#${secId}`) : `#${secId}`;
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden mt-3 print:shadow-none">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-gray-500 uppercase text-xs">
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Security</th>
            <th className="px-4 py-2">Methodology</th>
            <th className="px-4 py-2 text-right">Multiple</th>
            <th className="px-4 py-2">Financial Metric</th>
            <th className="px-4 py-2 text-right">Price/Share</th>
            <th className="px-4 py-2 text-right">EV</th>
            <th className="px-4 py-2 text-right">Equity</th>
            <th className="px-4 py-2">Confidence</th>
            <th className="px-4 py-2 print:hidden">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {valuations.map((v) => (
            <tr key={v.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-gray-700">{v.valuation_date}</td>
              <td className="px-4 py-2 text-gray-700">{securityName(v.security_id)}</td>
              <td className="px-4 py-2 text-gray-700">{v.methodology}</td>
              <td className="px-4 py-2 text-right font-mono text-gray-700">
                {v.multiple != null ? `${v.multiple}x` : "—"}
              </td>
              <td className="px-4 py-2 text-gray-700">
                {v.financial_metric || "—"}
                {v.financial_metric_value != null && (
                  <span className="text-gray-400 ml-1 text-xs">
                    ({formatCurrency(v.financial_metric_value)})
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-right font-mono text-gray-700">
                {formatPPS(v.price_per_share)}
              </td>
              <td className="px-4 py-2 text-right font-mono text-gray-700">
                {formatCurrency(v.implied_enterprise_value)}
              </td>
              <td className="px-4 py-2 text-right font-mono text-gray-700">
                {formatCurrency(v.implied_equity_value)}
              </td>
              <td className="px-4 py-2">
                <ConfidenceBadge flag={v.confidence_flag} />
              </td>
              <td className="px-4 py-2 print:hidden">
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(v)}
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(v.id)}
                    className="text-red-500 hover:text-red-700 text-xs font-medium"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function ValuationPanel({ investmentId }) {
  const [valuations, setValuations] = useState([]);
  const [latest, setLatest] = useState(null);
  const [securities, setSecurities] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [list, lat, secs] = await Promise.all([
        api.listValuations(investmentId),
        api.getLatestValuation(investmentId),
        api.listSecurities(investmentId),
      ]);
      setValuations(list);
      setLatest(lat);
      setSecurities(secs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [investmentId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleEdit(record) {
    setEditingRecord(record);
    setShowForm(true);
  }

  function handleFormSave() {
    setShowForm(false);
    setEditingRecord(null);
    load();
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-gray-400 text-sm">Loading valuations...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3 print:hidden">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Valuations
        </h3>
        <div className="flex items-center gap-2">
          {/* Export Excel */}
          <a
            href={api.exportValuationsUrl(investmentId)}
            download
            className="text-xs text-green-700 hover:text-green-900 border border-green-300 px-2 py-1 rounded"
          >
            Export Excel
          </a>
          {/* Export PDF */}
          <button
            onClick={() => window.print()}
            className="text-xs text-gray-600 hover:text-gray-800 border border-gray-300 px-2 py-1 rounded"
          >
            Print / PDF
          </button>
          <button
            onClick={() => {
              setEditingRecord(null);
              setShowForm(!showForm);
            }}
            className="text-purple-600 hover:text-purple-800 text-xs font-medium"
          >
            {showForm ? "Cancel" : "+ Add Valuation"}
          </button>
        </div>
      </div>

      <LatestValuationSummary valuation={latest} />

      <ValuationHistoryChart valuations={valuations} securities={securities} />

      {showForm && (
        <div className="mt-3 print:hidden">
          <ValuationForm
            investmentId={investmentId}
            existing={editingRecord}
            securities={securities}
            onSave={handleFormSave}
            onCancel={() => {
              setShowForm(false);
              setEditingRecord(null);
            }}
          />
        </div>
      )}

      <ValuationHistoryTable
        valuations={valuations}
        investmentId={investmentId}
        securities={securities}
        onEdit={handleEdit}
        onRefresh={load}
      />
    </div>
  );
}
