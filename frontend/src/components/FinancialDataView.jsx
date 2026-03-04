import { useState, useEffect, useCallback, Fragment } from "react";
import { api } from "../api";
import PriorityQueueWidget from "./PriorityQueue";
import RatioKPICards from "./RatioKPICards";

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

function formatCompact(value) {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

function ReviewBadge({ status }) {
  const badge = REVIEW_BADGES[status] || REVIEW_BADGES.pending;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

function MiniBarChart({ values }) {
  if (!values || values.length === 0) return null;
  const nums = values.map((v) => v.value).filter((v) => v != null);
  if (nums.length === 0) return null;
  const max = Math.max(...nums.map(Math.abs));
  if (max === 0) return null;

  const barWidth = Math.max(4, Math.floor(60 / values.length));
  const height = 32;

  return (
    <svg width={barWidth * values.length + 2} height={height} className="inline-block ml-2">
      {values.map((v, i) => {
        if (v.value == null) return null;
        const h = Math.max(2, (Math.abs(v.value) / max) * (height - 4));
        const color = v.value >= 0 ? "#8b5cf6" : "#ef4444";
        return (
          <rect
            key={i}
            x={i * barWidth + 1}
            y={height - h - 2}
            width={barWidth - 1}
            height={h}
            fill={color}
            rx={1}
          >
            <title>{v.period}: {formatNumber(v.value)}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function TrendsPanel({ trends }) {
  if (!trends || Object.keys(trends).length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No trend data available. Map financial statements to this investment first.
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(trends).map(([metric, dataPoints]) => {
        const sorted = [...dataPoints].sort((a, b) =>
          (a.reporting_date || a.period).localeCompare(b.reporting_date || b.period)
        );
        const latest = sorted[sorted.length - 1];
        const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
        const change =
          prev && prev.value && latest.value
            ? ((latest.value - prev.value) / Math.abs(prev.value)) * 100
            : null;

        return (
          <div
            key={metric}
            className="bg-white rounded-lg shadow p-4"
          >
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              {metric}
            </p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xl font-bold text-gray-900">
                  {formatCompact(latest.value)}
                </p>
                {change != null && (
                  <p
                    className={`text-xs font-medium ${
                      change >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(1)}% vs prior
                  </p>
                )}
              </div>
              <MiniBarChart values={sorted} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EditableCell({ item, field, onSave, locked }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");

  const isValue = field === "value";
  const current = isValue
    ? item.edited_value ?? item.value
    : item.edited_label ?? item.label;

  function startEdit() {
    if (locked) return;
    setVal(current != null ? String(current) : "");
    setEditing(true);
  }

  function save() {
    setEditing(false);
    const payload = isValue
      ? { edited_value: val === "" ? null : parseFloat(val) }
      : { edited_label: val || null };
    onSave(item.id, payload);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={isValue ? "number" : "text"}
        step="any"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="w-full px-1 py-0.5 text-sm border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
      />
    );
  }

  const display = isValue ? formatNumber(current) : current;
  const modified = item.is_user_modified && (
    isValue ? item.edited_value != null : item.edited_label != null
  );

  return (
    <span
      onClick={startEdit}
      className={`cursor-pointer hover:bg-purple-50 px-1 rounded ${
        modified ? "bg-purple-50 border-b border-purple-300" : ""
      } ${locked ? "cursor-default" : ""}`}
      title={modified ? "User edited" : locked ? "Locked" : "Click to edit"}
    >
      {display || <span className="text-gray-300">-</span>}
    </span>
  );
}

function PeriodChangesTable({ data }) {
  const [significantOnly, setSignificantOnly] = useState(false);

  if (!data || !data.period_pairs || data.period_pairs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        Need at least two periods to show changes.
      </div>
    );
  }

  const rows = significantOnly
    ? data.rows.filter((row) =>
        Object.values(row.changes || {}).some((c) => c.significant)
      )
    : data.rows;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={significantOnly}
            onChange={(e) => setSignificantOnly(e.target.checked)}
            className="rounded border-gray-300"
          />
          Significant changes only
        </label>
      </div>
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 text-left text-gray-500 uppercase text-xs">
              <th className="px-4 py-3 sticky left-0 bg-gray-50 z-20">Line Item</th>
              {data.period_pairs.map(([from, to]) => (
                <th key={`${from}-${to}`} className="px-4 py-3 text-right whitespace-nowrap" colSpan={2}>
                  {from} &rarr; {to}
                </th>
              ))}
            </tr>
            <tr className="bg-gray-50 text-xs text-gray-400">
              <th className="px-4 py-1 sticky left-0 bg-gray-50 z-20"></th>
              {data.period_pairs.map(([from, to]) => (
                <Fragment key={`${from}-${to}-sub`}>
                  <th className="px-4 py-1 text-right">Abs</th>
                  <th className="px-4 py-1 text-right">%</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, idx) => (
              <tr
                key={idx}
                className={row.is_total ? "bg-gray-50 font-bold" : "hover:bg-gray-50"}
              >
                <td
                  className="px-4 py-2 sticky left-0 bg-inherit whitespace-nowrap"
                  style={{ paddingLeft: `${1 + row.indent_level * 1.25}rem` }}
                >
                  {row.canonical_label}
                </td>
                {data.period_pairs.map(([from, to]) => {
                  const pairKey = `${from} -> ${to}`;
                  const change = row.changes?.[pairKey] || {};
                  const bgColor = change.significant
                    ? change.absolute > 0
                      ? "bg-green-50"
                      : "bg-red-50"
                    : "";
                  const textColor = change.absolute != null
                    ? change.absolute > 0
                      ? "text-green-700"
                      : change.absolute < 0
                        ? "text-red-700"
                        : ""
                    : "text-gray-300";
                  return (
                    <Fragment key={pairKey}>
                      <td className={`px-4 py-2 text-right font-mono ${textColor} ${bgColor}`}>
                        {change.absolute != null ? (
                          <>
                            {change.absolute > 0 ? "+" : ""}
                            {formatNumber(change.absolute)}
                          </>
                        ) : "—"}
                      </td>
                      <td className={`px-4 py-2 text-right font-mono ${textColor} ${bgColor}`}>
                        {change.percent != null ? (
                          <>
                            {change.percent > 0 ? "+" : ""}
                            {change.percent.toFixed(1)}%
                          </>
                        ) : "—"}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparisonTable({ data }) {
  if (!data || !data.periods || data.periods.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No data available for this statement type.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-gray-50 text-left text-gray-500 uppercase text-xs">
            <th className="px-4 py-3 sticky left-0 bg-gray-50 z-20">Line Item</th>
            {data.periods.map((p) => (
              <th key={p} className="px-4 py-3 text-right whitespace-nowrap">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.rows.map((row, idx) => (
            <tr
              key={idx}
              className={row.is_total ? "bg-gray-50 font-bold" : "hover:bg-gray-50"}
            >
              <td
                className="px-4 py-2 sticky left-0 bg-inherit whitespace-nowrap"
                style={{ paddingLeft: `${1 + row.indent_level * 1.25}rem` }}
              >
                {row.canonical_label}
              </td>
              {data.periods.map((p) => {
                const val = row.values[p];
                return (
                  <td
                    key={p}
                    className={`px-4 py-2 text-right font-mono ${
                      val != null && val < 0 ? "text-red-600" : ""
                    }`}
                  >
                    {formatNumber(val)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContextPanel({ statements }) {
  // Show source document info for the currently visible statements
  const docIds = [...new Set(statements.map((s) => s.document_id))];
  const periodCount = new Set(statements.map((s) => s.period)).size;
  const reviewCounts = { pending: 0, reviewed: 0, approved: 0 };
  const lockedCount = statements.filter((s) => s.locked).length;
  statements.forEach((s) => {
    const st = s.review_status || "pending";
    if (reviewCounts[st] !== undefined) reviewCounts[st]++;
  });

  // Normalization completeness
  let totalItems = 0;
  let normalizedItems = 0;
  statements.forEach((s) => {
    (s.line_items || []).forEach((li) => {
      totalItems++;
      if (li.canonical_label) normalizedItems++;
    });
  });
  const normPct = totalItems > 0 ? Math.round((normalizedItems / totalItems) * 100) : 0;

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Summary
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
        <div>
          <p className="text-lg font-bold text-gray-900">{statements.length}</p>
          <p className="text-xs text-gray-500">Statements</p>
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900">{periodCount}</p>
          <p className="text-xs text-gray-500">Periods</p>
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900">{docIds.length}</p>
          <p className="text-xs text-gray-500">Source Docs</p>
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900">{lockedCount}</p>
          <p className="text-xs text-gray-500">Locked</p>
        </div>
        <div>
          <p className={`text-lg font-bold ${normPct === 100 ? "text-green-600" : normPct > 50 ? "text-yellow-600" : "text-gray-900"}`}>
            {normPct}%
          </p>
          <p className="text-xs text-gray-500">Normalized</p>
        </div>
      </div>
      {/* Normalization progress bar */}
      {totalItems > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Label normalization</span>
            <span>{normalizedItems}/{totalItems} items</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${normPct === 100 ? "bg-green-500" : "bg-purple-500"}`}
              style={{ width: `${normPct}%` }}
            />
          </div>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {reviewCounts.pending > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
            {reviewCounts.pending} pending
          </span>
        )}
        {reviewCounts.reviewed > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
            {reviewCounts.reviewed} reviewed
          </span>
        )}
        {reviewCounts.approved > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            {reviewCounts.approved} approved
          </span>
        )}
      </div>
    </div>
  );
}

function StatementCard({ statement, showEdited, onSaveItem, showNormalized }) {
  const locked = statement.locked;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <span className="font-medium text-gray-900 text-sm">
            {statement.fiscal_period_label || statement.period}
          </span>
          {statement.period_end_date && (
            <span className="ml-2 text-xs text-gray-400">
              ending {statement.period_end_date}
            </span>
          )}
          {statement.source_pages && (
            <span className="ml-2 text-xs text-gray-400">
              pp. {statement.source_pages}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ReviewBadge status={statement.review_status} />
          {locked && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
              Locked
            </span>
          )}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-gray-50 text-left text-gray-500 uppercase text-xs">
            <th className="px-4 py-2">Line Item</th>
            <th className="px-4 py-2 text-right">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {(statement.line_items || []).map((item) => (
            <tr
              key={item.id}
              className={item.is_total ? "bg-gray-50" : "hover:bg-gray-50"}
            >
              <td
                className={`px-4 py-2 ${item.is_total ? "font-bold" : ""}`}
                style={{ paddingLeft: `${1 + item.indent_level * 1.25}rem` }}
              >
                {showNormalized && item.canonical_label ? (
                  <span className="text-purple-700" title={`Raw: ${item.label}`}>
                    {item.canonical_label}
                  </span>
                ) : (
                  <EditableCell
                    item={item}
                    field="label"
                    onSave={onSaveItem}
                    locked={locked}
                  />
                )}
                {showNormalized && !item.canonical_label && (
                  <span className="ml-1 text-xs text-orange-400" title="Not normalized">?</span>
                )}
              </td>
              <td className={`px-4 py-2 text-right font-mono ${item.is_total ? "font-bold" : ""}`}>
                <EditableCell
                  item={item}
                  field="value"
                  onSave={onSaveItem}
                  locked={locked}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FinancialDataView({ investmentId, investmentName, onGoToDocuments }) {
  const [statements, setStatements] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [trendsData, setTrendsData] = useState(null);
  const [changesData, setChangesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("income_statement");
  const [viewMode, setViewMode] = useState("ratios"); // ratios | statements | comparison | trends | changes
  const [showEdited, setShowEdited] = useState(true);
  const [showNormalized, setShowNormalized] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stmts, dashboard, trends, changes] = await Promise.all([
        api.getInvestmentFinancials(investmentId),
        api.getDashboardFinancials(investmentId),
        api.getFinancialTrends(investmentId),
        api.getPeriodChanges(investmentId),
      ]);
      setStatements(stmts);
      setDashboardData(dashboard);
      setTrendsData(trends);
      setChangesData(changes);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [investmentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveItem(lineItemId, data) {
    try {
      await api.editLineItem(lineItemId, data);
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

  async function handleNormalize() {
    try {
      const result = await api.normalizeInvestmentLabels(investmentId);
      alert(`Normalized ${result.normalized_count} line items`);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const filteredStatements = statements.filter(
    (s) => s.statement_type === activeTab
  );
  const availableTabs = STATEMENT_TABS.filter((tab) =>
    statements.some((s) => s.statement_type === tab.key)
  );
  const comparisonData =
    dashboardData?.statement_types?.[activeTab] || null;
  const changesForTab =
    changesData?.statement_types?.[activeTab] || null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">
          Financial Data — {investmentName}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNormalize}
            className="text-xs text-purple-600 hover:text-purple-800 font-medium"
          >
            Normalize Labels
          </button>
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showNormalized}
              onChange={(e) => setShowNormalized(e.target.checked)}
              className="rounded border-gray-300"
            />
            Canonical labels
          </label>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="ratios">Ratios & KPIs</option>
            <option value="statements">Statement View</option>
            <option value="comparison">Period Comparison</option>
            <option value="changes">Period Changes</option>
            <option value="trends">Key Trends</option>
          </select>
          {statements.length > 0 && (viewMode === "statements" || viewMode === "comparison" || viewMode === "changes") && (
            <a
              href={
                viewMode === "comparison"
                  ? api.exportComparisonUrl(investmentId)
                  : api.exportStatementsUrl(investmentId)
              }
              className="text-sm text-green-600 hover:text-green-800 font-medium px-3 py-1 border border-green-300 rounded hover:bg-green-50 transition"
            >
              Export Excel
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-2 text-red-700 text-sm mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-bold">&times;</button>
        </div>
      )}

      {/* Priority Queue */}
      {!loading && (
        <PriorityQueueWidget investmentId={investmentId} />
      )}

      {/* Context panel */}
      {!loading && statements.length > 0 && (
        <ContextPanel statements={statements} />
      )}

      {/* Tabs (hide for trends view) */}
      {viewMode !== "trends" && (
        <div className="flex gap-1 mb-4">
          {(availableTabs.length > 0 ? availableTabs : STATEMENT_TABS).map((tab) => {
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
                  <span className="ml-1.5 text-xs text-gray-400">({count})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block w-6 h-6 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mb-2" />
          <p className="text-gray-400 text-sm">Loading financial data...</p>
        </div>
      )}

      {!loading && statements.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-base font-medium text-gray-600 mb-2">No financial data yet</p>
          <p className="text-sm mb-5">
            Upload a PDF, parse it, then map the statements to this investment.
          </p>
          {onGoToDocuments && (
            <button
              onClick={onGoToDocuments}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded transition"
            >
              Go to Documents &rarr;
            </button>
          )}
        </div>
      )}

      {!loading && viewMode === "ratios" && (
        <div>
          <p className="text-xs text-gray-400 mb-4">
            Computed from the most recent available statement of each type. Each card shows its source period.
          </p>
          <RatioKPICards investmentId={investmentId} />
        </div>
      )}

      {!loading && viewMode === "trends" && (
        <TrendsPanel trends={trendsData?.trends} />
      )}

      {!loading && viewMode === "comparison" && (
        <ComparisonTable data={comparisonData} />
      )}

      {!loading && viewMode === "changes" && (
        <PeriodChangesTable data={changesForTab} />
      )}

      {!loading && viewMode === "statements" && (
        <div>
          {filteredStatements.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No {STATEMENT_TABS.find((t) => t.key === activeTab)?.label} found.
            </div>
          ) : (
            filteredStatements.map((stmt) => (
              <div key={stmt.id}>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => handleReview(stmt.id, "reviewed")}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Mark Reviewed
                  </button>
                  <button
                    onClick={() => handleReview(stmt.id, "approved")}
                    className="text-xs text-green-600 hover:text-green-800 font-medium"
                  >
                    Approve
                  </button>
                  {!stmt.locked && (
                    <button
                      onClick={() => handleLock(stmt.id)}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                    >
                      Lock
                    </button>
                  )}
                </div>
                <StatementCard
                  statement={stmt}
                  showEdited={showEdited}
                  onSaveItem={handleSaveItem}
                  showNormalized={showNormalized}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
