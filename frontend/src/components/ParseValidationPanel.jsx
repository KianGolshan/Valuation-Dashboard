import { useState, useEffect, useCallback } from "react";
import { api } from "../api";

const STATEMENT_TABS = [
  { key: "income_statement", label: "Income Statement" },
  { key: "balance_sheet", label: "Balance Sheet" },
  { key: "cash_flow", label: "Cash Flow" },
];

function ConfidenceBadge({ confidence }) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  let cls = "bg-green-100 text-green-700";
  if (confidence < 0.6) cls = "bg-red-100 text-red-700";
  else if (confidence < 0.8) cls = "bg-yellow-100 text-yellow-700";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full ${cls}`}>
      {pct}%
    </span>
  );
}

function ParsedStatementPanel({
  statements,
  activeTab,
  selectedItemId,
  onSelectItem,
  onConfirm,
  onEdit,
}) {
  const filtered = statements.filter((s) => s.statement_type === activeTab);

  if (filtered.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No statements found for this type.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filtered.map((stmt) => (
        <div key={stmt.id}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-gray-700">{stmt.period}</span>
            {stmt.period_end_date && (
              <span className="text-xs text-gray-400">ending {stmt.period_end_date}</span>
            )}
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500 uppercase text-xs">
                  <th className="px-3 py-2">Line Item</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2 text-center w-16">Conf</th>
                  <th className="px-3 py-2 text-center w-12">Pg</th>
                  <th className="px-3 py-2 text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(stmt.line_items || []).map((item) => {
                  const isSelected = item.id === selectedItemId;
                  const val = item.edited_value ?? item.value;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => onSelectItem(item)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? "bg-purple-50 border-l-2 border-purple-500"
                          : item.is_total
                            ? "bg-gray-50"
                            : "hover:bg-gray-50"
                      }`}
                    >
                      <td
                        className={`px-3 py-2 ${item.is_total ? "font-bold" : ""}`}
                        style={{ paddingLeft: `${0.75 + item.indent_level * 1}rem` }}
                      >
                        {item.edited_label || item.label}
                        {item.is_user_modified && (
                          <span className="ml-1 text-purple-400 text-xs">*</span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${
                        val != null && val < 0 ? "text-red-600" : ""
                      } ${item.is_total ? "font-bold" : ""}`}>
                        {val != null ? val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <ConfidenceBadge confidence={item.extraction_confidence} />
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-gray-500">
                        {item.source_page || "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onConfirm(item.id)}
                            className="text-xs text-green-600 hover:text-green-800"
                            title="Confirm correct"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => onEdit(item)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                            title="Edit value"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProvenancePdfViewer({ sourceContext }) {
  if (!sourceContext) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Select a line item to view its source
      </div>
    );
  }

  const { page_image_b64, source_bbox, extraction_confidence, extracted_text_snippet, edit_history } = sourceContext;

  return (
    <div className="h-full flex flex-col">
      {/* Info bar */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0">
        <span className="text-xs text-gray-500">
          Page {sourceContext.source_page || "—"}
        </span>
        <ConfidenceBadge confidence={extraction_confidence} />
        {sourceContext.is_user_modified && (
          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
            User Edited
          </span>
        )}
      </div>

      {/* Snippet */}
      {extracted_text_snippet && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 shrink-0">
          <p className="text-xs text-yellow-800 font-medium mb-0.5">Extracted Text</p>
          <p className="text-sm text-yellow-900 font-mono">{extracted_text_snippet}</p>
        </div>
      )}

      {/* Page image with bbox overlay */}
      <div className="flex-1 overflow-auto p-4 bg-gray-100">
        {page_image_b64 ? (
          <div className="relative inline-block">
            <img
              src={`data:image/png;base64,${page_image_b64}`}
              alt="Source page"
              className="max-w-full rounded shadow"
            />
            {source_bbox && source_bbox.length === 4 && (
              <svg
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <rect
                  x={`${source_bbox[0]}%`}
                  y={`${source_bbox[1]}%`}
                  width={`${source_bbox[2] - source_bbox[0]}%`}
                  height={`${source_bbox[3] - source_bbox[1]}%`}
                  fill="rgba(168, 85, 247, 0.15)"
                  stroke="#a855f7"
                  strokeWidth="0.5"
                  rx="0.3"
                />
              </svg>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-sm">
            No page image available for this line item.
          </div>
        )}
      </div>

      {/* Edit history */}
      {edit_history && edit_history.length > 0 && (
        <div className="bg-white border-t border-gray-200 px-4 py-2 shrink-0 max-h-32 overflow-auto">
          <p className="text-xs font-medium text-gray-500 mb-1">Edit History</p>
          {edit_history.map((log) => (
            <div key={log.id} className="text-xs text-gray-600 py-0.5">
              <span className="font-medium">{log.field}</span>: {log.old_value} &rarr; {log.new_value}
              {log.user && <span className="text-gray-400 ml-1">by {log.user}</span>}
              <span className="text-gray-400 ml-1">{new Date(log.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineEditor({ item, onSave, onCancel }) {
  const [label, setLabel] = useState(item.edited_label || item.label);
  const [value, setValue] = useState(
    (item.edited_value ?? item.value) != null ? String(item.edited_value ?? item.value) : ""
  );

  function handleSubmit(e) {
    e.preventDefault();
    onSave(item.id, {
      edited_label: label !== item.label ? label : undefined,
      edited_value: value !== "" ? parseFloat(value) : null,
    });
  }

  return (
    <div className="bg-white border border-purple-200 rounded-lg p-3 mb-3 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-2">
        <div>
          <label className="text-xs text-gray-500">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Value</label>
          <input
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ParseValidationPanel({ investmentId, document, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("income_statement");
  const [selectedItem, setSelectedItem] = useState(null);
  const [sourceContext, setSourceContext] = useState(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await api.getDocumentFinancials(investmentId, document.id);
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [investmentId, document.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Load source context when selected item changes
  const selectedItemId = selectedItem ? selectedItem.id : null;
  useEffect(() => {
    if (!selectedItemId) {
      setSourceContext(null);
      return;
    }
    let cancelled = false;
    async function fetchContext() {
      setLoadingContext(true);
      try {
        const ctx = await api.getLineItemSourceContext(selectedItemId);
        if (!cancelled) setSourceContext(ctx);
      } catch {
        if (!cancelled) setSourceContext(null);
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    }
    fetchContext();
    return () => { cancelled = true; };
  }, [selectedItemId]);

  async function handleConfirm(lineItemId) {
    try {
      await api.confirmLineItem(lineItemId);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleEditSave(lineItemId, editData) {
    try {
      await api.editLineItem(lineItemId, editData);
      setEditingItem(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  // Navigate flagged items (low confidence)
  function getFlaggedItems() {
    if (!data?.statements) return [];
    return data.statements
      .filter((s) => s.statement_type === activeTab)
      .flatMap((s) => s.line_items || [])
      .filter((li) => li.extraction_confidence != null && li.extraction_confidence < 0.8);
  }

  function navigateFlagged(direction) {
    const flagged = getFlaggedItems();
    if (flagged.length === 0) return;
    const currentIdx = flagged.findIndex((li) => li.id === selectedItem?.id);
    const nextIdx = direction === "next"
      ? (currentIdx + 1) % flagged.length
      : (currentIdx - 1 + flagged.length) % flagged.length;
    setSelectedItem(flagged[nextIdx]);
  }

  const statements = data?.statements || [];
  const availableTabs = STATEMENT_TABS.filter((tab) =>
    statements.some((s) => s.statement_type === tab.key)
  );
  const flaggedCount = getFlaggedItems().length;

  // Overall confidence
  const allItems = statements.flatMap((s) => s.line_items || []);
  const confItems = allItems.filter((li) => li.extraction_confidence != null);
  const avgConf = confItems.length > 0
    ? confItems.reduce((sum, li) => sum + li.extraction_confidence, 0) / confItems.length
    : null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h3 className="font-semibold text-gray-900">Parse Validation</h3>
            <p className="text-xs text-gray-500">
              {document.document_name} — {document.original_filename}
            </p>
          </div>
          {avgConf != null && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Overall:</span>
              <ConfidenceBadge confidence={avgConf} />
            </div>
          )}
          {flaggedCount > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-orange-600">{flaggedCount} flagged</span>
              <button
                onClick={() => navigateFlagged("prev")}
                className="text-xs text-gray-500 hover:text-gray-700 px-1"
              >
                &larr;
              </button>
              <button
                onClick={() => navigateFlagged("next")}
                className="text-xs text-gray-500 hover:text-gray-700 px-1"
              >
                &rarr;
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
        >
          &times;
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6 flex gap-1 shrink-0">
        {(availableTabs.length > 0 ? availableTabs : STATEMENT_TABS).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? "text-purple-700 border-b-2 border-purple-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-red-700 text-sm shrink-0">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-bold">&times;</button>
        </div>
      )}

      {/* Dual panel body */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Parsed data */}
        <div className="w-1/2 overflow-auto p-4 bg-gray-50 border-r border-gray-200">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block w-6 h-6 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mb-2" />
              <p className="text-gray-400 text-sm">Loading...</p>
            </div>
          ) : (
            <>
              {editingItem && (
                <InlineEditor
                  item={editingItem}
                  onSave={handleEditSave}
                  onCancel={() => setEditingItem(null)}
                />
              )}
              <ParsedStatementPanel
                statements={statements}
                activeTab={activeTab}
                selectedItemId={selectedItem?.id}
                onSelectItem={setSelectedItem}
                onConfirm={handleConfirm}
                onEdit={setEditingItem}
              />
            </>
          )}
        </div>

        {/* RIGHT: Source context / PDF */}
        <div className="w-1/2 overflow-hidden bg-white">
          {loadingContext ? (
            <div className="flex items-center justify-center h-full">
              <div className="inline-block w-6 h-6 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
            </div>
          ) : (
            <ProvenancePdfViewer sourceContext={sourceContext} />
          )}
        </div>
      </div>
    </div>
  );
}
