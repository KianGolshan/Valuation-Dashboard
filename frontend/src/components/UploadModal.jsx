import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB — mirrors backend MAX_FILE_SIZE

function nameFromFile(file) {
  return file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
}

export default function UploadModal({ investmentId, securityId, onClose, onDone }) {
  const [files, setFiles] = useState([]);
  const [documentName, setDocumentName] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef();

  function applyFiles(selected) {
    const arr = [...selected];
    // Client-side size guard
    const oversized = arr.find((f) => f.size > MAX_SIZE_BYTES);
    if (oversized) {
      setError(`"${oversized.name}" exceeds the 50 MB limit.`);
      return;
    }
    setFiles(arr);
    setError("");
    // Auto-populate document name from first file if field is still empty
    if (!documentName.trim() && arr.length > 0) {
      setDocumentName(nameFromFile(arr[0]));
    }
  }

  function handleFileChange(e) {
    applyFiles(e.target.files);
  }

  function handleChooseFiles() {
    inputRef.current?.click();
  }

  // Drag-and-drop handlers
  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave() {
    setDragOver(false);
  }
  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      applyFiles(e.dataTransfer.files);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (files.length === 0) return setError("Select at least one file.");
    if (!documentName.trim()) return setError("Document name is required.");

    setLoading(true);
    setError("");
    let uploaded = [];
    try {
      const formData = new FormData();
      for (const f of files) {
        formData.append("files", f);
      }
      formData.append("document_name", documentName);
      if (documentDate) formData.append("document_date", documentDate);
      if (securityId) formData.append("security_id", securityId);

      uploaded = await api.uploadDocuments(investmentId, formData);
    } catch (e) {
      setError(e.message);
      setLoading(false);
      return;
    }

    // Auto-trigger parsing for every PDF that was uploaded
    // Bulk endpoint returns a plain array of DocumentResponse
    const pdfDocs = (Array.isArray(uploaded) ? uploaded : []).filter(
      (doc) => doc.document_type === ".pdf"
    );

    if (pdfDocs.length > 0) {
      setLoading(false);
      setQueuing(true);
      await Promise.allSettled(
        pdfDocs.map((doc) =>
          api.triggerParsing(investmentId, doc.id).catch(() => null)
        )
      );
      setQueuing(false);
    } else {
      setLoading(false);
    }

    onDone();
  }

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        style={{ position: "relative", zIndex: 10000 }}
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold">Upload Documents</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* File picker with drag-and-drop */}
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">
              Files <span className="text-gray-400 font-normal">(.pdf, .doc, .docx, .xlsx, .xls)</span>
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xlsx,.xls"
              onChange={handleFileChange}
              style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
            />
            <button
              type="button"
              onClick={handleChooseFiles}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-full border-2 border-dashed rounded-lg px-4 py-6 text-center transition cursor-pointer ${
                dragOver
                  ? "border-blue-400 bg-blue-50"
                  : files.length > 0
                    ? "border-green-300 bg-green-50"
                    : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
              }`}
            >
              <span className="text-sm text-gray-600">
                {files.length === 0
                  ? "Click or drag files here"
                  : `${files.length} file${files.length !== 1 ? "s" : ""} selected`}
              </span>
            </button>
            {files.length > 0 && (
              <ul className="mt-2 text-xs text-gray-500 space-y-0.5">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="truncate">{f.name}</span>
                    <span className="ml-2 shrink-0 text-gray-400">
                      {f.size >= 1024 * 1024
                        ? `${(f.size / (1024 * 1024)).toFixed(1)} MB`
                        : `${(f.size / 1024).toFixed(1)} KB`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Document Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Name
            </label>
            <input
              type="text"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder="e.g. Q1 Financial Report"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Document Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Date <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Auto-parse note */}
          {files.some((f) => f.name.toLowerCase().endsWith(".pdf")) && (
            <p className="text-xs text-purple-600 bg-purple-50 border border-purple-100 rounded px-3 py-2">
              PDF files will be automatically queued for parsing after upload.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || queuing}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm px-4 py-2 rounded transition"
            >
              {loading ? "Uploading..." : queuing ? "Queuing parse..." : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
