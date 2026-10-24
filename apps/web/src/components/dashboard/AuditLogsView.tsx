import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  UserCheck,
  DownloadCloud,
  Trash2,
  Share2,
  Pencil,
  SlidersHorizontal,
} from "lucide-react";
import {
  fetchAdminAuditLogs,
  fetchActivityLogs,
  type AuditLogItem,
  type UserProfile,
} from "@/lib/api";

interface AuditLogsViewProps {
  token: string;
  profile: UserProfile | null;
}

/**
 * Generate clear, human-readable descriptions from actual structured audit data.
 * No raw JSON or technical implementation details.
 */
function formatAuditDetails(log: AuditLogItem): string {
  const d = log.details || {};
  const isDenied = log.outcome === "denied";
  const isFailure = log.outcome === "failure";

  if (isDenied) {
    if (log.action === "audit_log:read") {
      return "An unauthorized attempt to access administrator audit logs was blocked.";
    }
    return "An unauthorized access attempt was blocked.";
  }

  if (isFailure) {
    return "The operation failed to complete.";
  }

  switch (log.action) {
    case "file:upload":
    case "document:create":
      return "Uploaded a new document.";

    case "file:download":
      return "Successfully downloaded the document.";

    case "document:rename": {
      const prev = d.previous_title;
      const next = d.new_title;
      if (prev && next) {
        return `Renamed from "${prev}" to "${next}".`;
      }
      return "Renamed the document.";
    }

    case "document:update": {
      const changes: string[] = [];
      if (d.previous_category && d.new_category && d.previous_category !== d.new_category) {
        changes.push(`category to "${d.new_category}"`);
      }
      if (d.new_description !== undefined && d.previous_description !== d.new_description) {
        changes.push("document description");
      }
      if (changes.length > 0) {
        return `Updated ${changes.join(" and ")}.`;
      }
      return "Updated the document description.";
    }

    case "permission:grant": {
      const perm = d.permission ? (d.permission === "edit" ? "Edit" : "Read") : "access";
      const target = d.targetEmail ? ` to ${d.targetEmail}` : " to a user";
      return `Granted ${perm} access${target}.`;
    }

    case "permission:update": {
      const prev = d.previousPermission ? (d.previousPermission === "edit" ? "Edit" : "Read") : null;
      const next = d.newPermission ? (d.newPermission === "edit" ? "Edit" : "Read") : null;
      const target = d.targetEmail ? ` for ${d.targetEmail}` : "";
      if (prev && next) {
        return `Changed access from ${prev} to ${next}${target}.`;
      }
      return `Changed access permissions${target}.`;
    }

    case "permission:revoke": {
      const target = d.targetEmail ? ` for ${d.targetEmail}` : " from the document";
      return `Removed access${target}.`;
    }

    case "document:delete":
      return "Deleted the document.";

    case "document:read":
      return "Retrieved document metadata.";

    case "auth:login":
      return "User successfully signed in.";

    default:
      return "Document event completed successfully.";
  }
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ token, profile }) => {
  const isAdmin = profile?.role === "admin";
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");

  const activeRequestIdRef = React.useRef(0);

  const loadLogs = React.useCallback(async () => {
    const requestId = ++activeRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      if (isAdmin) {
        const res = await fetchAdminAuditLogs(token, {
          limit: 50,
          action: actionFilter !== "all" ? actionFilter : undefined,
          outcome: outcomeFilter !== "all" ? outcomeFilter : undefined,
        });
        if (requestId === activeRequestIdRef.current) {
          setLogs(res.logs || []);
        }
      } else {
        const userLogs = await fetchActivityLogs(token, { limit: 50 });
        let filtered = userLogs;
        if (actionFilter !== "all") {
          filtered = filtered.filter((l) => l.action === actionFilter);
        }
        if (outcomeFilter !== "all") {
          filtered = filtered.filter((l) => l.outcome === outcomeFilter);
        }
        if (requestId === activeRequestIdRef.current) {
          setLogs(filtered);
        }
      }
    } catch (err: unknown) {
      if (requestId === activeRequestIdRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load activity logs.");
      }
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [isAdmin, actionFilter, outcomeFilter, token]);

  useEffect(() => {
    loadLogs();
    return () => {
      // Invalidate in-flight requests on dependency change or unmount
      activeRequestIdRef.current += 1;
    };
  }, [loadLogs]);

  const formatActionName = (action: string): { label: string; icon: React.ReactNode } => {
    switch (action) {
      case "file:upload":
      case "document:create":
        return { label: "Document Uploaded", icon: <FileText className="h-3.5 w-3.5 text-[#554DE7]" /> };
      case "file:download":
        return { label: "Document Downloaded", icon: <DownloadCloud className="h-3.5 w-3.5 text-emerald-600" /> };
      case "document:rename":
        return { label: "Document Renamed", icon: <Pencil className="h-3.5 w-3.5 text-blue-600" /> };
      case "document:update":
        return { label: "Document Details Updated", icon: <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600" /> };
      case "permission:grant":
        return { label: "Permission Granted", icon: <Share2 className="h-3.5 w-3.5 text-indigo-600" /> };
      case "permission:update":
        return { label: "Permission Changed", icon: <UserCheck className="h-3.5 w-3.5 text-blue-600" /> };
      case "permission:revoke":
        return { label: "Permission Revoked", icon: <Trash2 className="h-3.5 w-3.5 text-rose-500" /> };
      case "document:delete":
        return { label: "Document Deleted", icon: <Trash2 className="h-3.5 w-3.5 text-red-600" /> };
      case "document:read":
        return { label: "Document Metadata Read", icon: <FileText className="h-3.5 w-3.5 text-[#6B7B9F]" /> };
      case "auth:login":
        return { label: "User Login", icon: <ShieldCheck className="h-3.5 w-3.5 text-purple-600" /> };
      default:
        return { label: action, icon: <ShieldCheck className="h-3.5 w-3.5 text-[#6B7B9F]" /> };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info Banner */}
      <div className="p-5 rounded-2xl bg-white border border-[#E8E6F8] shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#6153CC]/10 text-[#6153CC] flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#101936]">
              {isAdmin ? "Global Administrative Audit Ledger" : "Your Vault Activity Trail"}
            </h2>
            <p className="text-xs text-[#6B7B9F] mt-0.5">
              {isAdmin
                ? "Immutable security audit records for all tenant operations, permissions, and access attempts"
                : "Real-time audit log of all uploads, downloads, and permission events on your documents"}
            </p>
          </div>
        </div>

        <button
          onClick={loadLogs}
          disabled={loading}
          className="h-8 px-3 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-xs font-semibold text-[#554DE7] flex items-center gap-1.5 transition-colors shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-[#E8E6F8] shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#101936]">
            <Filter className="h-3.5 w-3.5 text-[#6153CC]" />
            <span>Filters:</span>
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-8 px-2.5 text-xs bg-[#FBFBFE] border border-[#E2E0F2] rounded-lg text-[#101936] outline-none cursor-pointer"
          >
            <option value="all">All Actions</option>
            <option value="file:upload">file:upload (Upload)</option>
            <option value="file:download">file:download (Download)</option>
            <option value="document:rename">document:rename (Rename)</option>
            <option value="document:update">document:update (Details)</option>
            <option value="permission:grant">permission:grant (Grant)</option>
            <option value="permission:update">permission:update (Update)</option>
            <option value="permission:revoke">permission:revoke (Revoke)</option>
            <option value="document:delete">document:delete (Delete)</option>
            <option value="document:read">document:read (Metadata)</option>
          </select>

          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="h-8 px-2.5 text-xs bg-[#FBFBFE] border border-[#E2E0F2] rounded-lg text-[#101936] outline-none cursor-pointer"
          >
            <option value="all">All Outcomes</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="failure">Failure</option>
          </select>
        </div>

        <span className="text-xs text-[#8A93B6] font-medium">
          Showing {logs.length} record{logs.length === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Audit Logs Table */}
      <div className="rounded-2xl bg-white border border-[#E8E6F8] shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-xs text-[#8A93B6] flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-[#6153CC]" />
            <span>Fetching verified audit records...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#8A93B6]">
            No activity or audit records found matching the specified filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FBFBFE] border-b border-[#E8E6F8] text-[11px] font-semibold text-[#6B7B9F] uppercase tracking-wider">
                  <th className="py-3 px-5">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Outcome</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Target Document</th>
                  <th className="py-3 px-5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6F8] text-xs">
                {logs.map((log) => {
                  const { label, icon } = formatActionName(log.action);
                  const isCurrentActor = log.actor_id === profile?.id;
                  const actorDisplay = log.actor_email
                    ? `${log.actor_email}${isCurrentActor ? " (You)" : ""}`
                    : log.actor_id
                      ? `Deleted User (${log.actor_id.slice(0, 8)}...)${isCurrentActor ? " (You)" : ""}`
                      : "Unknown Actor / System";

                  return (
                    <tr key={log.id} className="hover:bg-[#FBFBFE]/70 transition-colors">
                      <td className="py-3.5 px-5 text-[#6B7B9F] text-[11px] whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-[#8A93B6]" />
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium text-[#101936]">
                          {icon}
                          <span>{label}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {log.outcome === "success" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                            <span>Success</span>
                          </span>
                        ) : log.outcome === "denied" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertCircle className="h-2.5 w-2.5 text-amber-600" />
                            <span>Denied</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="h-2.5 w-2.5 text-rose-600" />
                            <span>Failure</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-[#101936] font-medium max-w-[180px] truncate">
                        {actorDisplay}
                      </td>

                      <td className="py-3.5 px-4 text-[#101936] font-medium max-w-[200px] truncate">
                        {log.document_title ||
                          (log.document_id ? `Document (${log.document_id.slice(0, 8)}...)` : "—")}
                      </td>

                      <td className="py-3.5 px-5 text-xs text-[#101936] max-w-[280px]">
                        <span className="leading-relaxed">
                          {formatAuditDetails(log)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
