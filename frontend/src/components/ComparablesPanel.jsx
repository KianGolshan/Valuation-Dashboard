import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import CompanyProfileCard from "./comparables/CompanyProfileCard";
import CompSetBuilder from "./comparables/CompSetBuilder";
import MultiplesTable from "./comparables/MultiplesTable";
import ValuationRangeChart from "./comparables/ValuationRangeChart";
import BenchmarkPanel from "./comparables/BenchmarkPanel";

// ── Apply to Valuation modal ──────────────────────────────────────────────────

const METHODOLOGY_MAP = {
  ev_revenue: "Revenue Multiple",
  ev_ebitda: "EBITDA Multiple",
};
const METRIC_LABEL_MAP = {
  ev_revenue: "LTM Revenue",
  ev_ebitda: "LTM EBITDA",
};

function ApplyValuationModal({ investmentId, statistics, onClose, onApplied }) {
  const [selectedMetric, setSelectedMetric] = useState(
    statistics.find((s) => s.metric === "ev_revenue") ? "ev_revenue" : statistics[0]?.metric
  );
  const [saving, setSaving] = useState(false);
  const [securities, setSecurities] = useState([]);
  const [securityId, setSecurityId] = useState("");
  const [notes, setNotes] = useState("");
  const [confidence, setConfidence] = useState("medium");

  useEffect(() => {
    api.listSecurities(investmentId).then((r) => setSecurities(r.items ?? r)).catch(() => {});
  }, [investmentId]);

  const stat = statistics.find((s) => s.metric === selectedMetric);
  const median = stat?.median ?? null;
  const methodology = METHODOLOGY_MAP[selectedMetric] || "Other";
  const financialMetric = METRIC_LABEL_MAP[selectedMetric] || selectedMetric;

  async function handleApply() {
    if (!stat || median == null) return;
    setSaving(true);
    try {
      await api.createValuation(investmentId, {
        valuation_date: new Date().toISOString().split("T")[0],
        methodology,
        multiple: median,
        financial_metric: financialMetric,
        security_id: securityId ? parseInt(securityId) : null,
        confidence_flag: confidence,
        analyst_notes: notes || `Applied from comp set analysis (${stat.company_count} comps, median ${median.toFixed(2)}x).`,
      });
      onApplied();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  const fmtX = (v) => v != null ? `${v.toFixed(2)}x` : "—";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[420px]">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Apply Comp Multiple to Valuation</h3>
        <p className="text-xs text-gray-500 mb-4">
          Creates a new valuation record pre-filled with the selected median multiple.
        </p>

        {/* Metric picker */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">Multiple</label>
          <div className="grid grid-cols-2 gap-2">
            {statistics
              .filter((s) => METHODOLOGY_MAP[s.metric])
              .map((s) => (
                <button
                  key={s.metric}
                  onClick={() => setSelectedMetric(s.metric)}
                  className={`text-xs border rounded px-3 py-2 text-left transition ${
                    selectedMetric === s.metric
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className="font-medium">{METHODOLOGY_MAP[s.metric]}</div>
                  <div className="text-gray-500 mt-0.5">
                    Median: {fmtX(s.median)} · {s.company_count} comps
                  </div>
                </button>
              ))}
          </div>
        </div>

        {stat && (
          <div className="bg-gray-50 rounded p-3 text-xs text-gray-600 mb-3 grid grid-cols-3 gap-2">
            <div><span className="text-gray-400">Min</span><br />{fmtX(stat.min)}</div>
            <div><span className="text-gray-400">Median</span><br /><strong className="text-gray-800">{fmtX(stat.median)}</strong></div>
            <div><span className="text-gray-400">Max</span><br />{fmtX(stat.max)}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Security (optional)</label>
            <select
              value={securityId}
              onChange={(e) => setSecurityId(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
            >
              <option value="">— None —</option>
              {securities.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.investment_round || s.description || `Security #${s.id}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confidence</label>
            <select
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
            rows={2}
            placeholder="Leave blank to auto-generate from comp set"
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 border border-gray-300 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={saving || !stat || median == null}
            className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded disabled:opacity-50"
          >
            {saving ? "Saving..." : "Create Valuation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function ComparablesPanel({ investmentId }) {
  const [profile, setProfile] = useState(null);
  const [compSets, setCompSets] = useState([]);
  const [selectedCompSetId, setSelectedCompSetId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const data = await api.getProfile(investmentId);
      setProfile(data);
    } catch {
      // profile may not exist yet
    }
  }, [investmentId]);

  const loadCompSets = useCallback(async () => {
    try {
      const data = await api.listCompSets(investmentId);
      setCompSets(data);
      if (data.length > 0 && !selectedCompSetId) {
        setSelectedCompSetId(data[0].id);
      }
    } catch (e) {
      setError(e.message);
    }
  }, [investmentId, selectedCompSetId]);

  useEffect(() => {
    loadProfile();
    loadCompSets();
  }, [loadProfile, loadCompSets]);

  // Reset when investment changes
  useEffect(() => {
    setSelectedCompSetId(null);
    setAnalysis(null);
    setApplySuccess(false);
  }, [investmentId]);

  const runAnalysis = async (compSetId) => {
    setLoading(true);
    setError("");
    setApplySuccess(false);
    try {
      const data = await api.getCompSetAnalysis(compSetId);
      setAnalysis(data);
    } catch (e) {
      setError(e.message);
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  const applyableStats = analysis?.statistics?.filter((s) => METHODOLOGY_MAP[s.metric]) || [];

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-2 text-red-700 text-sm">
          {error}
        </div>
      )}

      {applySuccess && (
        <div className="bg-green-50 border border-green-200 rounded px-4 py-2 text-green-700 text-sm flex justify-between items-center">
          <span>Valuation created. View it in the Valuations tab.</span>
          <button onClick={() => setApplySuccess(false)} className="font-bold ml-2">&times;</button>
        </div>
      )}

      <CompanyProfileCard
        investmentId={investmentId}
        profile={profile}
        onUpdate={loadProfile}
      />

      <CompSetBuilder
        investmentId={investmentId}
        compSets={compSets}
        selectedCompSetId={selectedCompSetId}
        onSelectCompSet={setSelectedCompSetId}
        onCompSetsChange={loadCompSets}
        onRunAnalysis={runAnalysis}
        loading={loading}
      />

      {analysis && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Analysis Results
            </p>
            {applyableStats.length > 0 && (
              <button
                onClick={() => setShowApplyModal(true)}
                className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded"
              >
                Apply Multiple → Create Valuation
              </button>
            )}
          </div>
          <MultiplesTable analysis={analysis} />
          <ValuationRangeChart statistics={analysis.statistics} />
        </>
      )}

      <BenchmarkPanel
        sector={profile?.sector}
        analysisStats={analysis?.statistics}
      />

      {showApplyModal && analysis && (
        <ApplyValuationModal
          investmentId={investmentId}
          statistics={analysis.statistics}
          onClose={() => setShowApplyModal(false)}
          onApplied={() => setApplySuccess(true)}
        />
      )}
    </div>
  );
}
