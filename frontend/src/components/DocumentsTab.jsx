import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import DocumentViewer from "./DocumentViewer";
import FinancialStatements from "./FinancialStatements";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const WORKFLOW_BADGES = {
  not_parsed: { label: "Not Parsed", cls: "bg-gray-100 text-gray-600" },
  parsed: { label: "Parsed", cls: "bg-yellow-100 text-yellow-700" },
  partially_mapped: { label: "Partially Mapped", cls: "bg-purple-50 text-purple-600" },
  mapped: { label: "Mapped", cls: "bg-purple-100 text-purple-700" },
  reviewed: { label: "Reviewed", cls: "bg-blue-100 text-blue-700" },
  approved: { label: "Approved", cls: "bg-green-100 text-green-700" },
};

const WORKFLOW_OPTIONS = [
  { value: "", label: "All Stages" },
  { value: "not_parsed", label: "Not Parsed" },
  { value: "parsed", label: "Parsed" },
  { value: "partially_mapped", label: "Partially Mapped" },
  { value: "mapped", label: "Mapped" },
  { value: "reviewed", label: "Reviewed" },
  { value: "approved", label: "Approved" },
];

export default function DocumentsTab({ investments }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterInvestment, setFilterInvestment] = useState("");
  const [filterType, setFilterType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterWorkflow, setFilterWorkflow] = useState("");
  const [viewerDoc, setViewerDoc] = useState(null);
  const [financialsDoc, setFinancialsDoc] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listAllDocuments();
      setDocuments(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const types = [...new Set(documents.map((d) => d.document_type))].sort();

  const filtered = documents.filter((doc) => {
    if (filterInvestment && doc.investment_id !== Number(filterInvestment))
      return false;
    if (filterType && doc.document_type !== filterType) return false;
    if (filterWorkflow && doc.workflow_status !== filterWorkflow) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        doc.document_name.toLowerCase().includes(q) ||
        doc.original_filename.toLowerCase().includes(q) ||
        doc.investment_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-gray-900">All Documents</h2>
        <span className="text-sm text-gray-500">
          {filtered.length} document{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-2 text-red-700 text-sm mb-4">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-bold">
            &times;
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1 max-w-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={filterInvestment}
          onChange={(e) => setFilterInvestment(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm"
        >
          <option value="">All Investments</option>
          {investments.map((inv) => (
            <option key={inv.id} value={inv.id}>
              {inv.investment_name}
            </option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm"
        >
          <option value="">All Types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={filterWorkflow}
          onChange={(e) => setFilterWorkflow(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm"
        >
          {WORKFLOW_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block w-6 h-6 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mb-2" />
          <p className="text-gray-400 text-sm">Loading documents...</p>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          {documents.length === 0
            ? "No documents uploaded yet. Upload documents from the Investments tab."
            : "No documents match your filters."}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 text-left text-gray-500 uppercase text-xs">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Investment</th>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Workflow</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((doc) => {
                const wfBadge = doc.workflow_status
                  ? WORKFLOW_BADGES[doc.workflow_status] || null
                  : null;
                const detailText =
                  doc.statement_count > 0
                    ? doc.workflow_status === "approved"
                      ? `${doc.approved_count}/${doc.statement_count} approved`
                      : doc.workflow_status === "reviewed"
                        ? `${doc.reviewed_count}/${doc.statement_count} reviewed`
                        : doc.mapped_count > 0
                          ? `${doc.mapped_count}/${doc.statement_count} mapped`
                          : null
                    : null;
                return (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {doc.document_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {doc.investment_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 truncate max-w-[180px]">
                      {doc.original_filename}
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                        {doc.document_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatSize(doc.file_size)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {doc.document_date || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {wfBadge ? (
                        <div>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${wfBadge.cls}`}
                          >
                            {wfBadge.label}
                          </span>
                          {detailText && (
                            <p className="text-[10px] text-gray-400 mt-0.5">{detailText}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setViewerDoc(doc)}
                          className="text-green-600 hover:text-green-800 text-xs font-medium"
                        >
                          View
                        </button>
                        {doc.document_type?.toLowerCase() === ".pdf" && (
                          <button
                            onClick={() => setFinancialsDoc(doc)}
                            className="text-purple-600 hover:text-purple-800 text-xs font-medium"
                          >
                            Financials
                          </button>
                        )}
                        <a
                          href={api.downloadUrl(doc.investment_id, doc.id)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          Download
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewerDoc && (
        <DocumentViewer
          investmentId={viewerDoc.investment_id}
          document={viewerDoc}
          onClose={() => setViewerDoc(null)}
        />
      )}

      {financialsDoc && (
        <FinancialStatements
          investmentId={financialsDoc.investment_id}
          document={financialsDoc}
          onClose={() => {
            setFinancialsDoc(null);
            load();
          }}
        />
      )}
    </div>
  );
}
