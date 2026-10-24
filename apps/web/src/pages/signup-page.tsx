import { SignupForm } from "@/components/signup-form";
import { TrustVaultBrandHeader } from "@/components/auth/TrustVaultBrandHeader";
import { AuthBackgroundDecorations } from "@/components/auth/AuthBackgroundDecorations";
import { isSupabaseConfigured, missingSupabaseConfig } from "@/lib/supabase";

interface SignupPageProps {
  onSuccess?: () => void;
  onNavigateToLogin?: () => void;
}

export default function SignupPage({
  onSuccess,
  onNavigateToLogin,
}: SignupPageProps) {
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
        <div className="w-full bg-[#FFFFFF] rounded-[24px] border border-[#E8E6F8] shadow-[0_12px_45px_-10px_rgba(97,83,204,0.09),0_4px_20px_-2px_rgba(16,25,54,0.03)] pt-4 px-8 pb-8 sm:pt-5 sm:px-11 sm:pb-11 transition-all">
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

          <SignupForm
            onSuccess={onSuccess}
            onNavigateToLogin={onNavigateToLogin}
          />
        </div>
      </div>
    </div>
  );
}

export { SignupPage };
