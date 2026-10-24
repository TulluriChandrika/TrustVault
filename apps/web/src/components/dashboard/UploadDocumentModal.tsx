import React, { useState, useRef } from "react";
import { UploadCloud, FileText, X, AlertCircle, Loader2, Tag } from "lucide-react";
import { uploadDocument } from "@/lib/api";

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  onSuccess: () => void;
}

const COMMON_CATEGORIES = ["General", "Financial", "Legal", "Contracts", "Technical", "Identity", "Personal"];

export const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  token,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [isTitleManuallyEdited, setIsTitleManuallyEdited] = useState(false);
  const [category, setCategory] = useState("General");
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (selected: File | null) => {
    if (!selected) return;
    setFile(selected);
    setError(null);
    if (!isTitleManuallyEdited) {
      // Auto-suggest title based on filename without extension
      const baseName = selected.name.replace(/\.[^/.]+$/, "");
      setTitle(baseName);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Please select a file to upload.");
      return;
    }

    if (!category.trim()) {
      setError("Please specify a document category.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", (title.trim() || file.name));
    formData.append("category", category.trim());

    setLoading(true);
    try {
      await uploadDocument(token, formData);
      onSuccess();
      onClose();
      // Reset form
      setFile(null);
      setTitle("");
      setIsTitleManuallyEdited(false);
      setCategory("General");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload document.");
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white border border-[#E8E6F8] shadow-2xl p-6 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E8E6F8]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#6153CC]/10 text-[#6153CC] flex items-center justify-center">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#101936]">Upload Secure Document</h3>
              <p className="text-[11.5px] text-[#6B7B9F]">
                Uploaded documents are encrypted and tracked in the audit trail
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-[#8A93B6] hover:bg-[#F6F8FD] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Drag & Drop Zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload document file picker"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6153CC]/30 transition-all ${
              isDragging
                ? "border-[#6153CC] bg-[#6153CC]/5 scale-[1.01]"
                : file
                ? "border-emerald-300 bg-emerald-50/40"
                : "border-[#E2E0F2] hover:border-[#6153CC]/50 hover:bg-[#FBFBFE]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              disabled={loading}
            />

            {file ? (
              <div className="flex items-center justify-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-[#101936] truncate max-w-xs">{file.name}</p>
                  <p className="text-[11px] text-[#6B7B9F] font-mono">{formatFileSize(file.size)}</p>
                </div>
              </div>
            ) : (
              <div>
                <UploadCloud className="h-8 w-8 text-[#8A93B6] mx-auto mb-2" />
                <p className="text-xs font-bold text-[#101936]">
                  Click to select or drag and drop your file here
                </p>
                <p className="text-[11px] text-[#8A93B6] mt-0.5">
                  PDF, DOCX, TXT, PNG, JPEG, JSON (up to 25 MB)
                </p>
              </div>
            )}
          </div>

          {/* Title Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="doc-title" className="text-xs font-semibold text-[#101936]">
              Document Title
            </label>
            <input
              id="doc-title"
              type="text"
              placeholder="e.g. Master Services Agreement 2026"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setIsTitleManuallyEdited(true);
              }}
              disabled={loading}
              className="h-10 px-3 text-xs bg-[#FBFBFE] border border-[#E2E0F2] rounded-xl text-[#101936] placeholder:text-[#8A93B6] outline-none focus:border-[#6153CC] focus:ring-2 focus:ring-[#6153CC]/10 transition-all"
            />
          </div>

          {/* Category Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="doc-category" className="text-xs font-semibold text-[#101936]">
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
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
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

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[#E8E6F8] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-[#E2E0F2] hover:bg-[#F6F8FD] text-xs font-semibold text-[#6B7B9F] transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !file}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#7074EE] to-[#605BEB] hover:from-[#666AE8] hover:to-[#5550E0] text-white text-xs font-semibold shadow-md shadow-[#6153CC]/25 flex items-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Uploading securely...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>Upload Document</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
