import * as React from "react";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Eye, EyeOff, Mail, Lock, User, ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface SignupFormProps extends React.ComponentProps<"form"> {
  onSuccess?: () => void;
  onNavigateToLogin?: () => void;
}

export function SignupForm({
  className,
  onSuccess,
  onNavigateToLogin,
  ...props
}: SignupFormProps) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null);
  const isSubmittingRef = React.useRef(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Prevent duplicate submissions from double-clicks or repeated events
    if (loading || isSubmittingRef.current) {
      return;
    }

    setError(null);
    setInfoMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }

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

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            full_name: trimmedName,
            name: trimmedName,
          },
          emailRedirectTo: `${window.location.origin}`,
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (data.user && !data.session) {
        setInfoMessage(
          "Account created! Please check your inbox and confirm your email address before signing in."
        );
      } else {
        onSuccess?.();
      }
    } catch (err: any) {
      const rawMessage = (err?.message || "").toLowerCase();
      const code = (err?.code || "").toLowerCase();
      const status = err?.status;

      // Safe diagnostic metadata (no credentials or sensitive data logged)
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[Auth Signup] Request resulted in error:", {
          status,
          code,
        });
      }

      let friendlyMessage = "Failed to create account. Please try again.";

      if (rawMessage.includes("already registered") || rawMessage.includes("user already exists")) {
        friendlyMessage = "An account with this email address already exists. Please log in instead.";
      } else if (rawMessage.includes("password") && (rawMessage.includes("weak") || rawMessage.includes("least"))) {
        friendlyMessage = "Password is too weak. Please choose a password with at least 8 characters.";
      } else if (code === "over_email_send_rate_limit" || rawMessage.includes("60 seconds") || rawMessage.includes("email rate limit")) {
        friendlyMessage = "Email delivery rate limit reached. For security purposes, please wait a minute before requesting another confirmation email.";
      } else if (code === "over_request_rate_limit" || rawMessage.includes("rate limit") || status === 429) {
        friendlyMessage = "Too many registration attempts. Please wait a moment before trying again.";
      } else if (rawMessage.includes("network") || rawMessage.includes("failed to fetch")) {
        friendlyMessage = "Unable to connect to authentication server. Please check your network connection.";
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
    <form
      className={cn("flex flex-col gap-3 sm:gap-4.5", className)}
      onSubmit={handleSubmit}
      noValidate
      {...props}
    >
      {/* Card Title (28-30px) & Supporting Text (14.5-15px) */}
      <div className="text-center">
        <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[#101936] leading-tight">
          Create your account
        </h1>
        <p className="text-[14.5px] sm:text-[15px] text-[#6B7B9F] mt-2 leading-relaxed">
          Enter your details below to create your TrustVault account
        </p>
      </div>

      {error && (
        <div
          id="signup-error-alert"
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700 font-medium leading-relaxed"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {infoMessage && (
        <div
          id="signup-info-alert"
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-700 font-medium leading-relaxed"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <div className="flex-1">{infoMessage}</div>
        </div>
      )}

      {/* Full Name Field (14px label, 48px height, 15px text) */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-[14px] font-semibold text-[#101936]">
          Full Name
        </label>
        <div className="relative flex items-center rounded-xl border border-[#E2E0F2] bg-[#FFFFFF] focus-within:border-[#6153CC] focus-within:ring-4 focus-within:ring-[#6153CC]/15 transition-all">
          <User className="absolute left-3.5 h-[18px] w-[18px] text-[#8A93B6] pointer-events-none" />
          <input
            id="name"
            name="name"
            type="text"
            placeholder="John Doe"
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            disabled={loading}
            className="h-[48px] w-full pl-11 pr-4 text-[15px] text-[#101936] placeholder:text-[#8A93B6] bg-transparent outline-none rounded-xl"
            required
          />
        </div>
      </div>

      {/* Email Field */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[14px] font-semibold text-[#101936]">
          Work Email
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
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-[14px] font-semibold text-[#101936]">
            Password
          </label>
          <span className="text-[12px] text-[#8A93B6] font-medium">Min 8 characters</span>
        </div>
        <div className="relative flex items-center rounded-xl border border-[#E2E0F2] bg-[#FFFFFF] focus-within:border-[#6153CC] focus-within:ring-4 focus-within:ring-[#6153CC]/15 transition-all">
          <Lock className="absolute left-3.5 h-[18px] w-[18px] text-[#8A93B6] pointer-events-none" />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
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
        <label htmlFor="confirm-password" className="text-[14px] font-semibold text-[#101936]">
          Confirm Password
        </label>
        <div className="relative flex items-center rounded-xl border border-[#E2E0F2] bg-[#FFFFFF] focus-within:border-[#6153CC] focus-within:ring-4 focus-within:ring-[#6153CC]/15 transition-all">
          <ShieldCheck className="absolute left-3.5 h-[18px] w-[18px] text-[#8A93B6] pointer-events-none" />
          <input
            id="confirm-password"
            name="confirm-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter your password"
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

      {/* Primary Create Account Button */}
      <button
        id="signup-submit-btn"
        type="submit"
        className="h-[48px] w-full mt-1.5 rounded-xl font-semibold text-[20px] text-white bg-gradient-to-r from-[#7074EE] to-[#605BEB] hover:from-[#666AE8] hover:to-[#5550E0] shadow-md shadow-[#6153CC]/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        disabled={loading}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Creating Account...
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            Create Account 
          </span>
        )}
      </button>

      {/* Footer Text (14px) */}
      <div className="text-center text-[14px] text-[#6B7B9F] pt-1">
        Already have an account?{" "}
        <button
          type="button"
          id="navigate-to-login-btn"
          onClick={onNavigateToLogin}
          className="font-semibold text-[#554DE7] hover:underline transition-colors ml-0.5"
        >
          Sign in
        </button>
      </div>
    </form>
  );
}
