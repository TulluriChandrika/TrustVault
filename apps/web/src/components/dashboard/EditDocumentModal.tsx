import React, { useState, useEffect } from "react";
import { X, FileText, AlertCircle, Loader2, Check, Tag } from "lucide-react";
import { updateDocumentMetadata, type DocumentItem } from "@/lib/api";

interface EditDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  document: DocumentItem | null;
  mode: "rename" | "details";
  onSuccess: () => void;
}

const COMMON_CATEGORIES = ["General", "Financial", "Legal", "Contracts", "Technical", "Identity"];

export const EditDocumentModal: React.FC<EditDocumentModalProps> = ({
  isOpen,
  onClose,
  token,
  document,
  mode,
  onSuccess,
}) => {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (document) {
      setTitle(document.title || "");
      setCategory(document.category || "General");
      setDescription(document.description || "");
      setError(null);
    }
  }, [document, isOpen]);

  if (!isOpen || !document) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Document title cannot be empty.");
      return;
    }
    if (trimmedTitle.length > 200) {
      setError("Document title must be at most 200 characters.");
      return;
    }

    const trimmedCategory = category.trim();
    if (!trimmedCategory) {
      setError("Category cannot be empty.");
      return;
    }
    if (trimmedCategory.length > 100) {
      setError("Category must be at most 100 characters.");
      return;
    }

    const trimmedDescription = description.trim();
    if (trimmedDescription.length > 1000) {
      setError("Description cannot exceed 1000 characters.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "rename") {
        await updateDocumentMetadata(token, document.id, {
          title: trimmedTitle,
        });
      } else {
        await updateDocumentMetadata(token, document.id, {
          title: trimmedTitle,
          category: trimmedCategory,
          description: trimmedDescription || null,
        });
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update document.");
    } finally {
      setLoading(false);
    }
  };

  const isRenameOnly = mode === "rename";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md rounded-2xl bg-white border border-[#E8E6F8] shadow-2xl overflow-hidden animate-scale-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E8E6F8] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#6153CC]/10 text-[#6153CC] flex items-center justify-center">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h3 id="modal-title" className="text-sm font-bold text-[#101936]">
                {isRenameOnly ? "Rename Document" : "Edit Document Details"}
              </h3>
              <p className="text-[11px] text-[#6B7B9F]">
                {isRenameOnly
                  ? "Update display title without replacing stored object"
                  : "Modify title, categorization, and metadata"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-[#8A93B6] hover:bg-[#F6F8FD] hover:text-[#101936] transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Title Field */}
          <div>
            <label htmlFor="doc-title" className="block text-xs font-semibold text-[#101936] mb-1.5">
              Document Title / Filename <span className="text-rose-500">*</span>
            </label>
            <input
              id="doc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q4_Financial_Report.pdf"
              maxLength={200}
              disabled={loading}
              className="w-full px-3 py-2 text-xs bg-[#FBFBFE] border border-[#E2E0F2] rounded-xl text-[#101936] placeholder:text-[#8A93B6] focus:border-[#6153CC] focus:ring-2 focus:ring-[#6153CC]/10 outline-none transition-all"
              autoFocus
            />
            <div className="flex justify-between items-center mt-1 text-[10px] text-[#8A93B6]">
              <span>Original filename: {document.title}</span>
              <span>{title.length}/200</span>
            </div>
          </div>

          {/* Category & Description (only in details mode) */}
          {!isRenameOnly && (
            <>
              <div>
                <label htmlFor="doc-category" className="block text-xs font-semibold text-[#101936] mb-1.5">
                  Category <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8A93B6]" />
                  <input
                    id="doc-category"
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Legal, Financial, General"
                    maxLength={100}
                    disabled={loading}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-[#FBFBFE] border border-[#E2E0F2] rounded-xl text-[#101936] placeholder:text-[#8A93B6] focus:border-[#6153CC] focus:ring-2 focus:ring-[#6153CC]/10 outline-none transition-all"
                  />
                </div>
                {/* Category Suggestion Pills */}
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className="text-[10px] text-[#8A93B6]">Suggestions:</span>
                  {COMMON_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`text-[10px] px-2 py-0.5 rounded-md font-medium border transition-colors ${
                        category.toLowerCase() === cat.toLowerCase()
                          ? "bg-[#6153CC] text-white border-[#6153CC]"
                          : "bg-[#FBFBFE] text-[#6B7B9F] border-[#E8E6F8] hover:bg-[#F6F8FD]"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="doc-description" className="block text-xs font-semibold text-[#101936] mb-1.5">
                  Description <span className="text-[#8A93B6] font-normal">(Optional)</span>
                </label>
                <textarea
                  id="doc-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide context, notes, or classification details for authorized collaborators..."
                  rows={3}
                  maxLength={1000}
                  disabled={loading}
                  className="w-full px-3 py-2 text-xs bg-[#FBFBFE] border border-[#E2E0F2] rounded-xl text-[#101936] placeholder:text-[#8A93B6] focus:border-[#6153CC] focus:ring-2 focus:ring-[#6153CC]/10 outline-none transition-all resize-none"
                />
                <div className="text-right text-[10px] text-[#8A93B6] mt-0.5">
                  {description.length}/1000
                </div>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-[#E2E0F2] hover:bg-[#F6F8FD] text-xs font-semibold text-[#6B7B9F] hover:text-[#101936] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#7074EE] to-[#605BEB] hover:from-[#666AE8] hover:to-[#5550E0] text-white text-xs font-semibold shadow-md shadow-[#6153CC]/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>{isRenameOnly ? "Rename" : "Save Changes"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
