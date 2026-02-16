import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import CompanyProfileCard from "./comparables/CompanyProfileCard";
import CompSetBuilder from "./comparables/CompSetBuilder";
import MultiplesTable from "./comparables/MultiplesTable";
import ValuationRangeChart from "./comparables/ValuationRangeChart";
import BenchmarkPanel from "./comparables/BenchmarkPanel";

export default function ComparablesPanel({ investmentId }) {
  const [profile, setProfile] = useState(null);
  const [compSets, setCompSets] = useState([]);
  const [selectedCompSetId, setSelectedCompSetId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
  }, [investmentId]);

  const runAnalysis = async (compSetId) => {
    setLoading(true);
    setError("");
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

  const selectedCompSet = compSets.find((cs) => cs.id === selectedCompSetId) || null;

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-2 text-red-700 text-sm">
          {error}
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
          <MultiplesTable analysis={analysis} />
          <ValuationRangeChart statistics={analysis.statistics} />
        </>
      )}

      <BenchmarkPanel
        sector={profile?.sector}
        analysisStats={analysis?.statistics}
      />
    </div>
  );
}
