import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_NAMES = {
  1:"January",2:"February",3:"March",4:"April",5:"May",6:"June",
  7:"July",8:"August",9:"September",10:"October",11:"November",12:"December",
};

const STATUS_CONFIG = {
  received: { icon: "✓", cls: "bg-green-100 text-green-700 border-green-300", label: "Received" },
  expected: { icon: "⏳", cls: "bg-yellow-100 text-yellow-700 border-yellow-300", label: "Expected" },
  flagged:  { icon: "⚑", cls: "bg-orange-100 text-orange-700 border-orange-300", label: "Flagged" },
  pending:  { icon: "○", cls: "bg-gray-50 text-gray-400 border-gray-200", label: "Pending" },
};

function buildColumns(fiscalYears, viewMode) {
  const cols = [];
  for (const fy of fiscalYears) {
    if (viewMode === "monthly") {
      for (const mon of MONTHS) {
        cols.push({ fy, label: mon, key: `${fy}-${mon}` });
      }
    } else {
      for (const q of ["Q1", "Q2", "Q3", "Q4"]) {
        cols.push({ fy, label: q, key: `${fy}-${q}` });
      }
    }
    cols.push({ fy, label: "FY Audited", key: `${fy}-FY_Audited` });
  }
  return cols;
}

// ── Cell Popover ──────────────────────────────────────────────────────────────

