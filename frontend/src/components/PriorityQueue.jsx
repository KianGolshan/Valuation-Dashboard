import { useState, useEffect } from "react";
import { api } from "../api";

const ISSUE_BADGES = {
  parse_failure: { label: "Parse Failed", cls: "bg-red-100 text-red-700" },
  never_parsed: { label: "Not Parsed", cls: "bg-gray-100 text-gray-700" },
  missing_statement: { label: "Missing Type", cls: "bg-orange-100 text-orange-700" },
  low_confidence: { label: "Low Confidence", cls: "bg-yellow-100 text-yellow-700" },
  pending_review: { label: "Pending Review", cls: "bg-blue-100 text-blue-700" },
};

function IssueBadge({ issue }) {
  const badge = ISSUE_BADGES[issue.type] || { label: issue.type, cls: "bg-gray-100 text-gray-600" };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}
      title={issue.detail}
    >
      {badge.label}
    </span>
  );
}

export default function PriorityQueueWidget({ investmentId }) {
  const [items, setItems] = useState([]);
  const [collapsed, setCollapsed] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = investmentId
          ? await api.getInvestmentPriorityQueue(investmentId)
          : await api.getPriorityQueue();
        setItems(data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [investmentId]);

  if (loading || items.length === 0) return null;

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-3 text-left flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className="text-orange-600 font-medium text-sm">
            Priority Review Queue
          </span>
          <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full">
            {items.length} document{items.length !== 1 ? "s" : ""}
          </span>
        </div>
        <span className="text-orange-400 text-sm">{collapsed ? "\u25BC" : "\u25B2"}</span>
      </button>
      {!collapsed && (
        <div className="border-t border-orange-200 px-4 py-2 space-y-2">
          {items.map((item) => (
            <div
              key={item.document_id}
              className="flex items-center justify-between py-1.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-gray-800 truncate">
                  {item.document_name || item.original_filename}
                </span>
                <span className="text-xs text-gray-400 font-mono">
                  Score: {item.priority_score}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {item.issues.map((issue, idx) => (
                  <IssueBadge key={idx} issue={issue} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
