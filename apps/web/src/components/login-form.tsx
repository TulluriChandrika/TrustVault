import * as React from "react";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface LoginFormProps extends React.ComponentProps<"form"> {
  onSuccess?: () => void;
  onNavigateToSignup?: () => void;
}

export function LoginForm({
  className,
  onSuccess,
  onNavigateToSignup,
  ...props
}: LoginFormProps) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null);
  const isSubmittingRef = React.useRef(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading || isSubmittingRef.current) {
      return;
    }

    setError(null);
    setInfoMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    if (!isSupabaseConfigured) {
      setError("Supabase authentication is not configured in the current environment.");
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      onSuccess?.();
    } catch (err: any) {
      const rawMessage = (err?.message || "").toLowerCase();
      const code = err?.code || "";

      let friendlyMessage = "Failed to sign in. Please check your credentials.";
      if (rawMessage.includes("email not confirmed") || code === "email_not_confirmed") {
        friendlyMessage = "Your email address has not been confirmed yet. Please check your inbox for the confirmation email.";
      } else if (rawMessage.includes("invalid login credentials") || rawMessage.includes("invalid_grant")) {
        friendlyMessage = "Invalid email or password. Please verify your credentials.";
      } else if (rawMessage.includes("rate limit") || err?.status === 429) {
        friendlyMessage = "Too many login attempts. Please wait a few moments before trying again.";
      } else if (rawMessage.includes("network") || rawMessage.includes("failed to fetch")) {
        friendlyMessage = "Unable to connect to the authentication server. Please check your network connection.";
      } else if (err instanceof Error) {
        friendlyMessage = err.message;
      }

      setError(friendlyMessage);
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <form
        className={cn("flex flex-col gap-5 sm:gap-5.5", className)}
        onSubmit={handleSubmit}
        noValidate
        {...props}
      >
        {/* Card Title (28-31px) & Supporting Text (14.5-15px) */}
        <div className="text-center">
          <h1 className="text-[28px] sm:text-[31px] font-bold tracking-tight text-[#101936] leading-tight">
            Login to your account
          </h1>
          <p className="text-[14.5px] sm:text-[15px] text-[#6B7B9F] mt-2 leading-relaxed">
            Enter your email below to login to your TrustVault account
          </p>
        </div>

        {error && (
          <div
            id="login-error-alert"
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700 font-medium leading-relaxed"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {infoMessage && (
          <div
            id="login-info-alert"
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-700 font-medium leading-relaxed"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <div className="flex-1">{infoMessage}</div>
          </div>
        )}

        {/* Email Field (14px label, 48px height, 15px text) */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[14px] font-semibold text-[#101936]">
            Email
          </label>
          <div className="relative flex items-center rounded-xl border border-[#E2E0F2] bg-[#FFFFFF] focus-within:border-[#6153CC] focus-within:ring-4 focus-within:ring-[#6153CC]/15 transition-all">
            <Mail className="absolute left-3.5 h-[18px] w-[18px] text-[#8A93B6] pointer-events-none" />
            <input
              id="email"
              name="email"
              type="email"
              placeholder="m@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              disabled={loading}
              className="h-[48px] w-full pl-11 pr-4 text-[15px] text-[#101936] placeholder:text-[#8A93B6] bg-transparent outline-none rounded-xl"
              required
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-[14px] font-semibold text-[#101936]">
            Password
          </label>
          <div className="relative flex items-center rounded-xl border border-[#E2E0F2] bg-[#FFFFFF] focus-within:border-[#6153CC] focus-within:ring-4 focus-within:ring-[#6153CC]/15 transition-all">
            <Lock className="absolute left-3.5 h-[18px] w-[18px] text-[#8A93B6] pointer-events-none" />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
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
              className="absolute right-3.5 text-[#8A93B6] hover:text-[#6153CC] transition-colors p-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6153CC]/30"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>

        {/* Primary Login Button (48px height, 15.5px font) */}
        <button
          id="login-submit-btn"
          type="submit"
          className="h-[48px] w-full mt-1.5 rounded-xl font-semibold text-[20px] text-white bg-gradient-to-r from-[#7074EE] to-[#605BEB] hover:from-[#666AE8] hover:to-[#5550E0] shadow-md shadow-[#6153CC]/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Logging in...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              Login 
            </span>
          )}
        </button>

        {/* Footer Text (14px) */}
        <div className="text-center text-[14px] text-[#6B7B9F] pt-1">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            id="navigate-to-signup-btn"
            onClick={onNavigateToSignup}
            className="font-semibold text-[#554DE7] hover:underline transition-colors ml-0.5"
          >
            Sign up
          </button>
        </div>
      </form>
    </div>
  );
}
