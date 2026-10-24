import React from "react";
import {
  FileText,
  FolderLock,
  Share2,
  ShieldCheck,
  UploadCloud,
  ArrowRight,
  Download,
  Lock,
  Clock,
  HardDrive,
} from "lucide-react";
import type { DocumentItem, UserProfile } from "@/lib/api";
import type { DashboardView } from "./AppSidebar";

interface OverviewViewProps {
  documents: DocumentItem[];
  profile: UserProfile | null;
  onNavigate: (view: DashboardView) => void;
  onOpenUpload: () => void;
  onDownload: (doc: DocumentItem) => void;
  downloadingId: string | null;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  documents,
  profile,
  onNavigate,
  onOpenUpload,
  onDownload,
  downloadingId,
}) => {
  const ownedDocuments = documents.filter(
    (d) => d.owner_id === profile?.id || d.access_level === "owner"
  );
  const sharedDocuments = documents.filter(
    (d) => d.owner_id !== profile?.id && d.access_level !== "owner"
  );

  // Calculate total size in bytes
  const totalSizeBytes = documents.reduce((acc, doc) => {
    const sz = typeof doc.size_bytes === "number" ? doc.size_bytes : parseInt(doc.size_bytes, 10) || 0;
    return acc + sz;
  }, 0);

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 KB";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const recentDocuments = documents.slice(0, 5);

  const userName = profile?.full_name?.trim() || profile?.email || "User";

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#6153CC] via-[#7074EE] to-[#605BEB] p-6 text-white shadow-lg shadow-[#6153CC]/15">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold tracking-wide uppercase mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Secure Vault Protected</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
            Welcome back, {userName}
          </h2>
          <p className="text-white/85 text-xs sm:text-sm mt-1.5 leading-relaxed">
            Your TrustVault repository protects your confidential files with strict per-document authorization and an immutable audit trail.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-4 pt-1">
            <button
              onClick={onOpenUpload}
              className="px-4 py-2 rounded-xl bg-white text-[#554DE7] hover:bg-[#F6F8FD] font-semibold text-xs shadow-md transition-all flex items-center gap-2 active:scale-[0.98]"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Upload Document</span>
            </button>
            <button
              onClick={() => onNavigate("all-documents")}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs backdrop-blur-md border border-white/20 transition-all flex items-center gap-1.5"
            >
              <span>Explore Vault</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Decorative Background Elements */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-white/10 to-transparent pointer-events-none" />
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Documents */}
        <div className="p-5 rounded-2xl bg-white border border-[#E8E6F8] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#6B7B9F]">Total Documents</span>
            <div className="h-8 w-8 rounded-lg bg-[#6153CC]/10 text-[#6153CC] flex items-center justify-center">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#101936] mt-2">
            {documents.length}
          </div>
          <div className="text-[11px] text-[#8A93B6] mt-1 flex items-center gap-1">
            <Lock className="h-3 w-3 text-emerald-500" />
            <span>Encrypted in private storage</span>
          </div>
        </div>

        {/* Owned Documents */}
        <div className="p-5 rounded-2xl bg-white border border-[#E8E6F8] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#6B7B9F]">My Documents</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FolderLock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#101936] mt-2">
            {ownedDocuments.length}
          </div>
          <div className="text-[11px] text-[#8A93B6] mt-1">
            Owner authorization tier
          </div>
        </div>

        {/* Shared With Me */}
        <div className="p-5 rounded-2xl bg-white border border-[#E8E6F8] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#6B7B9F]">Shared With Me</span>
            <div className="h-8 w-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Share2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#101936] mt-2">
            {sharedDocuments.length}
          </div>
          <div className="text-[11px] text-[#8A93B6] mt-1">
            Read & edit delegations
          </div>
        </div>

        {/* Total Storage Used */}
        <div className="p-5 rounded-2xl bg-white border border-[#E8E6F8] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#6B7B9F]">Storage Consumed</span>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#101936] mt-2">
            {formatFileSize(totalSizeBytes)}
          </div>
          <div className="text-[11px] text-[#8A93B6] mt-1">
            Across {documents.length} secure files
          </div>
        </div>
      </div>

      {/* Recent Documents Table */}
      <div className="rounded-2xl bg-white border border-[#E8E6F8] shadow-sm overflow-hidden">
        <div className="p-5 border-b border-[#E8E6F8] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#101936]">Recent Vault Files</h3>
            <p className="text-[11.5px] text-[#6B7B9F] mt-0.5">
              Latest documents uploaded or shared with your account
            </p>
          </div>
          <button
            onClick={() => onNavigate("all-documents")}
            className="text-xs font-semibold text-[#554DE7] hover:underline flex items-center gap-1"
          >
            <span>View All ({documents.length})</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {recentDocuments.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <div className="h-12 w-12 rounded-2xl bg-[#F6F8FD] text-[#8A93B6] mx-auto flex items-center justify-center mb-3">
              <FileText className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-[#101936]">No documents in your vault</p>
            <p className="text-xs text-[#6B7B9F] max-w-sm mx-auto mt-1">
              Upload your first document to secure it with cryptographic access controls.
            </p>
            <button
              onClick={onOpenUpload}
              className="mt-4 px-4 py-2 rounded-xl bg-[#6153CC] hover:bg-[#554DE7] text-white text-xs font-semibold shadow-sm transition-all inline-flex items-center gap-1.5"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>Upload Document</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FBFBFE] border-b border-[#E8E6F8] text-[11px] font-semibold text-[#6B7B9F] uppercase tracking-wider">
                  <th className="py-3 px-5">Document</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Access Level</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6F8] text-xs">
                {recentDocuments.map((doc) => {
                  const isOwner = doc.owner_id === profile?.id || doc.access_level === "owner";
                  const isDownloading = downloadingId === doc.id;

                  return (
                    <tr key={doc.id} className="hover:bg-[#FBFBFE]/70 transition-colors">
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-[#6153CC]/10 text-[#6153CC] flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-[#101936] truncate max-w-xs">
                              {doc.title}
                            </div>
                            <div className="text-[10px] text-[#8A93B6] truncate mt-0.5">
                              {isOwner ? "Owner: You" : `Owner: ${doc.owner_email || "Authorized User"}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-medium bg-[#F1F3FD] text-[#554DE7] border border-[#E8E6F8]">
                          {doc.category || "General"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold capitalize ${
                            isOwner
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-sky-50 text-sky-700 border border-sky-200"
                          }`}
                        >
                          <Lock className="h-2.5 w-2.5" />
                          <span>{doc.access_level}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-[#6B7B9F] font-mono text-[11px]">
                        {formatFileSize(typeof doc.size_bytes === "number" ? doc.size_bytes : parseInt(doc.size_bytes, 10))}
                      </td>

                      <td className="py-3.5 px-4 text-[#6B7B9F] text-[11px]">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-[#8A93B6]" />
                          {new Date(doc.created_at).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={() => onDownload(doc)}
                          disabled={isDownloading}
                          className="p-1.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#554DE7] hover:border-[#6153CC]/40 transition-all inline-flex items-center gap-1.5 text-[11px] font-semibold"
                          title="Download document securely"
                        >
                          <Download className={`h-3.5 w-3.5 ${isDownloading ? "animate-bounce" : ""}`} />
                          <span className="hidden sm:inline">Download</span>
                        </button>
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
