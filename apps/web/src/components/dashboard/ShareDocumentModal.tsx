import React, { useState, useEffect, useRef } from "react";
import {
  Share2,
  X,
  AlertCircle,
  Trash2,
  UserPlus,
  Loader2,
  CheckCircle2,
  Mail,
  Shield,
} from "lucide-react";
import {
  fetchDocumentPermissions,
  grantDocumentPermission,
  updateDocumentPermission,
  revokeDocumentPermission,
  type DocumentItem,
  type DocumentPermissionItem,
} from "@/lib/api";

interface ShareDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentItem | null;
  token: string;
}

export const ShareDocumentModal: React.FC<ShareDocumentModalProps> = ({
  isOpen,
  onClose,
  document,
  token,
}) => {
  const [permissions, setPermissions] = useState<DocumentPermissionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [targetEmail, setTargetEmail] = useState("");
  const [targetPermission, setTargetPermission] = useState<"read" | "edit">("read");

  const activeDocIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    if (isOpen && document?.id) {
      const docId = document.id;
      activeDocIdRef.current = docId;
      setLoading(true);
      setError(null);

      fetchDocumentPermissions(token, docId)
        .then((perms) => {
          if (isCurrent && activeDocIdRef.current === docId) {
            setPermissions(perms);
          }
        })
        .catch((err: unknown) => {
          if (isCurrent && activeDocIdRef.current === docId) {
            setError(err instanceof Error ? err.message : "Failed to load document permissions.");
          }
        })
        .finally(() => {
          if (isCurrent && activeDocIdRef.current === docId) {
            setLoading(false);
          }
        });
    } else {
      activeDocIdRef.current = null;
      setPermissions([]);
      setError(null);
      setSuccessMessage(null);
      setTargetEmail("");
    }

    return () => {
      isCurrent = false;
    };
  }, [isOpen, document?.id, token]);

  if (!isOpen || !document) return null;

  const loadPermissions = async () => {
    if (!document?.id) return;
    const docId = document.id;
    activeDocIdRef.current = docId;
    setLoading(true);
    setError(null);
    try {
      const perms = await fetchDocumentPermissions(token, docId);
      if (activeDocIdRef.current === docId) {
        setPermissions(perms);
      }
    } catch (err: unknown) {
      if (activeDocIdRef.current === docId) {
        setError(err instanceof Error ? err.message : "Failed to load document permissions.");
      }
    } finally {
      if (activeDocIdRef.current === docId) {
        setLoading(false);
      }
    }
  };

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = targetEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Please enter the collaborator's registered email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await grantDocumentPermission(token, document.id, {
        email: trimmedEmail,
        permission: targetPermission,
      });
      setSuccessMessage(`Access granted to ${trimmedEmail} (${targetPermission}).`);
      setTargetEmail("");
      await loadPermissions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to grant document permission.";
      if (msg.includes("not found")) {
        setError(`No active TrustVault account found with email "${trimmedEmail}".`);
      } else if (msg.includes("already has an active permission")) {
        setError(`"${trimmedEmail}" already has access. You can change their permission level below.`);
      } else {
        setError(msg);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdatePermission = async (userId: string, newPermission: "read" | "edit") => {
    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateDocumentPermission(token, document.id, userId, newPermission);
      setSuccessMessage("Permission updated successfully.");
      await loadPermissions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update permission.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async (userId: string, userEmail?: string) => {
    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await revokeDocumentPermission(token, document.id, userId);
      setSuccessMessage(userEmail ? `Access revoked for ${userEmail}.` : "Access revoked.");
      await loadPermissions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revoke permission.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101936]/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white border border-[#E8E6F8] shadow-2xl p-6 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E8E6F8]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#6153CC]/10 text-[#6153CC] flex items-center justify-center">
              <Share2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[#101936] truncate">Share Document</h3>
              <p className="text-[11.5px] text-[#6B7B9F] truncate">{document.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#8A93B6] hover:bg-[#F6F8FD] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Grant New Permission Form using Email */}
        <form onSubmit={handleGrant} className="mt-4 p-4 rounded-xl bg-[#FBFBFE] border border-[#E8E6F8] space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#101936]">
            <UserPlus className="h-4 w-4 text-[#6153CC]" />
            <span>Invite Collaborator by Email</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2 relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8A93B6]" />
              <input
                type="email"
                placeholder="collaborator@example.com"
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
                disabled={actionLoading}
                className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-[#E2E0F2] rounded-lg text-[#101936] placeholder:text-[#8A93B6] outline-none focus:border-[#6153CC] transition-all"
              />
            </div>
            <div>
              <select
                value={targetPermission}
                onChange={(e) => setTargetPermission(e.target.value as "read" | "edit")}
                disabled={actionLoading}
                className="w-full h-9 px-2 text-xs bg-white border border-[#E2E0F2] rounded-lg text-[#101936] outline-none focus:border-[#6153CC] transition-all font-medium"
              >
                <option value="read">Viewer (Read)</option>
                <option value="edit">Editor (Edit)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={actionLoading || !targetEmail.trim()}
            className="w-full h-8 rounded-lg bg-[#6153CC] hover:bg-[#554DE7] text-white text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {actionLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span>Grant Document Access</span>
            )}
          </button>
        </form>

        {/* Existing Permissions List with Edit & Revoke Actions */}
        <div className="mt-4">
          <div className="text-xs font-bold text-[#101936] mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-[#6153CC]" />
              <span>Active Collaborators</span>
            </div>
            <span className="text-[11px] font-medium text-[#8A93B6]">
              {permissions.length} user{permissions.length === 1 ? "" : "s"}
            </span>
          </div>

          {loading ? (
            <div className="py-6 text-center text-xs text-[#8A93B6] flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-[#6153CC]" />
              <span>Loading permissions...</span>
            </div>
          ) : permissions.length === 0 ? (
            <div className="py-6 text-center text-xs text-[#8A93B6] border border-dashed border-[#E8E6F8] rounded-xl">
              This document is private to you. No collaborators have been granted access.
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto divide-y divide-[#E8E6F8] border border-[#E8E6F8] rounded-xl">
              {permissions.map((perm) => (
                <div key={perm.id} className="p-3 flex items-center justify-between text-xs hover:bg-[#FBFBFE]">
                  <div className="min-w-0 pr-3">
                    <p className="font-semibold text-xs text-[#101936] truncate">
                      {perm.user_email || `User: ${perm.user_id.slice(0, 8)}...`}
                    </p>
                    <p className="text-[10px] text-[#8A93B6] mt-0.5">
                      Granted on {new Date(perm.granted_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Permission Edit Dropdown */}
                    <div className="relative flex items-center">
                      <select
                        value={perm.permission}
                        onChange={(e) =>
                          handleUpdatePermission(perm.user_id, e.target.value as "read" | "edit")
                        }
                        disabled={actionLoading}
                        className="h-7 px-2 text-[11px] font-semibold bg-[#F1F3FD] text-[#554DE7] border border-[#E2E0F2] rounded-lg outline-none cursor-pointer hover:bg-[#E8E6F8] transition-colors"
                      >
                        <option value="read">Viewer (Read)</option>
                        <option value="edit">Editor (Edit)</option>
                      </select>
                    </div>

                    {/* Revoke Permission */}
                    <button
                      onClick={() => handleRevoke(perm.user_id, perm.user_email)}
                      disabled={actionLoading}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                      title="Revoke access"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-[#E8E6F8] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#F6F8FD] hover:bg-[#E8E6F8] text-xs font-semibold text-[#101936] transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
