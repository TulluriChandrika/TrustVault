import React, { useState } from "react";
import {
  FileText,
  Download,
  Share2,
  Trash2,
  Lock,
  Clock,
  UploadCloud,
  LayoutGrid,
  List,
  FolderLock,
  Pencil,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { DocumentItem, UserProfile } from "@/lib/api";

interface DocumentsViewProps {
  documents: DocumentItem[];
  profile: UserProfile | null;
  filterScope: "all" | "owned" | "shared";
  searchQuery: string;
  onClearSearch?: () => void;
  onOpenUpload: () => void;
  onDownload: (doc: DocumentItem) => void;
  onOpenShare: (doc: DocumentItem) => void;
  onOpenEdit: (doc: DocumentItem, mode: "rename" | "details") => void;
  onDelete: (doc: DocumentItem) => void;
  downloadingId: string | null;
  deletingId: string | null;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  documents,
  profile,
  filterScope,
  searchQuery,
  onClearSearch,
  onOpenUpload,
  onDownload,
  onOpenShare,
  onOpenEdit,
  onDelete,
  downloadingId,
  deletingId,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // 1. Filter by scope (All vs Owned vs Shared)
  let filtered = documents.filter((doc) => {
    const isOwner = doc.owner_id === profile?.id || doc.access_level === "owner";
    if (filterScope === "owned") return isOwner;
    if (filterScope === "shared") return !isOwner;
    return true;
  });

  // 2. Filter by Category
  if (selectedCategory !== "all") {
    filtered = filtered.filter(
      (doc) => (doc.category || "").toLowerCase() === selectedCategory.toLowerCase()
    );
  }

  // 3. Filter by Search Query (title, category, description, owner email, owner name)
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        (doc.category && doc.category.toLowerCase().includes(q)) ||
        (doc.description && doc.description.toLowerCase().includes(q)) ||
        (doc.owner_email && doc.owner_email.toLowerCase().includes(q)) ||
        (doc.owner_name && doc.owner_name.toLowerCase().includes(q))
    );
  }

  // Extract unique categories
  const categories = Array.from(
    new Set(documents.map((d) => d.category).filter(Boolean))
  );

  const formatFileSize = (bytes: number | string): string => {
    const num = typeof bytes === "number" ? bytes : parseInt(bytes, 10) || 0;
    if (num === 0) return "0 KB";
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-5">
      {/* Filters & View Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-[#E8E6F8] shadow-sm">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-full">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCategory === "all"
                ? "bg-[#6153CC] text-white shadow-sm"
                : "bg-[#FBFBFE] text-[#6B7B9F] hover:bg-[#F6F8FD] hover:text-[#101936] border border-[#E8E6F8]"
            }`}
          >
            All Categories ({documents.length})
          </button>

          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory.toLowerCase() === cat.toLowerCase()
                  ? "bg-[#6153CC] text-white shadow-sm"
                  : "bg-[#FBFBFE] text-[#6B7B9F] hover:bg-[#F6F8FD] hover:text-[#101936] border border-[#E8E6F8]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* View Switcher & Action */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-[#E2E0F2] bg-[#FBFBFE] p-0.5">
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md text-xs transition-colors ${
                viewMode === "table"
                  ? "bg-white text-[#554DE7] shadow-sm font-semibold"
                  : "text-[#8A93B6] hover:text-[#101936]"
              }`}
              title="Table view"
              aria-label="Table view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md text-xs transition-colors ${
                viewMode === "grid"
                  ? "bg-white text-[#554DE7] shadow-sm font-semibold"
                  : "text-[#8A93B6] hover:text-[#101936]"
              }`}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={onOpenUpload}
            className="px-3.5 py-1.5 rounded-lg bg-[#6153CC] hover:bg-[#554DE7] text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* Active Search Banner */}
      {searchQuery.trim() && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#F1F3FD] border border-[#E8E6F8] text-xs text-[#554DE7]">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Search Filter:</span>
            <span>
              Found {filtered.length} matching document{filtered.length === 1 ? "" : "s"} for "{searchQuery}"
            </span>
          </div>
          {onClearSearch && (
            <button
              onClick={onClearSearch}
              className="text-[11px] font-semibold text-[#6153CC] hover:text-[#101936] underline flex items-center gap-1 transition-colors"
            >
              <X className="h-3 w-3" />
              <span>Clear search</span>
            </button>
          )}
        </div>
      )}

      {/* Main Document Listing */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-[#E8E6F8] shadow-sm py-16 px-4 text-center">
          <div className="h-16 w-16 rounded-3xl bg-[#F1F3FD] text-[#6153CC] mx-auto flex items-center justify-center mb-4 shadow-sm">
            <FolderLock className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-[#101936]">
            {searchQuery
              ? `No documents matching "${searchQuery}"`
              : filterScope === "shared"
              ? "No documents shared with you yet"
              : "No documents found in this section"}
          </h3>
          <p className="text-xs text-[#6B7B9F] max-w-sm mx-auto mt-1.5 leading-relaxed">
            {searchQuery
              ? "Try adjusting your search terms or clearing your category filters."
              : "Upload confidential documents with end-to-end security and fine-grained authorization."}
          </p>

          <div className="mt-5 flex items-center justify-center gap-2.5">
            {searchQuery && onClearSearch && (
              <button
                onClick={onClearSearch}
                className="px-4 py-2 rounded-xl border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#101936] text-xs font-semibold transition-all inline-flex items-center gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                <span>Clear Search</span>
              </button>
            )}
            <button
              onClick={onOpenUpload}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#7074EE] to-[#605BEB] hover:from-[#666AE8] hover:to-[#5550E0] text-white text-xs font-semibold shadow-md shadow-[#6153CC]/20 transition-all inline-flex items-center gap-2"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Upload New Document</span>
            </button>
          </div>
        </div>
      ) : viewMode === "table" ? (
        <div className="rounded-2xl bg-white border border-[#E8E6F8] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FBFBFE] border-b border-[#E8E6F8] text-[11px] font-semibold text-[#6B7B9F] uppercase tracking-wider">
                  <th className="py-3 px-5">Document Title</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Access Level</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E6F8] text-xs">
                {filtered.map((doc) => {
                  const isOwner = doc.owner_id === profile?.id || doc.access_level === "owner";
                  const canEdit = isOwner || doc.access_level === "edit";
                  const isDownloading = downloadingId === doc.id;
                  const isDeleting = deletingId === doc.id;

                  return (
                    <tr key={doc.id} className="hover:bg-[#FBFBFE]/70 transition-colors">
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-[#6153CC]/10 text-[#6153CC] flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-[#101936] truncate max-w-sm">
                              {doc.title}
                            </div>
                            {doc.description && (
                              <div className="text-[11px] text-[#6B7B9F] truncate max-w-sm mt-0.5">
                                {doc.description}
                              </div>
                            )}
                            <div className="text-[10px] text-[#8A93B6] truncate mt-0.5">
                              {isOwner
                                ? `Owner: You • ${doc.mime_type || "application/octet-stream"}`
                                : `Owner: ${doc.owner_email || doc.owner_name || "Authorized User"}${
                                    doc.shared_at ? ` • Shared on ${new Date(doc.shared_at).toLocaleDateString()}` : ""
                                  }`}
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
                              : doc.access_level === "edit"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-sky-50 text-sky-700 border border-sky-200"
                          }`}
                        >
                          <Lock className="h-2.5 w-2.5" />
                          <span>{doc.access_level}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-[#6B7B9F] font-mono text-[11px]">
                        {formatFileSize(doc.size_bytes)}
                      </td>

                      <td className="py-3.5 px-4 text-[#6B7B9F] text-[11px]">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-[#8A93B6]" />
                          {new Date(doc.created_at).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Download - available to all authorized users (read, edit, owner) */}
                          <button
                            onClick={() => onDownload(doc)}
                            disabled={isDownloading}
                            className="p-1.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#554DE7] hover:border-[#6153CC]/40 transition-all inline-flex items-center gap-1 text-[11px] font-semibold"
                            title="Download document securely"
                          >
                            <Download className={`h-3.5 w-3.5 ${isDownloading ? "animate-bounce" : ""}`} />
                            <span className="hidden sm:inline">Download</span>
                          </button>

                          {/* Edit Actions: Rename and Details - for owner and edit access */}
                          {canEdit && (
                            <>
                              <button
                                onClick={() => onOpenEdit(doc, "rename")}
                                className="p-1.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#6153CC] hover:border-[#6153CC]/40 transition-all inline-flex items-center gap-1 text-[11px] font-semibold"
                                title="Rename document"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="hidden md:inline">Rename</span>
                              </button>

                              <button
                                onClick={() => onOpenEdit(doc, "details")}
                                className="p-1.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#6153CC] hover:border-[#6153CC]/40 transition-all inline-flex items-center gap-1 text-[11px] font-semibold"
                                title="Edit document details and description"
                              >
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                <span className="hidden md:inline">Details</span>
                              </button>
                            </>
                          )}

                          {/* Owner Only Actions: Share and Delete */}
                          {isOwner && (
                            <>
                              <button
                                onClick={() => onOpenShare(doc)}
                                className="p-1.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#6153CC] hover:border-[#6153CC]/40 transition-all text-[11px] font-semibold"
                                title="Manage sharing & permissions"
                              >
                                <Share2 className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={() => onDelete(doc)}
                                disabled={isDeleting}
                                className="p-1.5 rounded-lg border border-[#E2E0F2] hover:bg-rose-50 text-rose-600 hover:border-rose-200 transition-all text-[11px] font-semibold"
                                title="Delete document"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grid Cards View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((doc) => {
            const isOwner = doc.owner_id === profile?.id || doc.access_level === "owner";
            const canEdit = isOwner || doc.access_level === "edit";
            const isDownloading = downloadingId === doc.id;
            const isDeleting = deletingId === doc.id;

            return (
              <div
                key={doc.id}
                className="p-5 rounded-2xl bg-white border border-[#E8E6F8] shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F1F3FD] text-[#554DE7]">
                      {doc.category || "General"}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                        isOwner
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : doc.access_level === "edit"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-sky-50 text-sky-700 border border-sky-200"
                      }`}
                    >
                      <Lock className="h-2.5 w-2.5" />
                      <span>{doc.access_level}</span>
                    </span>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#6153CC]/10 text-[#6153CC] flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-[#101936] truncate leading-tight">
                        {doc.title}
                      </h4>
                      {doc.description && (
                        <p className="text-[11px] text-[#6B7B9F] line-clamp-2 mt-1 leading-snug">
                          {doc.description}
                        </p>
                      )}
                      <p className="text-[11px] text-[#8A93B6] truncate mt-1">
                        {isOwner
                          ? `Size: ${formatFileSize(doc.size_bytes)}`
                          : `Owner: ${doc.owner_email || doc.owner_name || "Authorized User"} • ${formatFileSize(doc.size_bytes)}`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-[#E8E6F8] flex items-center justify-between text-xs">
                  <span className="text-[11px] text-[#8A93B6] flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(doc.created_at).toLocaleDateString()}
                  </span>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => onDownload(doc)}
                      disabled={isDownloading}
                      className="p-1.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#554DE7] transition-all"
                      title="Download document"
                    >
                      <Download className={`h-3.5 w-3.5 ${isDownloading ? "animate-bounce" : ""}`} />
                    </button>

                    {canEdit && (
                      <>
                        <button
                          onClick={() => onOpenEdit(doc, "rename")}
                          className="p-1.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#6153CC] transition-all"
                          title="Rename document"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onOpenEdit(doc, "details")}
                          className="p-1.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#6153CC] transition-all"
                          title="Edit document details"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}

                    {isOwner && (
                      <>
                        <button
                          onClick={() => onOpenShare(doc)}
                          className="p-1.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#6153CC] transition-all"
                          title="Share"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(doc)}
                          disabled={isDeleting}
                          className="p-1.5 rounded-lg border border-[#E2E0F2] hover:bg-rose-50 text-rose-600 transition-all"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
