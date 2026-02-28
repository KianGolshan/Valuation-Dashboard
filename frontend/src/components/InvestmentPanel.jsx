import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import UploadModal from "./UploadModal";
import DocumentViewer from "./DocumentViewer";
import FinancialStatements from "./FinancialStatements";
import ParseValidationPanel from "./ParseValidationPanel";
import ValuationPanel from "./ValuationPanel";
import ComparablesPanel from "./ComparablesPanel";
import FinancialDataView from "./FinancialDataView";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const WORKFLOW_STAGES = [
  { key: "not_parsed", label: "Not Parsed", color: "bg-gray-400" },
  { key: "parsed", label: "Parsed", color: "bg-yellow-400" },
  { key: "partially_mapped", label: "Partial", color: "bg-purple-300" },
  { key: "mapped", label: "Mapped", color: "bg-purple-500" },
  { key: "reviewed", label: "Reviewed", color: "bg-blue-500" },
  { key: "approved", label: "Approved", color: "bg-green-500" },
];

const WORKFLOW_BADGES = {
  not_parsed: { label: "Not Parsed", cls: "bg-gray-100 text-gray-600" },
  parsed: { label: "Parsed", cls: "bg-yellow-100 text-yellow-700" },
  partially_mapped: { label: "Partially Mapped", cls: "bg-purple-50 text-purple-600" },
  mapped: { label: "Mapped", cls: "bg-purple-100 text-purple-700" },
  reviewed: { label: "Reviewed", cls: "bg-blue-100 text-blue-700" },
  approved: { label: "Approved", cls: "bg-green-100 text-green-700" },
};

