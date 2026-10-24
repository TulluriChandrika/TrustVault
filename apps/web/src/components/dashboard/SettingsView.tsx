import React, { useState, useEffect } from "react";
import {
  User,
  KeyRound,
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Info,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";
import {
  checkApiHealth,
  updateUserProfile,
  type UserProfile,
  type HealthResponse,
  API_BASE_URL,
} from "@/lib/api";

interface SettingsViewProps {
  token: string;
  profile: UserProfile | null;
  onProfileUpdated?: (profile: UserProfile) => void;
  onSignOut: () => void;
  onOpenChangePassword?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  token,
  profile,
  onProfileUpdated,
  onSignOut,
  onOpenChangePassword,
}) => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Full name edit state
  const [isEditingName, setIsEditingName] = useState(false);
  const [fullNameInput, setFullNameInput] = useState(profile?.full_name || "");
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);

  // Tooltip state for Auth UUID
  const [showUuidTooltip, setShowUuidTooltip] = useState(false);

  useEffect(() => {
    setFullNameInput(profile?.full_name || "");
  }, [profile?.full_name]);

  const handlePingHealth = async () => {
    setHealthLoading(true);
    try {
      const data = await checkApiHealth();
      setHealth(data);
    } finally {
      setHealthLoading(false);
    }
  };

  const handleSaveFullName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    setNameSuccess(false);

    const trimmed = fullNameInput.trim();
    if (trimmed.length > 100) {
      setNameError("Full name must not exceed 100 characters.");
      return;
    }

    setNameLoading(true);
    try {
      const updatedUser = await updateUserProfile(token, { full_name: trimmed });
      onProfileUpdated?.(updatedUser);
      setIsEditingName(false);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : "Failed to update full name.");
    } finally {
      setNameLoading(false);
    }
  };

  const displayRole = profile?.role === "admin" ? "Administrator" : "User";

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Profile Card */}
      <div className="rounded-2xl bg-white border border-[#E8E6F8] shadow-sm p-6">
        <div className="flex items-center gap-3 pb-5 border-b border-[#E8E6F8]">
          <div className="h-10 w-10 rounded-xl bg-[#6153CC]/10 text-[#6153CC] flex items-center justify-center">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#101936]">Account Profile</h3>
            <p className="text-[11.5px] text-[#6B7B9F]">
              Your authenticated identity and access rights
            </p>
          </div>
        </div>

        {nameSuccess && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Profile name updated successfully.</span>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Editable Full Name */}
          <div className="p-3.5 rounded-xl bg-[#FBFBFE] border border-[#E8E6F8]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#8A93B6] uppercase">Full Name</span>
              {!isEditingName && (
                <button
                  onClick={() => {
                    setFullNameInput(profile?.full_name || "");
                    setIsEditingName(true);
                    setNameError(null);
                  }}
                  className="text-[11px] font-semibold text-[#554DE7] hover:text-[#6153CC] inline-flex items-center gap-1 transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  <span>Edit</span>
                </button>
              )}
            </div>

            {isEditingName ? (
              <form onSubmit={handleSaveFullName} className="mt-2 space-y-2">
                <input
                  type="text"
                  value={fullNameInput}
                  onChange={(e) => setFullNameInput(e.target.value)}
                  placeholder="Enter your full name"
                  maxLength={100}
                  disabled={nameLoading}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#6153CC] rounded-lg text-[#101936] outline-none focus:ring-2 focus:ring-[#6153CC]/10"
                  autoFocus
                />
                {nameError && (
                  <p className="text-[10.5px] text-rose-600 font-medium">{nameError}</p>
                )}
                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingName(false);
                      setFullNameInput(profile?.full_name || "");
                      setNameError(null);
                    }}
                    disabled={nameLoading}
                    className="p-1 rounded-md text-[#8A93B6] hover:bg-slate-100 transition-colors"
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="submit"
                    disabled={nameLoading}
                    className="px-2.5 py-1 rounded-md bg-[#6153CC] hover:bg-[#554DE7] text-white text-[11px] font-semibold shadow-xs inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    {nameLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    <span>Save</span>
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm font-semibold text-[#101936] mt-0.5">
                {profile?.full_name || "—"}
              </p>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-[#FBFBFE] border border-[#E8E6F8]">
            <span className="text-[11px] font-semibold text-[#8A93B6] uppercase">Email Address</span>
            <p className="text-sm font-semibold text-[#101936] mt-0.5">{profile?.email || "—"}</p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#FBFBFE] border border-[#E8E6F8]">
            <span className="text-[11px] font-semibold text-[#8A93B6] uppercase">Account Role</span>
            <div className="mt-1">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#6153CC]/15 text-[#554DE7] uppercase tracking-wide">
                {displayRole}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#FBFBFE] border border-[#E8E6F8]">
            <span className="text-[11px] font-semibold text-[#8A93B6] uppercase">Account Status</span>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-emerald-700">
                {profile?.is_active ? "Active & Authorized" : "Inactive"}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#FBFBFE] border border-[#E8E6F8]">
            <span className="text-[11px] font-semibold text-[#8A93B6] uppercase">Member Since</span>
            <p className="text-xs font-semibold text-[#101936] mt-1">
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
            </p>
          </div>

          {/* Auth UUID with Info Icon */}
          <div className="p-3.5 rounded-xl bg-[#FBFBFE] border border-[#E8E6F8] relative">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#8A93B6] uppercase">Auth UUID</span>
              <div className="relative inline-block">
                <button
                  type="button"
                  onClick={() => setShowUuidTooltip(!showUuidTooltip)}
                  onMouseEnter={() => setShowUuidTooltip(true)}
                  onMouseLeave={() => setShowUuidTooltip(false)}
                  className="text-[#8A93B6] hover:text-[#6153CC] transition-colors focus:outline-none"
                  aria-label="Information about Auth UUID"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                {showUuidTooltip && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-64 p-2.5 rounded-xl bg-[#101936] text-white text-[10.5px] leading-relaxed shadow-xl z-20 pointer-events-none">
                    This is the unique identifier assigned to your authentication account and is useful for support or account identification.
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[#101936] rotate-45 -mt-1" />
                  </div>
                )}
              </div>
            </div>
            <p className="font-mono text-xs text-[#101936] mt-0.5 break-all">
              {profile?.id || "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Security & Credentials */}
      <div className="rounded-2xl bg-white border border-[#E8E6F8] shadow-sm p-6">
        <div className="flex items-center gap-3 pb-5 border-b border-[#E8E6F8]">
          <div className="h-10 w-10 rounded-xl bg-[#6153CC]/10 text-[#6153CC] flex items-center justify-center">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#101936]">Security & Credentials</h3>
            <p className="text-[11.5px] text-[#6B7B9F]">
              Manage password credentials and authentication security
            </p>
          </div>
        </div>

        {/* Cleaned-up Password Section: preserving in-app change password modal */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[#FBFBFE] border border-[#E8E6F8]">
          <div>
            <h4 className="text-xs font-bold text-[#101936]">Change Password</h4>
            <p className="text-[11px] text-[#6B7B9F] mt-0.5">
              Update your account password securely using your current password credentials.
            </p>
          </div>
          <button
            onClick={onOpenChangePassword}
            className="px-4 py-2 rounded-xl bg-[#6153CC] hover:bg-[#554DE7] text-white text-xs font-semibold shadow-sm transition-all"
          >
            Change Password
          </button>
        </div>
      </div>

      {/* Backend API Health & Monitoring */}
      <div className="rounded-2xl bg-white border border-[#E8E6F8] shadow-sm p-6">
        <div className="flex items-center gap-3 pb-5 border-b border-[#E8E6F8]">
          <div className="h-10 w-10 rounded-xl bg-[#6153CC]/10 text-[#6153CC] flex items-center justify-center">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#101936]">System Health & API Diagnostics</h3>
            <p className="text-[11.5px] text-[#6B7B9F]">
              Verify connectivity with the Express backend and PostgreSQL database
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[#FBFBFE] border border-[#E8E6F8]">
            <div>
              <span className="text-[11px] font-semibold text-[#8A93B6] uppercase">API Endpoint Base</span>
              <p className="font-mono text-xs text-[#101936] mt-0.5">
                {API_BASE_URL || "(Relative proxy via Vite dev server)"}
              </p>
            </div>
            <button
              onClick={handlePingHealth}
              disabled={healthLoading}
              className="px-4 py-2 rounded-xl border border-[#E2E0F2] hover:bg-white text-xs font-semibold text-[#554DE7] flex items-center gap-1.5 transition-all shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? "animate-spin" : ""}`} />
              <span>Ping /health</span>
            </button>
          </div>

          {health && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                health.status === "ok"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              {health.status === "ok" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <div className="flex-1">
                <strong>Status:</strong> {health.status.toUpperCase()} &bull; <strong>Time:</strong>{" "}
                {health.timestamp || "N/A"}
                {health.error && <span className="block mt-0.5 text-rose-700">Error: {health.error}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Session Management */}
      <div className="rounded-2xl bg-white border border-[#E8E6F8] shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-rose-600">End Active Session</h4>
            <p className="text-[11px] text-[#6B7B9F] mt-0.5">
              Securely purge local credentials and end authenticated session
            </p>
          </div>
          <button
            onClick={onSignOut}
            className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
