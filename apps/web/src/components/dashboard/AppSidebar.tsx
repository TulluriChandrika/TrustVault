import React from "react";
import {
  LayoutDashboard,
  FileText,
  FolderLock,
  Share2,
  UploadCloud,
  History,
  Settings,
  ShieldAlert,
  LogOut,
  Shield,
  X,
} from "lucide-react";
import type { UserProfile } from "@/lib/api";

export type DashboardView =
  | "overview"
  | "all-documents"
  | "my-documents"
  | "shared-with-me"
  | "upload"
  | "activity"
  | "settings"
  | "admin";

interface AppSidebarProps {
  currentView: DashboardView;
  onNavigate: (view: DashboardView) => void;
  profile: UserProfile | null;
  onSignOut: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  documentCounts: {
    total: number;
    owned: number;
    shared: number;
  };
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentView,
  onNavigate,
  profile,
  onSignOut,
  isOpenMobile,
  onCloseMobile,
  documentCounts,
}) => {
  const isAdmin = profile?.role === "admin";

  const navItems = [
    {
      id: "overview" as DashboardView,
      label: "Overview",
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: "all-documents" as DashboardView,
      label: "All Documents",
      icon: FileText,
      badge: documentCounts.total,
    },
    {
      id: "my-documents" as DashboardView,
      label: "My Documents",
      icon: FolderLock,
      badge: documentCounts.owned,
    },
    {
      id: "shared-with-me" as DashboardView,
      label: "Shared With Me",
      icon: Share2,
      badge: documentCounts.shared,
    },
    {
      id: "upload" as DashboardView,
      label: "Upload Document",
      icon: UploadCloud,
      badge: null,
    },
    {
      id: "activity" as DashboardView,
      label: "Activity & Audit",
      icon: History,
      badge: null,
    },
    {
      id: "settings" as DashboardView,
      label: "Settings",
      icon: Settings,
      badge: null,
    },
    ...(isAdmin
      ? [
          {
            id: "admin" as DashboardView,
            label: "Admin Console",
            icon: ShieldAlert,
            badge: "Admin",
          },
        ]
      : []),
  ];

  const handleItemClick = (viewId: DashboardView) => {
    onNavigate(viewId);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Persistent Left Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#FFFFFF] border-r border-[#E8E6F8] flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-[#E8E6F8] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-[#6153CC] to-[#7074EE] text-white shadow-md shadow-[#6153CC]/25">
              <Shield className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[17px] font-bold tracking-tight text-[#101936] leading-tight">
                TrustVault
              </span>
              <span className="text-[10px] font-semibold text-[#8A93B6] tracking-wider uppercase">
                Secure Storage
              </span>
            </div>
          </div>

          <button
            onClick={onCloseMobile}
            className="p-1 rounded-lg text-[#8A93B6] hover:bg-[#F6F8FD] lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#8A93B6]">
            Vault Workspace
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all ${
                  isActive
                    ? "bg-[#6153CC]/10 text-[#554DE7] font-semibold"
                    : "text-[#6B7B9F] hover:bg-[#F6F8FD] hover:text-[#101936]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`h-[18px] w-[18px] transition-colors ${
                      isActive ? "text-[#6153CC]" : "text-[#8A93B6]"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      isActive
                        ? "bg-[#6153CC] text-white"
                        : "bg-[#F1F3FD] text-[#6B7B9F]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* User Profile & Sign Out Footer */}
        <div className="p-3.5 border-t border-[#E8E6F8] bg-[#FBFBFE]/70">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-white border border-[#E8E6F8] shadow-sm">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#6153CC]/15 text-[#554DE7] font-bold text-sm uppercase">
              {(profile?.full_name || profile?.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[#101936] truncate">
                {profile?.full_name || profile?.email || "User"}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-medium text-[#6B7B9F] uppercase tracking-wider">
                  {profile?.role === "admin" ? "Administrator" : "User"}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onSignOut}
            className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};
