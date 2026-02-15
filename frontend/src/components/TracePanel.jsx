import { useState, useEffect } from "react";
import { api } from "../api";

function ConfidenceBadge({ confidence }) {
  if (confidence == null) return <span className="text-xs text-gray-400">—</span>;
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

export default function TracePanel({ lineItemId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lineItemId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const ctx = await api.getLineItemSourceContext(lineItemId);
        if (!cancelled) setData(ctx);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [lineItemId]);

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-[70]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-xl z-[70] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <h3 className="font-semibold text-gray-900 text-sm">Extraction Trace</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
            </div>
          )}

          {!loading && !data && (
            <div className="text-center py-8 text-gray-400 text-sm px-4">
              No provenance data available for this line item.
            </div>
          )}

          {!loading && data && (
            <div className="p-4 space-y-4">
              {/* Source info */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Source Page</span>
                  <span className="text-sm font-medium text-gray-900">
                    {data.source_page || "Unknown"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Confidence</span>
                  <ConfidenceBadge confidence={data.extraction_confidence} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Original Value</span>
                  <span className="text-sm font-mono text-gray-700">
                    {data.original_value != null
                      ? data.original_value.toLocaleString("en-US", { minimumFractionDigits: 2 })
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Current Value</span>
                  <span className="text-sm font-mono text-gray-700">
                    {data.current_value != null
                      ? data.current_value.toLocaleString("en-US", { minimumFractionDigits: 2 })
                      : "—"}
                  </span>
                </div>
                {data.is_user_modified && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 uppercase tracking-wide">Modified By</span>
                    <span className="text-sm text-purple-600">
                      {data.last_modified_by || "User"}
                      {data.last_modified_at && (
                        <span className="text-xs text-gray-400 ml-1">
                          {new Date(data.last_modified_at).toLocaleDateString()}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Extracted snippet */}
              {data.extracted_text_snippet && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Extracted Snippet</p>
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                    <p className="text-sm font-mono text-yellow-900">{data.extracted_text_snippet}</p>
                  </div>
                </div>
              )}

              {/* Page thumbnail with bbox */}
              {data.page_image_b64 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Source Page</p>
                  <div className="relative border border-gray-200 rounded overflow-hidden">
                    <img
                      src={`data:image/png;base64,${data.page_image_b64}`}
                      alt={`Page ${data.source_page}`}
                      className="w-full"
                    />
                    {data.source_bbox && data.source_bbox.length === 4 && (
                      <svg
                        className="absolute top-0 left-0 w-full h-full pointer-events-none"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                      >
                        <rect
                          x={`${data.source_bbox[0]}%`}
                          y={`${data.source_bbox[1]}%`}
                          width={`${data.source_bbox[2] - data.source_bbox[0]}%`}
                          height={`${data.source_bbox[3] - data.source_bbox[1]}%`}
                          fill="rgba(168, 85, 247, 0.15)"
                          stroke="#a855f7"
                          strokeWidth="0.5"
                          rx="0.3"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              )}

              {/* Edit history timeline */}
              {data.edit_history && data.edit_history.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Edit History</p>
                  <div className="space-y-2">
                    {data.edit_history.map((log) => (
                      <div
                        key={log.id}
                        className="border-l-2 border-purple-300 pl-3 py-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700 capitalize">
                            {log.field}
                          </span>
                          {log.user && (
                            <span className="text-xs text-gray-400">by {log.user}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          <span className="line-through text-red-400">{log.old_value}</span>
                          {" "}
                          <span className="text-green-600">{log.new_value}</span>
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
