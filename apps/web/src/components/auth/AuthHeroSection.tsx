import * as React from "react";
import { Shield, Users, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuthHeroSectionProps {
  imageSrc?: string;
  className?: string;
}

export const AuthHeroSection: React.FC<AuthHeroSectionProps> = ({
  imageSrc = "/trustvault-hero.svg",
  className,
}) => {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between p-8 xl:p-12 overflow-hidden bg-[#0B132B] bg-gradient-to-br from-[#0B132B] via-[#101B3B] to-[#070D1F] border-r border-slate-800/80 text-white min-h-full",
        className
      )}
    >
      {/* Background ambient lighting */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />

      {/* Top Brand Header */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-500/30">
            <Shield className="size-5" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-white block">TrustVault</span>
            <span className="text-[10.5px] uppercase tracking-wider text-slate-400 font-semibold">
              Document Security Platform
            </span>
          </div>
        </div>
        <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Lock className="h-3.5 w-3.5" /> Enterprise Grade
        </div>
      </div>

      {/* Center Hero Image Visual */}
      <div className="relative z-10 my-auto py-6">
        <div className="relative rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-900/40 p-4 xl:p-6 backdrop-blur-sm shadow-2xl">
          <img
            src={imageSrc}
            alt="TrustVault Security Architecture"
            className="w-full max-h-[340px] xl:max-h-[380px] object-contain mx-auto drop-shadow-2xl"
          />
        </div>

        {/* Headline & Supporting Text */}
        <div className="mt-8 space-y-3">
          <h1 className="text-2xl xl:text-3xl font-extrabold tracking-tight text-white leading-tight">
            Your important documents, always protected.
          </h1>
          <p className="text-sm text-slate-300/90 leading-relaxed max-w-xl">
            Secure document storage, controlled sharing, and granular access permissions designed for
            modern enterprise workflows with tamper-evident audit trails.
          </p>
        </div>

        {/* Three Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-6">
          {/* Highlight 1: Secure Storage */}
          <div className="rounded-xl p-3.5 bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400 mb-2">
              <Shield className="size-4" />
            </div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Secure Storage</h2>
            <p className="text-[11.5px] text-slate-400 mt-1 leading-snug">
              Isolated private cloud vaults with server-managed cryptographic keys.
            </p>
          </div>

          {/* Highlight 2: Easy Sharing */}
          <div className="rounded-xl p-3.5 bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 mb-2">
              <Users className="size-4" />
            </div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Easy Sharing</h2>
            <p className="text-[11.5px] text-slate-400 mt-1 leading-snug">
              Controlled permissions: assign Owner, Editor, or Viewer access instantly.
            </p>
          </div>

          {/* Highlight 3: Access Anywhere */}
          <div className="rounded-xl p-3.5 bg-slate-900/60 border border-slate-700/50 hover:border-slate-600 transition-colors">
            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400 mb-2">
              <Globe className="size-4" />
            </div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Access Anywhere</h2>
            <p className="text-[11.5px] text-slate-400 mt-1 leading-snug">
              Pre-signed on-demand access backed by immutable access logs.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Footer Info */}
      <div className="relative z-10 flex flex-wrap items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-4 gap-2">
        <span>Trusted by security-conscious teams for enterprise document compliance.</span>
        <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Active Protocols
        </span>
      </div>
    </div>
  );
};
