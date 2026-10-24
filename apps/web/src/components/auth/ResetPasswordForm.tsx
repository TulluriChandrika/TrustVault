import * as React from "react";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Eye, EyeOff, Lock, ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface ResetPasswordFormProps extends React.ComponentProps<"form"> {
  onSuccess?: () => void;
  onNavigateToLogin?: () => void;
}

export function ResetPasswordForm({
  className,
  onSuccess,
  onNavigateToLogin,
  ...props
}: ResetPasswordFormProps) {
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSuccess, setIsSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please verify.");
      return;
    }

    if (!isSupabaseConfigured) {
      setError("Supabase authentication is not configured in the current environment.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      setIsSuccess(true);
      // Clean up URL recovery fragment if present
      if (window.location.hash.includes("type=recovery")) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      onSuccess?.();
    } catch (err: any) {
      const rawMessage = (err?.message || "").toLowerCase();
      let friendlyMessage = "Failed to reset password. Please try again.";

      if (
        rawMessage.includes("expired") ||
        rawMessage.includes("invalid") ||
        rawMessage.includes("token") ||
        err?.status === 401 ||
        err?.status === 403
      ) {
        friendlyMessage =
          "This password recovery link is invalid or has expired. Please request a new recovery link.";
      } else if (rawMessage.includes("password") && rawMessage.includes("same")) {
        friendlyMessage = "New password must be different from your previous password.";
      } else if (rawMessage.includes("network") || rawMessage.includes("failed to fetch")) {
        friendlyMessage = "Unable to connect to authentication server. Please check your network connection.";
      } else if (err instanceof Error) {
        friendlyMessage = err.message;
      }

      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToLogin = async () => {
    // Sign out to clear any transient recovery session so user can log in with their fresh credentials
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Ignore sign-out errors
    }
    if (window.location.hash.includes("type=recovery")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    onNavigateToLogin?.();
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col gap-6 text-center py-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-[28px] sm:text-[31px] font-bold tracking-tight text-[#101936] leading-tight">
            Password Updated
          </h1>
          <p className="text-[14.5px] sm:text-[15px] text-[#6B7B9F] mt-2 leading-relaxed">
            Your TrustVault account password has been successfully reset. You can now log in using your new credentials.
          </p>
        </div>

        <button
          type="button"
          onClick={handleReturnToLogin}
          className="h-[48px] w-full rounded-xl font-semibold text-[17px] text-white bg-gradient-to-r from-[#7074EE] to-[#605BEB] hover:from-[#666AE8] hover:to-[#5550E0] shadow-md shadow-[#6153CC]/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <form
      className={cn("flex flex-col gap-5 sm:gap-5.5", className)}
      onSubmit={handleSubmit}
      noValidate
      {...props}
    >
      <div className="text-center">
        <h1 className="text-[28px] sm:text-[31px] font-bold tracking-tight text-[#101936] leading-tight">
          Set new password
        </h1>
        <p className="text-[14.5px] sm:text-[15px] text-[#6B7B9F] mt-2 leading-relaxed">
          Please enter and confirm your new password below
        </p>
      </div>

      {error && (
        <div
          id="reset-password-error-alert"
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700 font-medium leading-relaxed"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* New Password Field */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="new-password" className="text-[14px] font-semibold text-[#101936]">
            New Password
          </label>
          <span className="text-[12px] text-[#8A93B6] font-medium">Min 8 characters</span>
        </div>
        <div className="relative flex items-center rounded-xl border border-[#E2E0F2] bg-[#FFFFFF] focus-within:border-[#6153CC] focus-within:ring-4 focus-within:ring-[#6153CC]/15 transition-all">
          <Lock className="absolute left-3.5 h-[18px] w-[18px] text-[#8A93B6] pointer-events-none" />
          <input
            id="new-password"
            name="new-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Enter your new password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            disabled={loading}
            className="h-[48px] w-full pl-11 pr-11 text-[15px] text-[#101936] placeholder:text-[#8A93B6] bg-transparent outline-none rounded-xl"
            required
          />
          <button
            type="button"
            className="absolute right-3.5 text-[#8A93B6] hover:text-[#6153CC] transition-colors p-1"
            onClick={() => setShowPassword((prev) => !prev)}
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>

      {/* Confirm Password Field */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-new-password" className="text-[14px] font-semibold text-[#101936]">
          Confirm New Password
        </label>
        <div className="relative flex items-center rounded-xl border border-[#E2E0F2] bg-[#FFFFFF] focus-within:border-[#6153CC] focus-within:ring-4 focus-within:ring-[#6153CC]/15 transition-all">
          <ShieldCheck className="absolute left-3.5 h-[18px] w-[18px] text-[#8A93B6] pointer-events-none" />
          <input
            id="confirm-new-password"
            name="confirm-new-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter your new password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (error) setError(null);
            }}
            disabled={loading}
            className="h-[48px] w-full pl-11 pr-11 text-[15px] text-[#101936] placeholder:text-[#8A93B6] bg-transparent outline-none rounded-xl"
            required
          />
        </div>
      </div>

      {/* Submit Button */}
      <button
        id="reset-password-submit-btn"
        type="submit"
        className="h-[48px] w-full mt-1.5 rounded-xl font-semibold text-[20px] text-white bg-gradient-to-r from-[#7074EE] to-[#605BEB] hover:from-[#666AE8] hover:to-[#5550E0] shadow-md shadow-[#6153CC]/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        disabled={loading}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Updating Password...
          </span>
        ) : (
          "Update Password"
        )}
      </button>

      {/* Return to Login */}
      <div className="text-center text-[14px] text-[#6B7B9F] pt-1">
        <button
          type="button"
          onClick={handleReturnToLogin}
          className="font-semibold text-[#554DE7] hover:underline transition-colors"
        >
          &larr; Back to Login
        </button>
      </div>
    </form>
  );
}
