import React, { useState, useRef, useEffect } from "react";
import {
  Menu,
  Search,
  UploadCloud,
  X,
  Settings,
  KeyRound,
  LogOut,
  Shield,
} from "lucide-react";
import type { DashboardView } from "./AppSidebar";
import type { UserProfile } from "@/lib/api";

interface AppHeaderProps {
  currentView: DashboardView;
  onOpenMobileSidebar: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenUpload: () => void;
  profile: UserProfile | null;
  onNavigateSettings: () => void;
  onOpenChangePassword: () => void;
  onSignOut: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentView,
  onOpenMobileSidebar,
  searchQuery,
  onSearchChange,
  onOpenUpload,
  profile,
  onNavigateSettings,
  onOpenChangePassword,
  onSignOut,
}) => {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const getHeaderTitle = (view: DashboardView): { title: string; subtitle: string } => {
    switch (view) {
      case "overview":
        return {
          title: "Dashboard Overview",
          subtitle: "Summary of your secure documents and vault activity",
        };
      case "all-documents":
        return {
          title: "All Documents",
          subtitle: "All files you own or have received access to",
        };
      case "my-documents":
        return {
          title: "My Documents",
          subtitle: "Private documents owned and managed by your account",
        };
      case "shared-with-me":
        return {
          title: "Shared With Me",
          subtitle: "Documents shared with you by other authorized users",
        };
      case "upload":
        return {
          title: "Upload Document",
          subtitle: "Upload encrypted files with per-document access control",
        };
      case "activity":
        return {
          title: "Activity & Audit Trail",
          subtitle: "Cryptographically verified access and administrative events",
        };
      case "settings":
        return {
          title: "Account Settings",
          subtitle: "Manage your profile, credentials, and system diagnostics",
        };
      case "admin":
        return {
          title: "Administrative Console",
          subtitle: "System audit logs, tenant integrity, and user policies",
        };
      default:
        return { title: "Vault", subtitle: "Secure document management" };
    }
  };

  const { title, subtitle } = getHeaderTitle(currentView);
  const displayName = profile?.full_name || profile?.email || "User";
  const displayRole = profile?.role === "admin" ? "Administrator" : "User";
  const userInitial = displayName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 h-16 bg-[#FFFFFF]/90 backdrop-blur-md border-b border-[#E8E6F8] px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Mobile Hamburger & Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileSidebar}
          className="p-2 -ml-2 rounded-lg text-[#6B7B9F] hover:bg-[#F6F8FD] hover:text-[#101936] lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-[#101936] truncate leading-tight">
            {title}
          </h1>
          <p className="text-[11.5px] text-[#6B7B9F] hidden sm:block truncate mt-0.5">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Search Input, Upload Button, and User Profile Menu */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Real-time Document Search Bar */}
        <div className="relative w-40 sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8A93B6] pointer-events-none" />
          <input
            id="global-document-search"
            type="text"
            aria-label="Search documents or owner"
            placeholder="Search documents or owner..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-9 pl-8 pr-7 text-xs bg-[#FBFBFE] border border-[#E2E0F2] rounded-lg text-[#101936] placeholder:text-[#8A93B6] outline-none focus:border-[#6153CC] focus:ring-2 focus:ring-[#6153CC]/10 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A93B6] hover:text-[#101936]"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Quick Upload Button */}
        <button
          onClick={onOpenUpload}
          className="h-9 px-3.5 rounded-lg bg-gradient-to-r from-[#7074EE] to-[#605BEB] hover:from-[#666AE8] hover:to-[#5550E0] text-white text-xs font-semibold shadow-sm shadow-[#6153CC]/25 flex items-center gap-1.5 shrink-0 active:scale-[0.98] transition-all"
        >
          <UploadCloud className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Upload</span>
        </button>

        {/* User Profile Menu Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex items-center justify-center h-9 w-9 rounded-xl bg-[#F6F8FD] hover:bg-[#E8E6F8]/70 border border-[#E8E6F8] text-[#101936] transition-all focus:outline-none focus:ring-2 focus:ring-[#6153CC]/20 active:scale-95"
            aria-label="User profile and account settings"
            aria-expanded={profileMenuOpen}
            aria-haspopup="true"
            title={`${displayName} (${displayRole})`}
          >
            <div className="h-7 w-7 rounded-lg bg-[#6153CC] text-white text-xs font-bold flex items-center justify-center shadow-xs">
              {userInitial}
            </div>
          </button>

          {/* Dropdown Menu */}
          {profileMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-[#E8E6F8] shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {/* Profile Details Header */}
              <div className="px-4 py-3 border-b border-[#E8E6F8]">
                <p className="text-xs font-bold text-[#101936] truncate">{displayName}</p>
                <p className="text-[11px] text-[#6B7B9F] truncate mt-0.5">
                  {profile?.email || ""}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#6153CC]/10 text-[#6153CC] text-[10.5px] font-semibold">
                  <Shield className="h-3 w-3" />
                  <span>{displayRole}</span>
                </div>
              </div>

              {/* Menu Items */}
              <div className="py-1">
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onNavigateSettings();
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-[#101936] hover:bg-[#F6F8FD] flex items-center gap-2.5 transition-colors font-medium"
                >
                  <Settings className="h-3.5 w-3.5 text-[#6153CC]" />
                  <span>Account Settings</span>
                </button>

                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onOpenChangePassword();
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-[#101936] hover:bg-[#F6F8FD] flex items-center gap-2.5 transition-colors font-medium"
                >
                  <KeyRound className="h-3.5 w-3.5 text-[#6153CC]" />
                  <span>Change Password</span>
                </button>
              </div>

              {/* Sign Out Action */}
              <div className="pt-1 border-t border-[#E8E6F8]">
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    onSignOut();
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors font-semibold"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
