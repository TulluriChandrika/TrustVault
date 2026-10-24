import React, { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
  RefreshCw,
  MoreVertical,
  Loader2,
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
  onRefresh?: () => void;
  isRefreshing?: boolean;
  refreshFeedback?: { type: "success" | "error"; message: string } | null;
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
  onRefresh,
  isRefreshing = false,
  refreshFeedback = null,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Floating Portal Overflow Menu State
  interface FloatingMenuState {
    doc: DocumentItem;
    triggerEl: HTMLElement;
    position: { top: number; left: number };
  }

  const calculateMenuPosition = useCallback(
    (
      triggerEl: HTMLElement,
      menuEl: HTMLElement | null,
      isOwner: boolean
    ): { top: number; left: number } => {
      const rect = triggerEl.getBoundingClientRect();
      const menuWidth = menuEl ? menuEl.offsetWidth : 160;
      // Owner has 3 actions (~122px); Non-owner (editor) has 1 action (~44px)
      const menuHeight = menuEl ? menuEl.offsetHeight : isOwner ? 122 : 44;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Align right edge of menu with right edge of trigger button
      let left = rect.right - menuWidth;
      if (left < 8) {
        left = 8;
      } else if (left + menuWidth > viewportWidth - 8) {
        left = viewportWidth - menuWidth - 8;
      }

      // Default to placing below button; if it would overflow bottom, flip above
      let top = rect.bottom + 4;
      if (top + menuHeight > viewportHeight - 8) {
        const topAbove = rect.top - menuHeight - 4;
        if (topAbove >= 8) {
          top = topAbove;
        } else {
          top = Math.max(8, viewportHeight - menuHeight - 8);
        }
      }

      return { top, left };
    },
    []
  );

  const [floatingMenu, setFloatingMenu] = useState<FloatingMenuState | null>(null);
  const portalMenuRef = useRef<HTMLDivElement>(null);

  const handleToggleMenu = useCallback(
    (doc: DocumentItem, triggerEl: HTMLElement) => {
      if (floatingMenu?.doc.id === doc.id) {
        setFloatingMenu(null);
        return;
      }
      const isOwner = doc.owner_id === profile?.id || doc.access_level === "owner";
      const initialPos = calculateMenuPosition(triggerEl, null, isOwner);
      setFloatingMenu({
        doc,
        triggerEl,
        position: initialPos,
      });
    },
    [calculateMenuPosition, floatingMenu?.doc.id, profile?.id]
  );

  // Synchronously measure and refine position before browser paint if element dimensions differ
  useLayoutEffect(() => {
    if (!floatingMenu || !portalMenuRef.current) return;

    const isOwner =
      floatingMenu.doc.owner_id === profile?.id ||
      floatingMenu.doc.access_level === "owner";
    const refinedPos = calculateMenuPosition(
      floatingMenu.triggerEl,
      portalMenuRef.current,
      isOwner
    );

    if (
      refinedPos.top !== floatingMenu.position.top ||
      refinedPos.left !== floatingMenu.position.left
    ) {
      setFloatingMenu((prev) =>
        prev && prev.doc.id === floatingMenu.doc.id
          ? { ...prev, position: refinedPos }
          : prev
      );
    }
  }, [calculateMenuPosition, floatingMenu?.doc.id, floatingMenu?.triggerEl, profile?.id]);

  // Close floating menu if the relevant document is removed from document list
  useEffect(() => {
    if (floatingMenu && !documents.some((d) => d.id === floatingMenu.doc.id)) {
      setFloatingMenu(null);
    }
  }, [documents, floatingMenu]);

  // Handle outside clicks, Escape key, and scroll/resize dismissal
  useEffect(() => {
    if (!floatingMenu) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (floatingMenu.triggerEl.contains(target)) {
        return;
      }
      if (portalMenuRef.current && portalMenuRef.current.contains(target)) {
        return;
      }
      setFloatingMenu(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFloatingMenu(null);
        floatingMenu.triggerEl.focus();
      }
    };

    const handleScrollOrResize = () => {
      setFloatingMenu(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [floatingMenu]);

  // Focus first menu item when opened for keyboard accessibility
  useEffect(() => {
    if (floatingMenu && portalMenuRef.current) {
      const firstButton = portalMenuRef.current.querySelector<HTMLButtonElement>(
        "button:not([disabled])"
      );
      firstButton?.focus();
    }
  }, [floatingMenu?.doc.id]);

  // Keyboard navigation within the floating menu (ArrowDown/ArrowUp)
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!portalMenuRef.current) return;
      const buttons = Array.from(
        portalMenuRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])")
      );
      const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (currentIndex === -1) {
        buttons[0]?.focus();
      } else if (e.key === "ArrowDown") {
        const nextIndex = (currentIndex + 1) % buttons.length;
        buttons[nextIndex]?.focus();
      } else {
        const prevIndex = (currentIndex - 1 + buttons.length) % buttons.length;
        buttons[prevIndex]?.focus();
      }
    }
  };

  // 1. Filter by scope (All vs Owned vs Shared)
  const scopeFiltered = useMemo(() => {
    return documents.filter((doc) => {
      const isOwner = doc.owner_id === profile?.id || doc.access_level === "owner";
      if (filterScope === "owned") return isOwner;
      if (filterScope === "shared") return !isOwner;
      return true;
    });
  }, [documents, filterScope, profile?.id]);

  // Extract unique categories from the scope-filtered documents
  const categories = useMemo(() => {
    return Array.from(new Set(scopeFiltered.map((d) => d.category).filter(Boolean)));
  }, [scopeFiltered]);

  // Reset category if selected category is not present in the new scope
  useEffect(() => {
    if (
      selectedCategory !== "all" &&
      !categories.some((c) => c.toLowerCase() === selectedCategory.toLowerCase())
    ) {
      setSelectedCategory("all");
    }
  }, [categories, selectedCategory]);

  // 2. Filter by Category
  let filtered = scopeFiltered;
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
            All Categories ({scopeFiltered.length})
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

        {/* View Switcher, Refresh & Upload Action */}
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              id="refresh-documents-btn"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Refresh documents list"
              className="h-8 px-2.5 rounded-lg border border-[#E2E0F2] bg-[#FBFBFE] hover:bg-[#F6F8FD] hover:text-[#6153CC] text-[#101936] text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-[#6153CC] ${isRefreshing ? "animate-spin" : ""}`} />
              <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
            </button>
          )}

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

      {/* Subtle Document Refresh Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#F6F8FD] border border-[#E8E6F8] text-[12px] text-[#6B7B9F]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#101936]">Not seeing the latest changes?</span>
          <span>Refresh your documents to see the latest files and sharing permissions.</span>
        </div>
        {refreshFeedback && (
          <div
            className={`text-xs font-medium px-2 py-0.5 rounded-md ${
              refreshFeedback.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}
          >
            {refreshFeedback.message}
          </div>
        )}
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
                        <div className="flex items-center justify-end gap-1.5 relative" data-row-menu>
                          {/* Primary Action 1: Download (all users) */}
                          <button
                            onClick={() => onDownload(doc)}
                            disabled={isDownloading}
                            className="p-1.5 px-2.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#554DE7] hover:border-[#6153CC]/40 transition-all inline-flex items-center gap-1.5 text-[11px] font-semibold disabled:opacity-80"
                            title="Download document securely"
                            aria-label={isDownloading ? "Downloading document" : "Download document"}
                          >
                            {isDownloading ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#554DE7]" />
                                <span>Downloading…</span>
                              </>
                            ) : (
                              <>
                                <Download className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Download</span>
                              </>
                            )}
                          </button>

                          {/* Primary Action 2 (if available): Share for Owner, Details for Editor */}
                          {isOwner ? (
                            <button
                              onClick={() => onOpenShare(doc)}
                              className="p-1.5 px-2.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#6153CC] hover:border-[#6153CC]/40 transition-all inline-flex items-center gap-1.5 text-[11px] font-semibold"
                              title="Manage sharing & permissions"
                              aria-label="Share document"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Share</span>
                            </button>
                          ) : canEdit ? (
                            <button
                              onClick={() => onOpenEdit(doc, "details")}
                              className="p-1.5 px-2.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#6153CC] hover:border-[#6153CC]/40 transition-all inline-flex items-center gap-1.5 text-[11px] font-semibold"
                              title="Edit document details and description"
                              aria-label="Edit document details"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Details</span>
                            </button>
                          ) : null}

                          {/* 3-dot Overflow Menu (when > 2 actions exist: Owner has 5, Editor has 3) */}
                          {(isOwner || canEdit) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleMenu(doc, e.currentTarget);
                              }}
                              aria-label={`More actions for ${doc.title}`}
                              aria-haspopup="true"
                              aria-expanded={floatingMenu?.doc.id === doc.id}
                              className={`p-1.5 rounded-lg border transition-all inline-flex items-center ${
                                floatingMenu?.doc.id === doc.id
                                  ? "border-[#6153CC] bg-[#F1F3FD] text-[#6153CC]"
                                  : "border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#8A93B6] hover:text-[#101936]"
                              }`}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
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

            return (
              <div
                key={doc.id}
                className="p-5 rounded-2xl bg-white border border-[#E8E6F8] shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow relative"
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

                  <div className="flex items-center gap-1.5 relative" data-row-menu>
                    {/* Primary Action 1: Download */}
                    <button
                      onClick={() => onDownload(doc)}
                      disabled={isDownloading}
                      className="p-1.5 px-2.5 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#554DE7] hover:border-[#6153CC]/40 transition-all inline-flex items-center gap-1.5 text-[11px] font-semibold disabled:opacity-80"
                      title="Download document securely"
                      aria-label={isDownloading ? "Downloading document" : "Download document"}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#554DE7]" />
                          <span>Downloading…</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          <span>Download</span>
                        </>
                      )}
                    </button>

                    {/* Primary Action 2 (if available): Share for Owner, Details for Editor */}
                    {isOwner ? (
                      <button
                        onClick={() => onOpenShare(doc)}
                        className="p-1.5 px-2 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#6153CC] hover:border-[#6153CC]/40 transition-all inline-flex items-center gap-1 text-[11px] font-semibold"
                        title="Manage sharing & permissions"
                        aria-label="Share document"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Share</span>
                      </button>
                    ) : canEdit ? (
                      <button
                        onClick={() => onOpenEdit(doc, "details")}
                        className="p-1.5 px-2 rounded-lg border border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#6153CC] hover:border-[#6153CC]/40 transition-all inline-flex items-center gap-1 text-[11px] font-semibold"
                        title="Edit document details"
                        aria-label="Edit document details"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Details</span>
                      </button>
                    ) : null}

                    {/* 3-dot Overflow Menu */}
                    {(isOwner || canEdit) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleMenu(doc, e.currentTarget);
                        }}
                        aria-label={`More actions for ${doc.title}`}
                        aria-haspopup="true"
                        aria-expanded={floatingMenu?.doc.id === doc.id}
                        className={`p-1.5 rounded-lg border transition-all inline-flex items-center ${
                          floatingMenu?.doc.id === doc.id
                            ? "border-[#6153CC] bg-[#F1F3FD] text-[#6153CC]"
                            : "border-[#E2E0F2] hover:bg-[#F6F8FD] text-[#8A93B6] hover:text-[#101936]"
                        }`}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Portal Overflow Menu rendered directly into document.body */}
      {floatingMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={portalMenuRef}
            role="menu"
            aria-orientation="vertical"
            aria-label={`Actions for ${floatingMenu.doc.title}`}
            onKeyDown={handleMenuKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: `${floatingMenu.position.top}px`,
              left: `${floatingMenu.position.left}px`,
              zIndex: 9999,
            }}
            className="w-40 rounded-xl bg-white border border-[#E8E6F8] shadow-2xl py-1 text-left origin-top-right animate-in fade-in zoom-in-95 duration-100"
          >
            {(floatingMenu.doc.owner_id === profile?.id || floatingMenu.doc.access_level === "owner") && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const doc = floatingMenu.doc;
                  setFloatingMenu(null);
                  onOpenEdit(doc, "details");
                }}
                className="w-full px-3 py-2 text-[11.5px] font-medium text-[#101936] hover:bg-[#F6F8FD] focus:bg-[#F6F8FD] focus:outline-none flex items-center gap-2 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#6153CC]" />
                <span>Edit Details</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const doc = floatingMenu.doc;
                setFloatingMenu(null);
                onOpenEdit(doc, "rename");
              }}
              className="w-full px-3 py-2 text-[11.5px] font-medium text-[#101936] hover:bg-[#F6F8FD] focus:bg-[#F6F8FD] focus:outline-none flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5 text-[#6153CC]" />
              <span>Rename</span>
            </button>

            {(floatingMenu.doc.owner_id === profile?.id || floatingMenu.doc.access_level === "owner") && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const doc = floatingMenu.doc;
                  setFloatingMenu(null);
                  onDelete(doc);
                }}
                disabled={deletingId === floatingMenu.doc.id}
                className="w-full px-3 py-2 text-[11.5px] font-medium text-rose-600 hover:bg-rose-50 focus:bg-rose-50 focus:outline-none flex items-center gap-2 border-t border-[#E8E6F8] mt-1 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                <span>Delete</span>
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
