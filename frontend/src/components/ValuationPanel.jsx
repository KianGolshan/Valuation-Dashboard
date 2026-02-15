import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

function formatCurrency(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
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

const CONFIDENCE_BADGES = {
  high: { label: "High", cls: "bg-green-100 text-green-700" },
  medium: { label: "Medium", cls: "bg-yellow-100 text-yellow-700" },
  low: { label: "Low", cls: "bg-red-100 text-red-700" },
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

function ValuationForm({ investmentId, existing, onSave, onCancel }) {
  const [form, setForm] = useState({
    valuation_date: existing?.valuation_date || new Date().toISOString().split("T")[0],
    methodology: existing?.methodology || "Revenue Multiple",
    revenue_multiple: existing?.revenue_multiple ?? "",
    ebitda_multiple: existing?.ebitda_multiple ?? "",
    discount_rate: existing?.discount_rate ?? "",
    implied_enterprise_value: existing?.implied_enterprise_value ?? "",
    implied_equity_value: existing?.implied_equity_value ?? "",
    confidence_flag: existing?.confidence_flag || "medium",
    analyst_notes: existing?.analyst_notes || "",
  });
  const [saving, setSaving] = useState(false);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        revenue_multiple: form.revenue_multiple === "" ? null : parseFloat(form.revenue_multiple),
        ebitda_multiple: form.ebitda_multiple === "" ? null : parseFloat(form.ebitda_multiple),
        discount_rate: form.discount_rate === "" ? null : parseFloat(form.discount_rate),
        implied_enterprise_value: form.implied_enterprise_value === "" ? null : parseFloat(form.implied_enterprise_value),
        implied_equity_value: form.implied_equity_value === "" ? null : parseFloat(form.implied_equity_value),
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
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Revenue Multiple</label>
          <input
            type="number"
            step="any"
            value={form.revenue_multiple}
            onChange={(e) => handleChange("revenue_multiple", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="e.g. 5.0"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">EBITDA Multiple</label>
          <input
            type="number"
            step="any"
            value={form.ebitda_multiple}
            onChange={(e) => handleChange("ebitda_multiple", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="e.g. 12.0"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Discount Rate (%)</label>
          <input
            type="number"
            step="any"
            value={form.discount_rate}
            onChange={(e) => handleChange("discount_rate", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="e.g. 10.0"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Implied Enterprise Value</label>
          <input
            type="number"
            step="any"
            value={form.implied_enterprise_value}
            onChange={(e) => handleChange("implied_enterprise_value", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Implied Equity Value</label>
          <input
            type="number"
            step="any"
            value={form.implied_equity_value}
            onChange={(e) => handleChange("implied_equity_value", e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          />
        </div>
      </div>
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

function ValuationHistoryTable({ valuations, investmentId, onEdit, onRefresh }) {
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

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-gray-500 uppercase text-xs">
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Methodology</th>
            <th className="px-4 py-2 text-right">EV</th>
            <th className="px-4 py-2 text-right">Equity</th>
            <th className="px-4 py-2">Confidence</th>
            <th className="px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {valuations.map((v) => (
            <tr key={v.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-gray-700">{v.valuation_date}</td>
              <td className="px-4 py-2 text-gray-700">{v.methodology}</td>
              <td className="px-4 py-2 text-right font-mono text-gray-700">
                {formatCurrency(v.implied_enterprise_value)}
              </td>
              <td className="px-4 py-2 text-right font-mono text-gray-700">
                {formatCurrency(v.implied_equity_value)}
              </td>
              <td className="px-4 py-2">
                <ConfidenceBadge flag={v.confidence_flag} />
              </td>
              <td className="px-4 py-2">
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

export default function ValuationPanel({ investmentId }) {
  const [valuations, setValuations] = useState([]);
  const [latest, setLatest] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [list, lat] = await Promise.all([
        api.listValuations(investmentId),
        api.getLatestValuation(investmentId),
      ]);
      setValuations(list);
      setLatest(lat);
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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Valuations
        </h3>
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

      <LatestValuationSummary valuation={latest} />

      {showForm && (
        <div className="mt-3">
          <ValuationForm
            investmentId={investmentId}
            existing={editingRecord}
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
        onEdit={handleEdit}
        onRefresh={load}
      />
    </div>
  );
}
