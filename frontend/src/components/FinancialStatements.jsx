import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import TracePanel from "./TracePanel";

const STATEMENT_TABS = [
  { key: "income_statement", label: "Income Statement" },
  { key: "balance_sheet", label: "Balance Sheet" },
  { key: "cash_flow", label: "Cash Flow" },
];

const REVIEW_BADGES = {
  pending: { label: "Pending", cls: "bg-yellow-100 text-yellow-700" },
  reviewed: { label: "Reviewed", cls: "bg-blue-100 text-blue-700" },
  approved: { label: "Approved", cls: "bg-green-100 text-green-700" },
};

function formatNumber(value) {
  if (value == null) return "";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function ReviewBadge({ status }) {
  const badge = REVIEW_BADGES[status] || REVIEW_BADGES.pending;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

function EditableValue({ item, onSave, locked }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const current = item.edited_value ?? item.value;

  function startEdit() {
    if (locked) return;
    setVal(current != null ? String(current) : "");
    setEditing(true);
  }

  function save() {
    setEditing(false);
    const parsed = val === "" ? null : parseFloat(val);
    if (parsed !== current) {
      onSave(item.id, { edited_value: parsed });
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        step="any"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-24 px-1 py-0.5 text-sm text-right border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
      />
    );
  }

  const modified = item.is_user_modified && item.edited_value != null;
  return (
    <span
      onClick={startEdit}
      className={`cursor-pointer hover:bg-purple-50 px-1 rounded ${
        modified ? "bg-purple-50 border-b border-purple-300" : ""
      } ${locked ? "cursor-default" : ""}`}
      title={modified ? "User edited" : locked ? "Locked" : "Click to edit"}
    >
      {formatNumber(current)}
    </span>
  );
}

/** Derive a suggested standard period label from an ISO date string */
function deriveStandardLabel(periodEndDate, statementPeriod) {
  // Try to infer from the period_end_date
  if (periodEndDate) {
    try {
      const d = new Date(periodEndDate + "T00:00:00");
      const month = d.getMonth() + 1; // 1-indexed
      const year = d.getFullYear();
      const q = Math.ceil(month / 3);
      return `Q${q} FY${year}`;
    } catch { /* fall through */ }
  }
  return "";
}

const STANDARD_PERIOD_OPTIONS = (year) => [
  `Q1 FY${year}`, `Q2 FY${year}`, `Q3 FY${year}`, `Q4 FY${year}`,
  `FY${year}`, `FY${year} Audited`,
  `Q1 FY${year - 1}`, `Q2 FY${year - 1}`, `Q3 FY${year - 1}`, `Q4 FY${year - 1}`,
  `FY${year - 1}`, `FY${year - 1} Audited`,
];

function StatementTable({ statement, onSaveItem, onReview, onLock, investmentId, onTrace }) {
  const [mapping, setMapping] = useState(false);
  const [showMapForm, setShowMapForm] = useState(false);
  const [mapError, setMapError] = useState("");

  const currentYear = new Date().getFullYear();
  const suggested = deriveStandardLabel(statement.period_end_date, statement.period);
  const [periodLabel, setPeriodLabel] = useState(suggested || `Q1 FY${currentYear}`);
  const [customLabel, setCustomLabel] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  if (!statement || !statement.line_items || statement.line_items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No line items found for this statement.
      </div>
    );
  }

  async function handleMap() {
    setMapping(true);
    setMapError("");
    const label = useCustom ? customLabel.trim() : periodLabel;
    if (!label) {
      setMapError("Period label is required.");
      setMapping(false);
      return;
    }
    try {
      await api.mapStatementToInvestment(statement.id, {
        investment_id: investmentId,
        reporting_date: statement.period_end_date,
        fiscal_period_label: label,
      });
      setShowMapForm(false);
    } catch (e) {
      setMapError(e.message || "Mapping failed.");
    }
    setMapping(false);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-900">{statement.period}</span>
          {statement.period_end_date && (
            <span className="text-xs text-gray-400">
              Ending: {statement.period_end_date}
            </span>
          )}
          <ReviewBadge status={statement.review_status} />
          {statement.locked && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
              Locked
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!statement.investment_id && !showMapForm && (
            <button
              onClick={() => setShowMapForm(true)}
              className="text-xs text-purple-600 hover:text-purple-800 font-medium"
            >
              Map to Investment
            </button>
          )}
          {!statement.investment_id && showMapForm && (
            <div className="flex items-center gap-1 flex-wrap bg-purple-50 border border-purple-200 rounded px-2 py-1">
              <span className="text-xs text-gray-600 mr-1">Period label:</span>
              {!useCustom ? (
                <select
                  value={periodLabel}
                  onChange={(e) => setPeriodLabel(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-purple-400"
                >
                  {STANDARD_PERIOD_OPTIONS(currentYear).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="e.g. Q1 FY2025"
                  className="text-xs border border-gray-300 rounded px-1 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-purple-400"
                />
              )}
              <button
                onClick={() => setUseCustom(!useCustom)}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                {useCustom ? "Dropdown" : "Custom"}
              </button>
              <button
                onClick={handleMap}
                disabled={mapping}
                className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-2 py-0.5 rounded disabled:opacity-50"
              >
                {mapping ? "Saving..." : "Confirm"}
              </button>
              <button
                onClick={() => { setShowMapForm(false); setMapError(""); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
              {mapError && <span className="text-xs text-red-500 w-full mt-0.5">{mapError}</span>}
            </div>
          )}
          {statement.investment_id && (
            <span className="text-xs text-green-600 font-medium">
              ✓ Mapped{statement.fiscal_period_label ? ` · ${statement.fiscal_period_label}` : ""}
            </span>
          )}
          <button
            onClick={() => onReview(statement.id, "reviewed")}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Review
          </button>
          <button
            onClick={() => onReview(statement.id, "approved")}
            className="text-xs text-green-600 hover:text-green-800 font-medium"
          >
            Approve
          </button>
          {!statement.locked && (
            <button
              onClick={() => onLock(statement.id)}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              Lock
            </button>
          )}
        </div>
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 text-left text-gray-500 uppercase text-xs">
              <th className="px-4 py-3">Line Item</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {statement.line_items.map((item) => (
              <tr
                key={item.id}
                className={`${item.is_total ? "bg-gray-50" : "hover:bg-gray-50"}`}
              >
                <td
                  className={`px-4 py-2 ${item.is_total ? "font-bold text-gray-900" : "text-gray-700"}`}
                  style={{ paddingLeft: `${1 + item.indent_level * 1.25}rem` }}
                >
                  {item.edited_label || item.label}
                  {item.is_user_modified && (
                    <span className="ml-1 text-purple-400 text-xs">*</span>
                  )}
                </td>
                <td
                  className={`px-4 py-2 text-right font-mono ${
                    item.is_total ? "font-bold text-gray-900" : "text-gray-700"
                  } ${(item.edited_value ?? item.value) != null && (item.edited_value ?? item.value) < 0 ? "text-red-600" : ""}`}
                >
                  <EditableValue
                    item={item}
                    onSave={onSaveItem}
                    locked={statement.locked}
                  />
                </td>
                <td className="px-1 py-2 text-center">
                  <button
                    onClick={() => onTrace(item.id)}
                    className="text-gray-400 hover:text-purple-600 transition"
                    title="View extraction trace"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(statement.currency || statement.unit) && (
        <div className="mt-2 text-xs text-gray-400 text-right">
          {statement.currency && <span>Currency: {statement.currency}</span>}
          {statement.currency && statement.unit && <span> | </span>}
          {statement.unit && <span>Unit: {statement.unit}</span>}
        </div>
      )}
    </div>
  );
}

function ParseHistoryPanel({ history }) {
  const [open, setOpen] = useState(false);
  if (!history || history.length <= 1) return null;

  const STATUS_COLORS = {
    completed: "text-green-600",
    failed: "text-red-600",
    processing: "text-yellow-600",
    pending: "text-gray-500",
  };

  return (
    <div className="bg-white rounded-lg shadow mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 text-left text-sm font-medium text-gray-700 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <span>Parse History ({history.length} runs)</span>
        <span className="text-gray-400">{open ? "\u25B2" : "\u25BC"}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 uppercase text-xs">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Chunks</th>
                <th className="px-4 py-2">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.map((job, idx) => (
                <tr key={job.id} className={idx === 0 ? "bg-purple-50" : "hover:bg-gray-50"}>
                  <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                    {new Date(job.created_at).toLocaleString()}
                    {idx === 0 && (
                      <span className="ml-2 text-xs text-purple-600 font-medium">Latest</span>
                    )}
                  </td>
                  <td className={`px-4 py-2 font-medium ${STATUS_COLORS[job.status] || "text-gray-500"}`}>
                    {job.status}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {job.completed_chunks}/{job.total_chunks}
                  </td>
                  <td className="px-4 py-2 text-red-500 text-xs truncate max-w-[200px]">
                    {job.error_message || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function FinancialStatements({
  investmentId,
  document,
  onClose,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("income_statement");
  const [parseHistory, setParseHistory] = useState([]);
  const [tracingItemId, setTracingItemId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [result, history] = await Promise.all([
        api.getDocumentFinancials(investmentId, document.id),
        api.getParseHistory(investmentId, document.id).catch(() => []),
      ]);
      setData(result);
      setParseHistory(history);
      if (
        result.parse_job &&
        (result.parse_job.status === "processing" ||
          result.parse_job.status === "pending")
      ) {
        setParsing(true);
      } else {
        setParsing(false);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [investmentId, document.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while parsing — track consecutive failures to surface network issues
  useEffect(() => {
    if (!parsing) return;
    let failCount = 0;
    const interval = setInterval(async () => {
      try {
        const status = await api.getParseStatus(investmentId, document.id);
        failCount = 0; // reset on success
        if (!status || status.status === "completed" || status.status === "failed") {
          setParsing(false);
          load();
        } else {
          setData((prev) =>
            prev ? { ...prev, parse_job: status } : prev
          );
        }
      } catch {
        failCount += 1;
        if (failCount >= 3) {
          setError(
            "Connection issue while checking parse status. Parsing may still be running — refresh to check."
          );
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [parsing, investmentId, document.id, load]);

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleParse() {
    setError("");
    try {
      await api.triggerParsing(investmentId, document.id);
      setParsing(true);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSaveItem(lineItemId, editData) {
    try {
      await api.editLineItem(lineItemId, editData);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleReview(statementId, status) {
    try {
      await api.reviewStatement(statementId, { review_status: status });
      if (status === "approved") {
        window.dispatchEvent(new CustomEvent("statements-approved"));
      }
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleLock(statementId) {
    if (!confirm("Lock this statement? No further edits will be allowed.")) return;
    try {
      await api.lockStatement(statementId);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const job = data?.parse_job;
  const statements = data?.statements || [];
  const statementsForTab = statements.filter(
    (s) => s.statement_type === activeTab
  );
  const availableTabs = STATEMENT_TABS.filter((tab) =>
    statements.some((s) => s.statement_type === tab.key)
  );
  const hasStatements = statements.length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-semibold text-gray-900">
            Financial Statements
          </h3>
          <p className="text-xs text-gray-500">
            {document.document_name} — {document.original_filename}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasStatements && (
            <a
              href={api.exportFinancialsUrl(investmentId, document.id)}
              className="text-green-600 hover:text-green-800 text-sm font-medium"
            >
              Export Excel
            </a>
          )}
          <button
            onClick={handleParse}
            disabled={parsing}
            className={`text-sm font-medium px-3 py-1.5 rounded transition ${
              parsing
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700 text-white"
            }`}
          >
            {parsing
              ? "Parsing..."
              : hasStatements
                ? "Re-parse"
                : "Parse"}
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto bg-gray-100 p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded px-4 py-2 text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Parsing progress */}
        {parsing && job && (
          <div className="bg-white rounded-lg shadow p-6 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Parsing in progress...
              </span>
              <span className="text-sm text-gray-500">
                {job.completed_chunks} / {job.total_chunks} chunks
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-purple-600 h-3 rounded-full transition-all duration-500"
                style={{
                  width: `${
                    job.total_chunks > 0
                      ? (job.completed_chunks / job.total_chunks) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Failed state */}
        {job && job.status === "failed" && !parsing && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-4">
            <p className="text-red-700 font-medium mb-1">Parsing failed</p>
            <p className="text-red-600 text-sm">{job.error_message}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mb-2" />
            <p className="text-gray-400 text-sm">Loading statements...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !parsing && !hasStatements && (
          <div className="text-center py-16">
            <p className="text-gray-400 mb-4">
              No financial statements have been extracted from this document yet.
            </p>
            <button
              onClick={handleParse}
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-6 py-2.5 rounded transition"
            >
              Parse Financial Statements
            </button>
          </div>
        )}

        {/* Parse history */}
        {!loading && <ParseHistoryPanel history={parseHistory} />}

        {/* Statements view */}
        {!loading && hasStatements && (
          <div>
            {/* Tabs */}
            <div className="flex gap-1 mb-4">
              {(availableTabs.length > 0 ? availableTabs : STATEMENT_TABS).map(
                (tab) => {
                  const count = statements.filter(
                    (s) => s.statement_type === tab.key
                  ).length;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                        activeTab === tab.key
                          ? "bg-white text-purple-700 shadow"
                          : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
                      }`}
                    >
                      {tab.label}
                      {count > 0 && (
                        <span className="ml-1.5 text-xs text-gray-400">
                          ({count})
                        </span>
                      )}
                    </button>
                  );
                }
              )}
            </div>

            {/* Statement content */}
            {statementsForTab.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No {STATEMENT_TABS.find((t) => t.key === activeTab)?.label || ""}{" "}
                found in this document.
              </div>
            ) : (
              <div className="space-y-6">
                {statementsForTab.map((stmt) => (
                  <StatementTable
                    key={stmt.id}
                    statement={stmt}
                    onSaveItem={handleSaveItem}
                    onReview={handleReview}
                    onLock={handleLock}
                    investmentId={investmentId}
                    onTrace={setTracingItemId}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {tracingItemId && (
        <TracePanel
          lineItemId={tracingItemId}
          onClose={() => setTracingItemId(null)}
        />
      )}
    </div>
  );
}