function CellPopover({ cell, onSave, onClose }) {
  const [status, setStatus] = useState(cell.record?.status || "pending");
  const [notes, setNotes] = useState(cell.record?.notes || "");
  const [receivedDate, setReceivedDate] = useState(cell.record?.received_date || "");
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    try {
      const data = {
        status,
        notes: notes || null,
        received_date: receivedDate || null,
      };
      const record = cell.record;
      if (record && record.id && record.id > 0) {
        await api.updatePeriodRecord(record.id, data);
      } else {
        await api.upsertPeriodRecord({
          investment_id: cell.investmentId,
          fiscal_year: cell.fy,
          period_label: cell.periodLabel,
          ...data,
        });
      }
      onSave();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-56"
      style={{ top: "100%", left: "50%", transform: "translateX(-50%)" }}
    >
      <div className="text-xs font-semibold text-gray-700 mb-2">
        {cell.periodLabel} FY{cell.fy}
      </div>
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
          >
            <option value="received">Received</option>
            <option value="expected">Expected</option>
            <option value="flagged">Flagged</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Received Date</label>
          <input
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
            rows={2}
          />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 border border-gray-300 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Modal ────────────────────────────────────────────────────────────

function SettingsModal({ investment, onClose, onSaved }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getTrackerSettings(investment.id).then(setSettings).catch(() => {});
  }, [investment.id]);

  if (!settings) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-80 text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateTrackerSettings(investment.id, {
        reporting_frequency: settings.reporting_frequency,
        fiscal_year_end_month: settings.fiscal_year_end_month,
        track_audited_annual: settings.track_audited_annual,
        lookback_years: settings.lookback_years,
      });
      onSaved();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">
          Reporting Settings — {investment.investment_name}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Reporting Frequency
            </label>
            <select
              value={settings.reporting_frequency}
              onChange={(e) => setSettings({ ...settings, reporting_frequency: e.target.value })}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="quarterly">Quarterly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Fiscal Year End Month
            </label>
            <select
              value={settings.fiscal_year_end_month}
              onChange={(e) =>
                setSettings({ ...settings, fiscal_year_end_month: parseInt(e.target.value) })
              }
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{MONTH_NAMES[m]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="track_audited"
              checked={settings.track_audited_annual}
              onChange={(e) =>
                setSettings({ ...settings, track_audited_annual: e.target.checked })
              }
              className="rounded"
            />
            <label htmlFor="track_audited" className="text-sm text-gray-700">
              Track Audited Annual
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Lookback Years
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={settings.lookback_years}
              onChange={(e) =>
                setSettings({ ...settings, lookback_years: parseInt(e.target.value) })
              }
              className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 border border-gray-300 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FinancialTrackerTab({ investments }) {
  const currentYear = new Date().getFullYear();
  const [fiscalYears, setFiscalYears] = useState([currentYear - 1, currentYear]);
  const [viewMode, setViewMode] = useState("quarterly");
  const [gridData, setGridData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingCell, setEditingCell] = useState(null); // { investmentId, fy, periodLabel, record }
  const [settingsInvestment, setSettingsInvestment] = useState(null);

  const loadGrid = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getFinancialTrackerGrid({
        fiscal_years: fiscalYears.join(","),
      });
      setGridData(data);
    } catch (err) {
      console.error("Failed to load tracker grid:", err);
    } finally {
      setLoading(false);
    }
  }, [fiscalYears]);

  useEffect(() => {
    if (investments.length > 0) loadGrid();
  }, [loadGrid, investments]);

  const columns = buildColumns(fiscalYears, viewMode);

  function getRecord(row, fy, periodLabel) {
    return row.periods.find(
      (p) => p.fiscal_year === fy && p.period_label === periodLabel
    ) || null;
  }

  async function handleSyncAll() {
    setSyncing(true);
    try {
      await Promise.all(investments.map((inv) => api.syncFinancialTracker(inv.id)));
      await loadGrid();
    } catch (err) {
      alert(err.message);
    } finally {
      setSyncing(false);
    }
  }

  // Year range controls
  const minYear = fiscalYears[0];
  const maxYear = fiscalYears[fiscalYears.length - 1];

  function shiftYears(delta) {
    setFiscalYears((prev) => prev.map((y) => y + delta));
  }

  function addYear() {
    setFiscalYears((prev) => [...prev, prev[prev.length - 1] + 1]);
  }

  function removeYear() {
    if (fiscalYears.length > 1) {
      setFiscalYears((prev) => prev.slice(0, -1));
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-gray-800">Financial Info Tracker</h2>
        <div className="flex items-center gap-1 text-sm">
          <button
            onClick={() => shiftYears(-1)}
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
          >
            ◀
          </button>
          <span className="px-2 text-gray-700">
            FY{minYear}–FY{maxYear}
          </span>
          <button
            onClick={() => shiftYears(1)}
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
          >
            ▶
          </button>
          <button
            onClick={addYear}
            className="px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50"
            title="Add year"
          >
            +
          </button>
          <button
            onClick={removeYear}
            disabled={fiscalYears.length <= 1}
            className="px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50 disabled:opacity-40"
            title="Remove year"
          >
            −
          </button>
        </div>
        <div className="flex rounded border border-gray-300 overflow-hidden text-sm">
          {["quarterly", "monthly"].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 capitalize ${
                viewMode === mode
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {mode === "quarterly" ? "Quarterly" : "Monthly"}
            </button>
          ))}
        </div>
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync All"}
        </button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded border text-xs ${cfg.cls}`}>
              {cfg.icon}
            </span>
            {cfg.label}
          </span>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>
      ) : gridData.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">No investments found.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="text-xs whitespace-nowrap border-collapse">
            <thead>
              {/* FY header row */}
              <tr className="bg-slate-700 text-white">
                <th className="px-4 py-2 text-left font-medium sticky left-0 bg-slate-700 z-10 min-w-[160px]">
                  Company
                </th>
                {fiscalYears.map((fy) => {
                  const colsForFy = columns.filter((c) => c.fy === fy);
                  return (
                    <th
                      key={fy}
                      colSpan={colsForFy.length}
                      className="px-2 py-2 text-center font-medium border-l border-slate-600"
                    >
                      FY{fy}
                    </th>
                  );
                })}
              </tr>
              {/* Period header row */}
              <tr className="bg-slate-600 text-slate-200">
                <th className="px-4 py-1.5 text-left sticky left-0 bg-slate-600 z-10" />
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-2 py-1.5 text-center font-normal border-l border-slate-500 min-w-[52px]"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {gridData.map((row) => (
                <tr key={row.investment_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-800 font-medium sticky left-0 bg-white z-10 border-r border-gray-200">
                    <div className="flex items-center gap-1">
                      <span className="truncate max-w-[140px]" title={row.investment_name}>
                        {row.investment_name}
                      </span>
                      <button
                        onClick={() =>
                          setSettingsInvestment(
                            investments.find((i) => i.id === row.investment_id)
                          )
                        }
                        className="text-gray-400 hover:text-gray-600 shrink-0"
                        title="Settings"
                      >
                        ⚙
                      </button>
                    </div>
                  </td>
                  {columns.map((col) => {
                    const record = getRecord(row, col.fy, col.label === "FY Audited" ? "FY_Audited" : col.label);
                    const status = record?.status || "pending";
                    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
                    const periodLabel = col.label === "FY Audited" ? "FY_Audited" : col.label;
                    const isEditing =
                      editingCell &&
                      editingCell.investmentId === row.investment_id &&
                      editingCell.fy === col.fy &&
                      editingCell.periodLabel === periodLabel;

                    return (
                      <td
                        key={col.key}
                        className="border-l border-gray-100 text-center relative"
                      >
                        <button
                          onClick={() =>
                            setEditingCell(
                              isEditing
                                ? null
                                : {
                                    investmentId: row.investment_id,
                                    fy: col.fy,
                                    periodLabel,
                                    record,
                                  }
                            )
                          }
                          className={`w-full h-full px-1 py-2 flex items-center justify-center rounded transition-colors hover:opacity-80 ${cfg.cls}`}
                          title={`${cfg.label}${record?.notes ? ` — ${record.notes}` : ""}`}
                        >
                          <span className="text-sm">{cfg.icon}</span>
                        </button>
                        {isEditing && (
                          <CellPopover
                            cell={editingCell}
                            onSave={() => {
                              setEditingCell(null);
                              loadGrid();
                            }}
                            onClose={() => setEditingCell(null)}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Settings modal */}
      {settingsInvestment && (
        <SettingsModal
          investment={settingsInvestment}
          onClose={() => setSettingsInvestment(null)}
          onSaved={() => {
            setSettingsInvestment(null);
            loadGrid();
          }}
        />
      )}
    </div>
  );
}
