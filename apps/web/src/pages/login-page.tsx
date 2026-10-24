import { LoginForm } from "@/components/login-form";
import { TrustVaultBrandHeader } from "@/components/auth/TrustVaultBrandHeader";
import { AuthBackgroundDecorations } from "@/components/auth/AuthBackgroundDecorations";
import { isSupabaseConfigured, missingSupabaseConfig } from "@/lib/supabase";

interface LoginPageProps {
  onSuccess?: () => void;
  onNavigateToSignup?: () => void;
  confirmationSuccess?: string | null;
  confirmationError?: string | null;
}

export default function LoginPage({
  onSuccess,
  onNavigateToSignup,
  confirmationSuccess,
  confirmationError,
}: LoginPageProps) {
  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 overflow-x-hidden">
      {/* Subtle Reference-Matched Decorative Background */}
      <AuthBackgroundDecorations />

      {/* Main Centered Content */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-[480px] my-auto py-3 sm:py-5">
        {/* Centered TrustVault Branding & Tagline */}
        <div className="mb-5 sm:mb-6">
          <TrustVaultBrandHeader />
        </div>

        {/* White Authentication Card with Subtle Lavender Border & Soft Shadow */}
        <div className="w-full bg-[#FFFFFF] rounded-[24px] border border-[#E8E6F8] shadow-[0_12px_45px_-10px_rgba(97,83,204,0.09),0_4px_20px_-2px_rgba(16,25,54,0.03)] p-8 sm:p-11 transition-all">
          {confirmationSuccess && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-xs text-emerald-800 leading-relaxed font-semibold flex items-center gap-2"
            >
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span>{confirmationSuccess}</span>
            </div>
          )}

          {confirmationError && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs text-rose-800 leading-relaxed font-semibold flex items-center gap-2"
            >
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500 shrink-0" />
              <span>{confirmationError}</span>
            </div>
          )}

          {!isSupabaseConfigured && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-800 leading-relaxed font-medium"
            >
              <strong>Configuration Notice:</strong> Frontend Supabase environment configuration is missing:{" "}
              {missingSupabaseConfig.map((item, idx) => (
                <span key={item}>
                  {idx > 0 ? " and " : ""}
                  <code className="font-mono text-amber-900 font-semibold">{item}</code>
                </span>
              ))}.
            </div>
          )}

          <LoginForm
            onSuccess={onSuccess}
            onNavigateToSignup={onNavigateToSignup}
          />
        </div>
      </div>
    </div>
  );
}

export { LoginPage };
