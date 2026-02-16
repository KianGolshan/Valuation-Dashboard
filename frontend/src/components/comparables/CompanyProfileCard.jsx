import { useState, useEffect, useRef } from "react";
import { api } from "../../api";

const SECTORS = [
  "Enterprise SaaS", "Fintech", "Healthcare IT", "Consumer Tech", "Industrials",
  "Infrastructure", "Cybersecurity", "E-Commerce", "Marketplace", "Biotech",
];

const STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Growth", "Late Stage", "Public"];

const GEOGRAPHIES = ["North America", "Europe", "Asia Pacific", "Latin America", "Global"];

const METRICS = ["ARR", "Revenue", "GMV", "AUM", "Bookings", "NRR"];

export default function CompanyProfileCard({ investmentId, profile, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    sector: "",
    sub_sector: "",
    stage: "",
    geography: "",
    primary_metric: "",
  });
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (profile) {
      setForm({
        sector: profile.sector || "",
        sub_sector: profile.sub_sector || "",
        stage: profile.stage || "",
        geography: profile.geography || "",
        primary_metric: profile.primary_metric || "",
      });
    }
  }, [profile]);

  const save = async (data) => {
    setSaving(true);
    try {
      await api.upsertProfile(investmentId, data);
      onUpdate();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    const updated = { ...form, [field]: value };
    setForm(updated);
    // Debounce auto-save
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(updated), 800);
  };

  const hasTags = profile && (profile.sector || profile.stage || profile.geography);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Company Profile
        </h3>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      {!editing && hasTags && (
        <div className="flex flex-wrap gap-2">
          {profile.sector && (
            <span className="bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full">
              {profile.sector}
            </span>
          )}
          {profile.sub_sector && (
            <span className="bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full">
              {profile.sub_sector}
            </span>
          )}
          {profile.stage && (
            <span className="bg-purple-50 text-purple-700 text-xs px-2.5 py-1 rounded-full">
              {profile.stage}
            </span>
          )}
          {profile.geography && (
            <span className="bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full">
              {profile.geography}
            </span>
          )}
          {profile.primary_metric && (
            <span className="bg-orange-50 text-orange-700 text-xs px-2.5 py-1 rounded-full">
              {profile.primary_metric}
            </span>
          )}
        </div>
      )}

      {!editing && !hasTags && (
        <p className="text-sm text-gray-400">
          No profile tags set. Click Edit to add sector, stage, and geography.
        </p>
      )}

      {editing && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sector</label>
            <select
              value={form.sector}
              onChange={(e) => handleChange("sector", e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">Select...</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sub-Sector</label>
            <input
              type="text"
              value={form.sub_sector}
              onChange={(e) => handleChange("sub_sector", e.target.value)}
              placeholder="e.g. DevOps, Payments"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Stage</label>
            <select
              value={form.stage}
              onChange={(e) => handleChange("stage", e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">Select...</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Geography</label>
            <select
              value={form.geography}
              onChange={(e) => handleChange("geography", e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">Select...</option>
              {GEOGRAPHIES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Primary Metric</label>
            <select
              value={form.primary_metric}
              onChange={(e) => handleChange("primary_metric", e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">Select...</option>
              {METRICS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          {saving && (
            <div className="flex items-end">
              <span className="text-xs text-gray-400">Saving...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