function WorkflowProgressBar({ workflowData }) {
  if (!workflowData || workflowData.document_count === 0) return null;

  const total = workflowData.document_count;

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Document Workflow
        </h3>
        <span className="text-xs text-gray-500">
          {workflowData.total_approved}/{workflowData.total_statements} statements approved ({workflowData.completion_pct}%)
        </span>
      </div>
      {/* Segmented bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 mb-2">
        {WORKFLOW_STAGES.map((stage) => {
          const count = workflowData.workflow_counts[stage.key] || 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={stage.key}
              className={`${stage.color} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${stage.label}: ${count}`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {WORKFLOW_STAGES.map((stage) => {
          const count = workflowData.workflow_counts[stage.key] || 0;
          if (count === 0) return null;
          return (
            <span key={stage.key} className="flex items-center gap-1 text-xs text-gray-600">
              <span className={`inline-block w-2.5 h-2.5 rounded-sm ${stage.color}`} />
              {stage.label}: {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function formatCurrency(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function DocumentTable({ documents, investmentId, onDelete, onView, onFinancials, onValidate, workflowByDocId }) {
  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        No documents uploaded yet
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-gray-50 text-left text-gray-500 uppercase text-xs">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">File</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Size</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Workflow</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {documents.map((doc) => {
            const wf = workflowByDocId && workflowByDocId[doc.id];
            const wfBadge = wf ? WORKFLOW_BADGES[wf.workflow_status] || null : null;
            const detailText =
              wf && wf.statement_count > 0
                ? wf.workflow_status === "approved"
                  ? `${wf.approved_count}/${wf.statement_count} approved`
                  : wf.workflow_status === "reviewed"
                    ? `${wf.reviewed_count}/${wf.statement_count} reviewed`
                    : wf.mapped_count > 0
                      ? `${wf.mapped_count}/${wf.statement_count} mapped`
                      : null
                : null;
            return (
              <tr key={doc.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {doc.document_name}
                </td>
                <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">
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
                      <span className={`text-xs px-2 py-0.5 rounded-full ${wfBadge.cls}`}>
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
                      onClick={() => onView(doc)}
                      className="text-green-600 hover:text-green-800 text-xs font-medium"
                    >
                      View
                    </button>
                    {doc.document_type?.toLowerCase() === ".pdf" && (
                      <>
                        <button
                          onClick={() => onFinancials(doc)}
                          className="text-purple-600 hover:text-purple-800 text-xs font-medium"
                        >
                          Financials
                        </button>
                        <button
                          onClick={() => onValidate(doc)}
                          className="text-orange-600 hover:text-orange-800 text-xs font-medium"
                        >
                          Validate
                        </button>
                      </>
                    )}
                    <a
                      href={api.downloadUrl(investmentId, doc.id)}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                    >
                      Download
                    </a>
                    <button
                      onClick={() => onDelete(doc.id)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SecurityCard({ security: sec, investmentId, onClick }) {
  const [latestValuation, setLatestValuation] = useState(null);

  useEffect(() => {
    api.getLatestValuation(investmentId)
      .then((v) => {
        // Find the most recent valuation tied to this security, else fall back to investment-level
        setLatestValuation(v);
      })
      .catch(() => {});
  }, [investmentId]);

  // Return multiple: current price / initial cost basis
  const costBasis = sec.price_per_share;
  const currentPPS = latestValuation?.price_per_share ?? latestValuation?.security_id === sec.id
    ? latestValuation?.price_per_share
    : null;
  const returnMultiple =
    costBasis != null && costBasis > 0 && currentPPS != null && currentPPS > 0
      ? currentPPS / costBasis
      : null;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg shadow border border-gray-100 p-4 cursor-pointer hover:border-blue-300 transition"
    >
      <p className="font-medium text-gray-900 text-sm">
        {sec.investment_round || sec.description || `Security #${sec.id}`}
      </p>
      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
        {sec.investment_date && <p>Date: {sec.investment_date}</p>}
        {sec.investment_size != null && (
          <p>Size: {formatCurrency(sec.investment_size)}</p>
        )}
        {costBasis != null && (
          <p>Cost basis: {formatCurrency(costBasis)}/sh</p>
        )}
        {returnMultiple != null && (
          <p className={`font-medium ${returnMultiple >= 1 ? "text-green-600" : "text-red-500"}`}>
            {returnMultiple.toFixed(2)}x return
          </p>
        )}
      </div>
    </div>
  );
}

export default function InvestmentPanel({
  investment,
  selectedSecurityId,
  onSelectSecurity,
  onBackToInvestment,
  onEditSecurity,
  onAddSecurity,
}) {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [viewerDoc, setViewerDoc] = useState(null);
  const [financialsDoc, setFinancialsDoc] = useState(null);
  const [validatingDoc, setValidatingDoc] = useState(null);
  const [workflowData, setWorkflowData] = useState(null);
  const [workflowByDocId, setWorkflowByDocId] = useState({});
  const [activeTab, setActiveTab] = useState("overview");

  // Reset tab when investment changes
  useEffect(() => {
    setActiveTab("overview");
  }, [investment.id]);

  const selectedSecurity = selectedSecurityId
    ? (investment.securities || []).find((s) => s.id === selectedSecurityId)
    : null;

  const loadWorkflow = useCallback(async () => {
    try {
      const data = await api.getInvestmentWorkflow(investment.id);
      setWorkflowData(data);
      const byDoc = {};
      if (data.documents) {
        for (const d of data.documents) {
          byDoc[d.document_id] = d;
        }
      }
      setWorkflowByDocId(byDoc);
    } catch {
      // non-critical
    }
  }, [investment.id]);

  const load = useCallback(async () => {
    try {
      const data = await api.listDocuments(
        investment.id,
        selectedSecurityId || null
      );
      setDocuments(data.items);
    } catch (e) {
      setError(e.message);
    }
  }, [investment.id, selectedSecurityId]);

  useEffect(() => {
    load();
    loadWorkflow();
  }, [load, loadWorkflow]);

  async function handleDeleteDoc(docId) {
    if (!confirm("Delete this document?")) return;
    try {
      await api.deleteDocument(investment.id, docId);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  // ── Security view ──────────────────────────────────────────────────
  if (selectedSecurity) {
    return (
      <div>
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <button
            onClick={onBackToInvestment}
            className="hover:text-blue-600 transition"
          >
            {investment.investment_name}
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium">
            {selectedSecurity.investment_round || selectedSecurity.description || `Security #${selectedSecurity.id}`}
          </span>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {selectedSecurity.investment_round || selectedSecurity.description || `Security #${selectedSecurity.id}`}
            </h2>
            <div className="text-sm text-gray-500 mt-1 space-x-4">
              {selectedSecurity.investment_date && (
                <span>Date: {selectedSecurity.investment_date}</span>
              )}
              {selectedSecurity.investment_size != null && (
                <span>Size: {formatCurrency(selectedSecurity.investment_size)}</span>
              )}
              {selectedSecurity.price_per_share != null && (
                <span>PPS: {formatCurrency(selectedSecurity.price_per_share)}</span>
              )}
            </div>
            {selectedSecurity.notes && (
              <p className="text-sm text-gray-500 mt-1">{selectedSecurity.notes}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onEditSecurity(selectedSecurity)}
              className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm px-4 py-2 rounded transition"
            >
              Edit Security
            </button>
            <button
              onClick={() => setUploading(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded transition"
            >
              Upload Documents
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded px-4 py-2 text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        <DocumentTable
          documents={documents}
          investmentId={investment.id}
          onDelete={handleDeleteDoc}
          onView={setViewerDoc}
          onFinancials={setFinancialsDoc}
          onValidate={setValidatingDoc}
          workflowByDocId={workflowByDocId}
        />

        {uploading && (
          <UploadModal
            investmentId={investment.id}
            securityId={selectedSecurityId}
            onClose={() => setUploading(false)}
            onDone={() => {
              setUploading(false);
              load();
            }}
          />
        )}

        {viewerDoc && (
          <DocumentViewer
            investmentId={investment.id}
            document={viewerDoc}
            onClose={() => setViewerDoc(null)}
          />
        )}

        {financialsDoc && (
          <FinancialStatements
            investmentId={investment.id}
            document={financialsDoc}
            onClose={() => setFinancialsDoc(null)}
          />
        )}

        {validatingDoc && (
          <ParseValidationPanel
            investmentId={investment.id}
            document={validatingDoc}
            onClose={() => setValidatingDoc(null)}
          />
        )}
      </div>
    );
  }

  // ── Investment view ────────────────────────────────────────────────
  const secCount = investment.securities?.length || 0;
  const docCount = documents.length;

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "financials", label: "Financials" },
    { key: "valuations", label: "Valuations" },
    { key: "comparables", label: "Comparables" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {investment.investment_name}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {investment.asset_type && (
              <span>{investment.asset_type} &middot; </span>
            )}
            {investment.description || "No description"}
          </p>
          {investment.notes && (
            <p className="text-sm text-gray-400 mt-0.5">{investment.notes}</p>
          )}
        </div>
        {activeTab === "overview" && (
          <button
            onClick={() => setUploading(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded transition"
          >
            Upload Documents
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          {/* Summary stats */}
          <div className="flex gap-4 mb-6">
            <div className="bg-white rounded-lg shadow px-4 py-3 flex-1 text-center">
              <p className="text-2xl font-bold text-gray-900">{secCount}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Securities</p>
            </div>
            <div className="bg-white rounded-lg shadow px-4 py-3 flex-1 text-center">
              <p className="text-2xl font-bold text-gray-900">{docCount}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Documents</p>
            </div>
          </div>

          {/* Workflow Progress Bar */}
          <WorkflowProgressBar workflowData={workflowData} />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded px-4 py-2 text-red-700 text-sm mb-4">
              {error}
            </div>
          )}

          {/* Securities list */}
          {investment.securities && investment.securities.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Securities
                </h3>
                <button
                  onClick={onAddSecurity}
                  className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                >
                  + Add Security
                </button>
              </div>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {investment.securities.map((sec) => (
                  <SecurityCard
                    key={sec.id}
                    security={sec}
                    investmentId={investment.id}
                    onClick={() => onSelectSecurity(sec.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {(!investment.securities || investment.securities.length === 0) && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Securities
                </h3>
              </div>
              <button
                onClick={onAddSecurity}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition text-sm"
              >
                + Add your first security
              </button>
            </div>
          )}

          {/* Investment-level documents */}
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Investment-Level Documents
          </h3>
          <DocumentTable
            documents={documents}
            investmentId={investment.id}
            onDelete={handleDeleteDoc}
            onView={setViewerDoc}
            onFinancials={setFinancialsDoc}
            onValidate={setValidatingDoc}
            workflowByDocId={workflowByDocId}
          />
        </>
      )}

      {activeTab === "financials" && (
        <FinancialDataView
          investmentId={investment.id}
          investmentName={investment.investment_name}
        />
      )}

      {activeTab === "valuations" && (
        <ValuationPanel investmentId={investment.id} />
      )}

      {activeTab === "comparables" && (
        <ComparablesPanel investmentId={investment.id} />
      )}

      {/* Modals stay outside tab conditional */}
      {uploading && (
        <UploadModal
          investmentId={investment.id}
          onClose={() => setUploading(false)}
          onDone={() => {
            setUploading(false);
            load();
          }}
        />
      )}

      {viewerDoc && (
        <DocumentViewer
          investmentId={investment.id}
          document={viewerDoc}
          onClose={() => setViewerDoc(null)}
        />
      )}

      {financialsDoc && (
        <FinancialStatements
          investmentId={investment.id}
          document={financialsDoc}
          onClose={() => setFinancialsDoc(null)}
        />
      )}

      {validatingDoc && (
        <ParseValidationPanel
          investmentId={investment.id}
          document={validatingDoc}
          onClose={() => setValidatingDoc(null)}
        />
      )}
    </div>
  );
}
