import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import UploadModal from "./UploadModal";
import DocumentViewer from "./DocumentViewer";
import FinancialStatements from "./FinancialStatements";
import ParseValidationPanel from "./ParseValidationPanel";
import ValuationPanel from "./ValuationPanel";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrency(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function DocumentTable({ documents, investmentId, onDelete, onView, onFinancials, onValidate }) {
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
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {documents.map((doc) => (
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
          ))}
        </tbody>
      </table>
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

  const selectedSecurity = selectedSecurityId
    ? (investment.securities || []).find((s) => s.id === selectedSecurityId)
    : null;

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
  }, [load]);

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
        <button
          onClick={() => setUploading(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded transition"
        >
          Upload Documents
        </button>
      </div>

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
              <div
                key={sec.id}
                onClick={() => onSelectSecurity(sec.id)}
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
                </div>
              </div>
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

      {/* Valuations */}
      <div className="mb-6">
        <ValuationPanel investmentId={investment.id} />
      </div>

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
      />

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
