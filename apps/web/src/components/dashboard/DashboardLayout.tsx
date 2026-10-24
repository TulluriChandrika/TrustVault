import React, { useState, useEffect, useCallback, useRef } from "react";
import { AppSidebar, type DashboardView } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { OverviewView } from "./OverviewView";
import { DocumentsView } from "./DocumentsView";
import { UploadDocumentModal } from "./UploadDocumentModal";
import { ShareDocumentModal } from "./ShareDocumentModal";
import { EditDocumentModal } from "./EditDocumentModal";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { AuditLogsView } from "./AuditLogsView";
import { SettingsView } from "./SettingsView";
import {
  fetchDocuments,
  downloadDocument,
  deleteDocument,
  type DocumentItem,
  type UserProfile,
} from "@/lib/api";
import { AlertCircle, RefreshCw, Trash2, Loader2, X } from "lucide-react";

interface DashboardLayoutProps {
  token: string;
  profile: UserProfile | null;
  onProfileUpdated?: (profile: UserProfile) => void;
  onSignOut: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  token,
  profile,
  onProfileUpdated,
  onSignOut,
}) => {
  const [currentView, setCurrentView] = useState<DashboardView>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Documents state
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{
    message: string;
    canRefresh: boolean;
    isSessionExpired: boolean;
  } | null>(null);

  // Action states
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<DocumentItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [shareDoc, setShareDoc] = useState<DocumentItem | null>(null);
  const [editDoc, setEditDoc] = useState<DocumentItem | null>(null);
  const [editMode, setEditMode] = useState<"rename" | "details">("rename");

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (
      query.trim() &&
      (currentView === "overview" ||
        currentView === "activity" ||
        currentView === "settings" ||
        currentView === "admin")
    ) {
      setCurrentView("all-documents");
    }
  };

  const handleOpenEdit = (doc: DocumentItem, mode: "rename" | "details") => {
    setEditDoc(doc);
    setEditMode(mode);
  };

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const refreshRequestIdRef = useRef(0);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await fetchDocuments(token);
      setDocuments(docs);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load documents from backend."
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleActionError = useCallback((err: unknown) => {
    const status = (err as any)?.status;
    const rawMsg = (err instanceof Error ? err.message : String(err)).toLowerCase();

    if (status === 401 || rawMsg.includes("jwt") || rawMsg.includes("unauthorized") || rawMsg.includes("session")) {
      setActionError({
        message: "Your session has expired. Please sign in again to continue.",
        canRefresh: false,
        isSessionExpired: true,
      });
      return;
    }

    if (
      status === 404 ||
      status === 403 ||
      rawMsg.includes("not found") ||
      rawMsg.includes("permission") ||
      rawMsg.includes("forbidden") ||
      rawMsg.includes("authorization")
    ) {
      setActionError({
        message:
          "Unable to access this document. Your permission may have changed, or the document may no longer be available. Please refresh the page and try again.",
        canRefresh: true,
        isSessionExpired: false,
      });
      return;
    }

    setActionError({
      message: err instanceof Error ? err.message : "An unexpected error occurred. Please try again.",
      canRefresh: true,
      isSessionExpired: false,
    });
  }, []);

  const handleRefreshDocuments = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshFeedback(null);
    setActionError(null);
    const requestId = ++refreshRequestIdRef.current;

    try {
      const docs = await fetchDocuments(token);
      if (requestId === refreshRequestIdRef.current) {
        setDocuments(docs);
        setRefreshFeedback({
          type: "success",
          message: "Documents and permissions refreshed.",
        });
        setTimeout(() => {
          setRefreshFeedback((prev) => (prev?.type === "success" ? null : prev));
        }, 4000);
      }
    } catch (err: unknown) {
      if (requestId === refreshRequestIdRef.current) {
        setRefreshFeedback({
          type: "error",
          message:
            err instanceof Error
              ? err.message
              : "Failed to refresh documents. Please try again.",
        });
      }
    } finally {
      if (requestId === refreshRequestIdRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [isRefreshing, token]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Handle file download
  const handleDownload = async (doc: DocumentItem) => {
    setDownloadingId(doc.id);
    setActionError(null);
    try {
      const { blob, filename } = await downloadDocument(token, doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = filename || doc.title;
      window.document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        if (a.parentNode) {
          a.parentNode.removeChild(a);
        }
      }, 1000);
    } catch (err: unknown) {
      handleActionError(err);
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle document deletion
  const confirmDelete = async () => {
    if (!deletingDoc) return;
    setDeleteLoading(true);
    setActionError(null);
    try {
      await deleteDocument(token, deletingDoc.id);
      setDeletingDoc(null);
      await loadDocuments();
    } catch (err: unknown) {
      handleActionError(err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const documentCounts = {
    total: documents.length,
    owned: documents.filter(
      (d) => d.owner_id === profile?.id || d.access_level === "owner"
    ).length,
    shared: documents.filter(
      (d) => d.owner_id !== profile?.id && d.access_level !== "owner"
    ).length,
  };

  return (
    <div className="min-h-screen bg-[#FBFBFE] flex">
      {/* Sidebar Navigation */}
      <AppSidebar
        currentView={currentView}
        onNavigate={(view) => {
          if (view === "upload") {
            setIsUploadModalOpen(true);
          } else {
            setCurrentView(view);
          }
        }}
        profile={profile}
        onSignOut={onSignOut}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        documentCounts={documentCounts}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Header */}
        <AppHeader
          currentView={currentView}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onOpenUpload={() => setIsUploadModalOpen(true)}
          profile={profile}
          onNavigateSettings={() => setCurrentView("settings")}
          onOpenChangePassword={() => setIsChangePasswordOpen(true)}
          onSignOut={onSignOut}
        />

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {actionError && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center justify-between gap-3 shadow-sm animate-fade-in"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-bold text-[#101936] block mb-0.5">
                    {actionError.isSessionExpired ? "Session Expired" : "Unable to access this document."}
                  </span>
                  <span className="text-amber-800 leading-relaxed">{actionError.message}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {actionError.canRefresh && (
                  <button
                    onClick={() => {
                      setActionError(null);
                      handleRefreshDocuments();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-100/50 text-amber-900 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                    <span>Refresh Documents</span>
                  </button>
                )}
                {actionError.isSessionExpired && (
                  <button
                    onClick={onSignOut}
                    className="px-3 py-1.5 rounded-lg bg-[#6153CC] hover:bg-[#554DE7] text-white text-xs font-semibold transition-colors shadow-xs"
                  >
                    Sign In
                  </button>
                )}
                <button
                  onClick={() => setActionError(null)}
                  className="p-1 rounded-md text-amber-600 hover:bg-amber-100 transition-colors"
                  aria-label="Dismiss alert"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>Backend Notice: {error}</span>
              </div>
              <button
                onClick={loadDocuments}
                className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {loading && documents.length === 0 ? (
            <div className="py-24 text-center">
              <div className="h-12 w-12 rounded-2xl bg-[#6153CC]/10 text-[#6153CC] mx-auto flex items-center justify-center mb-3">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
              <p className="text-sm font-semibold text-[#101936]">Loading TrustVault Workspace...</p>
              <p className="text-xs text-[#6B7B9F] mt-1">Connecting to authenticated document storage</p>
            </div>
          ) : (
            <>
              {currentView === "overview" && (
                <OverviewView
                  documents={documents}
                  profile={profile}
                  onNavigate={setCurrentView}
                  onOpenUpload={() => setIsUploadModalOpen(true)}
                  onDownload={handleDownload}
                  downloadingId={downloadingId}
                />
              )}

              {currentView === "all-documents" && (
                <DocumentsView
                  documents={documents}
                  profile={profile}
                  filterScope="all"
                  searchQuery={searchQuery}
                  onClearSearch={() => setSearchQuery("")}
                  onOpenUpload={() => setIsUploadModalOpen(true)}
                  onDownload={handleDownload}
                  onOpenShare={setShareDoc}
                  onOpenEdit={handleOpenEdit}
                  onDelete={setDeletingDoc}
                  downloadingId={downloadingId}
                  deletingId={deletingDoc?.id || null}
                  onRefresh={handleRefreshDocuments}
                  isRefreshing={isRefreshing}
                  refreshFeedback={refreshFeedback}
                />
              )}

              {currentView === "my-documents" && (
                <DocumentsView
                  documents={documents}
                  profile={profile}
                  filterScope="owned"
                  searchQuery={searchQuery}
                  onClearSearch={() => setSearchQuery("")}
                  onOpenUpload={() => setIsUploadModalOpen(true)}
                  onDownload={handleDownload}
                  onOpenShare={setShareDoc}
                  onOpenEdit={handleOpenEdit}
                  onDelete={setDeletingDoc}
                  downloadingId={downloadingId}
                  deletingId={deletingDoc?.id || null}
                  onRefresh={handleRefreshDocuments}
                  isRefreshing={isRefreshing}
                  refreshFeedback={refreshFeedback}
                />
              )}

              {currentView === "shared-with-me" && (
                <DocumentsView
                  documents={documents}
                  profile={profile}
                  filterScope="shared"
                  searchQuery={searchQuery}
                  onClearSearch={() => setSearchQuery("")}
                  onOpenUpload={() => setIsUploadModalOpen(true)}
                  onDownload={handleDownload}
                  onOpenShare={setShareDoc}
                  onOpenEdit={handleOpenEdit}
                  onDelete={setDeletingDoc}
                  downloadingId={downloadingId}
                  deletingId={deletingDoc?.id || null}
                  onRefresh={handleRefreshDocuments}
                  isRefreshing={isRefreshing}
                  refreshFeedback={refreshFeedback}
                />
              )}

              {(currentView === "activity" || currentView === "admin") && (
                <AuditLogsView token={token} profile={profile} />
              )}

              {currentView === "settings" && (
                <SettingsView
                  token={token}
                  profile={profile}
                  onProfileUpdated={onProfileUpdated}
                  onSignOut={onSignOut}
                  onOpenChangePassword={() => setIsChangePasswordOpen(true)}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        userEmail={profile?.email || ""}
      />

      {/* Upload Document Modal */}
      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        token={token}
        onSuccess={loadDocuments}
      />

      {/* Edit Document Modal (Rename & Details) */}
      <EditDocumentModal
        isOpen={Boolean(editDoc)}
        onClose={() => setEditDoc(null)}
        token={token}
        document={editDoc}
        mode={editMode}
        onSuccess={loadDocuments}
      />

      {/* Share Document Modal */}
      <ShareDocumentModal
        isOpen={Boolean(shareDoc)}
        onClose={() => setShareDoc(null)}
        document={shareDoc}
        token={token}
      />

      {/* Delete Confirmation Modal */}
      {deletingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-white border border-[#E8E6F8] shadow-2xl p-6">
            <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-[#101936]">Delete Document?</h3>
            <p className="text-xs text-[#6B7B9F] mt-1.5 leading-relaxed">
              Are you sure you want to remove <strong className="text-[#101936]">{deletingDoc.title}</strong>? This action will revoke all collaborator access.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeletingDoc(null)}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl border border-[#E2E0F2] text-xs font-semibold text-[#6B7B9F] hover:bg-[#F6F8FD]"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5"
              >
                {deleteLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span>Delete Document</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
