import * as React from "react";
import { Shield, FileCheck, KeyRound, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuthLayoutProps {
  children: React.ReactNode;
  promoImageArea?: React.ReactNode;
  className?: string;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  children,
  promoImageArea,
  className,
}) => {
  return (
    <div className={cn("min-h-screen w-full grid lg:grid-cols-2 bg-background text-foreground", className)}>
      {/* 
        ========================================================================
        LEFT COLUMN: Promotional Branding & Visual Reference Placeholder
        Visible on lg+ screens; hidden on mobile.
        When you provide the reference image, pass it via `promoImageArea`
        or replace the default placeholder below.
        ========================================================================
      */}
      <aside className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-r border-border/60">
        {/* Ambient background glow accents */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />

        {/* Top: Brand Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/25">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-white block">TrustVault</span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
              Secure Document Infrastructure
            </span>
          </div>
        </div>

        {/* Middle: Visual Area / Promotional Graphic Placeholder */}
        <div className="relative z-10 my-8">
          {promoImageArea ? (
            /* Custom promotional image supplied by user */
            <div data-slot="custom-promo-image" className="w-full">
              {promoImageArea}
            </div>
          ) : (
            /* 
              Default placeholder container.
              Easily replaced once original visual reference image is provided.
            */
            <div
              data-slot="promo-image-placeholder"
              className="relative rounded-2xl border border-border/60 bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-8 backdrop-blur-sm shadow-2xl space-y-6"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Lock className="h-3.5 w-3.5" /> Zero-Trust Document Vault
              </div>

              <div className="space-y-3">
                <h1 className="text-2xl xl:text-3xl font-extrabold tracking-tight text-white leading-snug">
                  Enterprise-grade document security with verifiable audit integrity.
                </h1>
                <p className="text-sm text-slate-300/80 leading-relaxed">
                  Protect sensitive company files with cryptographically backed user authorization,
                  isolated private cloud storage, and non-repudiable audit logging.
                </p>
              </div>

              {/* Security Feature Highlights */}
              <div className="grid grid-cols-1 gap-3 pt-2">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/60 border border-white/5">
                  <div className="mt-0.5 rounded p-1 bg-blue-500/10 text-blue-400">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold text-slate-200">Server-Side Authorization</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Owner, editor, and viewer permissions enforced on every single request.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/60 border border-white/5">
                  <div className="mt-0.5 rounded p-1 bg-emerald-500/10 text-emerald-400">
                    <FileCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold text-slate-200">Tamper-Evident Access Trails</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Immutable audit records tracking reads, writes, and delegations.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/60 border border-white/5">
                  <div className="mt-0.5 rounded p-1 bg-indigo-500/10 text-indigo-400">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold text-slate-200">Private Bucket Isolation</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Zero public buckets. Authenticated pre-signed retrieval only.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom: Architecture / Security Assurance Badge */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-400/80 border-t border-border/40 pt-4">
          <span>Snovasys TrustVault v1.0</span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Active Security Protocols
          </span>
        </div>
      </aside>

      {/* 
        ========================================================================
        RIGHT COLUMN: Authentication Form Area
        Responsive: full width on mobile, right-half on desktop.
        ========================================================================
      */}
      <main className="flex flex-col justify-center items-center p-6 sm:p-10 lg:p-12 relative">
        {/* Mobile-only header branding */}
        <div className="lg:hidden flex items-center gap-2 mb-8 self-start">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-md">
            <Shield className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">TrustVault</span>
        </div>

        <div className="w-full max-w-md mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};
