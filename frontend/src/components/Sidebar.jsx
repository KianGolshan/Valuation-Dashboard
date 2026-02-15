import { useState } from "react";

const WORKFLOW_COLORS = {
  approved: "bg-green-400",
  reviewed: "bg-blue-400",
  mapped: "bg-purple-400",
  partially_mapped: "bg-purple-300",
  parsed: "bg-yellow-400",
  not_parsed: "bg-slate-500",
};

const WORKFLOW_LABELS = {
  approved: "Approved",
  reviewed: "Reviewed",
  mapped: "Mapped",
  partially_mapped: "Partially Mapped",
  parsed: "Parsed",
  not_parsed: "Not Parsed",
};

function WorkflowDot({ data }) {
  if (!data) return null;
  const color = WORKFLOW_COLORS[data.overall_status] || "bg-slate-500";
  const label = WORKFLOW_LABELS[data.overall_status] || data.overall_status;
  const fraction =
    data.total_statements > 0
      ? `${data.total_approved}/${data.total_statements}`
      : null;
  return (
    <span className="flex items-center gap-1 ml-auto shrink-0" title={`${label}${fraction ? ` (${fraction} approved)` : ""}`}>
      {fraction && (
        <span className="text-[10px] text-slate-400">{fraction}</span>
      )}
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
    </span>
  );
}

const ASSET_TYPE_COLORS = {
  equity: "bg-blue-500",
  debt: "bg-amber-500",
  "real estate": "bg-emerald-500",
  fund: "bg-purple-500",
  crypto: "bg-orange-500",
};

function AssetBadge({ type }) {
  if (!type) return null;
  const color = ASSET_TYPE_COLORS[type.toLowerCase()] || "bg-slate-500";
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5 shrink-0`} title={type} />
  );
}

export default function Sidebar({
  investments,
  selectedInvestmentId,
  selectedSecurityId,
  onSelectInvestment,
  onSelectSecurity,
  onAdd,
  onEdit,
  onDelete,
  onAddSecurity,
  onDeleteSecurity,
  workflowData,
}) {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [search, setSearch] = useState("");

  function toggleExpand(id, e) {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = search
    ? investments.filter((inv) => {
        const q = search.toLowerCase();
        return (
          inv.investment_name.toLowerCase().includes(q) ||
          (inv.asset_type && inv.asset_type.toLowerCase().includes(q))
        );
      })
    : investments;

  return (
    <aside className="w-72 bg-slate-800 text-white flex flex-col">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-slate-400">
          Investments
        </h2>
        <button
          onClick={onAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded transition"
        >
          + Add
        </button>
      </div>
      {/* Search filter */}
      <div className="px-3 py-2 border-b border-slate-700">
        <input
          type="text"
          placeholder="Filter investments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-700 text-white text-xs px-3 py-1.5 rounded border border-slate-600 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <ul className="flex-1 overflow-auto">
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center text-slate-500 text-sm">
            {search ? "No matches" : "No investments yet"}
          </li>
        )}
        {filtered.map((inv) => {
          const isExpanded = expandedIds.has(inv.id);
          const hasSecs = inv.securities && inv.securities.length > 0;
          const isSelected =
            selectedInvestmentId === inv.id && !selectedSecurityId;

          return (
            <li key={inv.id} className="border-b border-slate-700">
              <div
                onClick={() => onSelectInvestment(inv.id)}
                className={`px-4 py-3 cursor-pointer transition group flex items-start ${
                  isSelected
                    ? "bg-slate-700"
                    : "hover:bg-slate-700/50"
                }`}
              >
                {/* Expand/collapse toggle */}
                <button
                  onClick={(e) => toggleExpand(inv.id, e)}
                  className="text-slate-400 hover:text-white text-xs mr-2 mt-0.5 w-4 shrink-0"
                >
                  {hasSecs ? (isExpanded ? "\u25BC" : "\u25B6") : "\u00A0"}
                </button>

                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate flex items-center">
                    <AssetBadge type={inv.asset_type} />
                    <span className="truncate">{inv.investment_name}</span>
                    <WorkflowDot data={workflowData && workflowData[inv.id]} />
                  </p>
                  {inv.asset_type && (
                    <p className="text-xs text-slate-400 mt-0.5 pl-3.5">
                      {inv.asset_type}
                      {inv.securities?.length > 0 && (
                        <span className="ml-1 text-slate-500">
                          · {inv.securities.length} sec
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ml-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddSecurity(inv.id);
                    }}
                    className="text-slate-400 hover:text-green-400 text-xs p-1"
                    title="Add Security"
                  >
                    +
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(inv);
                    }}
                    className="text-slate-400 hover:text-blue-400 text-xs p-1"
                    title="Edit"
                  >
                    &#9998;
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(inv.id);
                    }}
                    className="text-slate-400 hover:text-red-400 text-xs p-1"
                    title="Delete"
                  >
                    &#10005;
                  </button>
                </div>
              </div>

              {/* Securities children */}
              {isExpanded && hasSecs && (
                <ul className="bg-slate-900/50">
                  {inv.securities.map((sec) => {
                    const isSecSelected =
                      selectedInvestmentId === inv.id &&
                      selectedSecurityId === sec.id;
                    return (
                      <li
                        key={sec.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSecurity(inv.id, sec.id);
                        }}
                        className={`pl-10 pr-4 py-2 cursor-pointer text-sm transition group/sec flex items-center justify-between ${
                          isSecSelected
                            ? "bg-slate-600"
                            : "hover:bg-slate-700/50"
                        }`}
                      >
                        <span className="truncate text-slate-300">
                          {sec.investment_round || sec.description || `Security #${sec.id}`}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSecurity(inv.id, sec.id);
                          }}
                          className="text-slate-500 hover:text-red-400 text-xs p-1 opacity-0 group-hover/sec:opacity-100 transition shrink-0 ml-2"
                          title="Delete Security"
                        >
                          &#10005;
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
