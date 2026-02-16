import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../../api";

export default function CompSetBuilder({
  investmentId,
  compSets,
  selectedCompSetId,
  onSelectCompSet,
  onCompSetsChange,
  onRunAnalysis,
  loading,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const debounceRef = useRef(null);
  const searchContainerRef = useRef(null);

  const selectedCompSet = compSets.find((cs) => cs.id === selectedCompSetId) || null;

  useEffect(() => {
    setNotes(selectedCompSet?.notes || "");
  }, [selectedCompSet]);

  // Close search results on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchResults([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = useCallback(
    (query) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          const results = await api.searchFmp(query);
          setSearchResults(results);
        } catch {
          setSearchResults([]);
        } finally {
          setSearching(false);
        }
      }, 300);
    },
    []
  );

  const addCompany = async (result) => {
    if (!selectedCompSetId) return;
    try {
      await api.addCompany(selectedCompSetId, {
        ticker: result.ticker,
        company_name: result.name,
      });
      onCompSetsChange();
      setSearchQuery("");
      setSearchResults([]);
    } catch (e) {
      alert(e.message);
    }
  };

  const removeCompany = async (companyId) => {
    if (!selectedCompSetId) return;
    try {
      await api.removeCompany(selectedCompSetId, companyId);
      onCompSetsChange();
    } catch (e) {
      alert(e.message);
    }
  };

  const toggleInclude = async (company) => {
    try {
      await api.updateCompany(selectedCompSetId, company.id, {
        include_in_median: !company.include_in_median,
      });
      onCompSetsChange();
    } catch (e) {
      alert(e.message);
    }
  };

  const saveRationale = async (company, rationale) => {
    try {
      await api.updateCompany(selectedCompSetId, company.id, { rationale });
      onCompSetsChange();
    } catch {
      // silent
    }
  };

  const createCompSet = async () => {
    if (!newName.trim()) return;
    try {
      const cs = await api.createCompSet(investmentId, { name: newName.trim() });
      onSelectCompSet(cs.id);
      onCompSetsChange();
      setNewName("");
      setShowCreate(false);
    } catch (e) {
      alert(e.message);
    }
  };

  const deleteCompSet = async () => {
    if (!selectedCompSetId) return;
    if (!confirm("Delete this comp set?")) return;
    try {
      await api.deleteCompSet(selectedCompSetId);
      onSelectCompSet(null);
      onCompSetsChange();
    } catch (e) {
      alert(e.message);
    }
  };

  const saveNotes = async () => {
    if (!selectedCompSetId) return;
    try {
      await api.updateCompSet(selectedCompSetId, { notes });
      onCompSetsChange();
      setEditingNotes(false);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Comp Set
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={selectedCompSetId || ""}
            onChange={(e) => onSelectCompSet(Number(e.target.value) || null)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            <option value="">Select comp set...</option>
            {compSets.map((cs) => (
              <option key={cs.id} value={cs.id}>
                {cs.name} ({cs.companies?.length || 0} cos)
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            + New
          </button>
          {selectedCompSetId && (
            <button
              onClick={deleteCompSet}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Create new comp set inline */}
      {showCreate && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Comp set name..."
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
            onKeyDown={(e) => e.key === "Enter" && createCompSet()}
          />
          <button
            onClick={createCompSet}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded"
          >
            Create
          </button>
          <button
            onClick={() => setShowCreate(false)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      )}

      {!selectedCompSet && !showCreate && (
        <p className="text-sm text-gray-400">
          Select or create a comp set to start building comparables.
        </p>
      )}

      {selectedCompSet && (
        <>
          {/* FMP Search */}
          <div className="relative mb-4" ref={searchContainerRef}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              placeholder="Search public companies (e.g. Salesforce, CRM)..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
            {searching && (
              <span className="absolute right-3 top-2.5 text-xs text-gray-400">
                Searching...
              </span>
            )}

            {/* Search results dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {searchResults.map((r) => {
                  const alreadyAdded = selectedCompSet.companies?.some(
                    (c) => c.ticker === r.ticker
                  );
                  return (
                    <button
                      key={r.ticker}
                      onClick={() => !alreadyAdded && addCompany(r)}
                      disabled={alreadyAdded}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                        alreadyAdded
                          ? "bg-gray-50 text-gray-400 cursor-default"
                          : "hover:bg-blue-50 cursor-pointer"
                      }`}
                    >
                      <div>
                        <span className="font-mono font-medium text-gray-900">
                          {r.ticker}
                        </span>
                        <span className="text-gray-600 ml-2">{r.name}</span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {alreadyAdded ? "Added" : r.exchange}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Companies table */}
          {selectedCompSet.companies && selectedCompSet.companies.length > 0 ? (
            <div className="overflow-hidden rounded border border-gray-200 mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500 uppercase text-xs">
                    <th className="px-3 py-2">Ticker</th>
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Rationale</th>
                    <th className="px-3 py-2 text-center">Include</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedCompSet.companies.map((c) => (
                    <CompanyRow
                      key={c.id}
                      company={c}
                      onToggleInclude={() => toggleInclude(c)}
                      onSaveRationale={(r) => saveRationale(c, r)}
                      onRemove={() => removeCompany(c.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mb-4">
              No companies added yet. Use the search bar above to find and add public comps.
            </p>
          )}

          {/* Notes */}
          <div className="mb-4">
            {editingNotes ? (
              <div className="flex gap-2">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Analyst notes / rationale for this comp set..."
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                  rows={2}
                />
                <button
                  onClick={saveNotes}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium self-start mt-1"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingNotes(true)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {selectedCompSet.notes
                  ? selectedCompSet.notes
                  : "+ Add notes"}
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onRunAnalysis(selectedCompSetId)}
              disabled={
                loading || !selectedCompSet.companies?.length
              }
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm px-4 py-2 rounded transition"
            >
              {loading ? "Running Analysis..." : "Run Analysis"}
            </button>
            {selectedCompSet.companies?.length > 0 && (
              <a
                href={api.exportCompSetUrl(selectedCompSetId)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Export Excel
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CompanyRow({ company, onToggleInclude, onSaveRationale, onRemove }) {
  const [editingRationale, setEditingRationale] = useState(false);
  const [rationale, setRationale] = useState(company.rationale || "");
  const rationaleRef = useRef(null);

  return (
    <tr className={company.include_in_median ? "" : "opacity-50"}>
      <td className="px-3 py-2 font-mono font-medium text-gray-900">
        {company.ticker}
      </td>
      <td className="px-3 py-2 text-gray-700">{company.company_name}</td>
      <td className="px-3 py-2">
        {editingRationale ? (
          <input
            ref={rationaleRef}
            type="text"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            onBlur={() => {
              onSaveRationale(rationale);
              setEditingRationale(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSaveRationale(rationale);
                setEditingRationale(false);
              }
            }}
            className="border border-gray-300 rounded px-1.5 py-0.5 text-xs w-full"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditingRationale(true)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            {company.rationale || "Add rationale..."}
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <button
          onClick={onToggleInclude}
          className={`w-5 h-5 rounded border ${
            company.include_in_median
              ? "bg-blue-600 border-blue-600 text-white"
              : "border-gray-300 text-transparent"
          } text-xs flex items-center justify-center mx-auto`}
        >
          {company.include_in_median ? "\u2713" : ""}
        </button>
      </td>
      <td className="px-3 py-2">
        <button
          onClick={onRemove}
          className="text-red-400 hover:text-red-600 text-xs"
        >
          Remove
        </button>
      </td>
    </tr>
  );
}
