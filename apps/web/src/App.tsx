import { useEffect, useState, useCallback } from "react";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardLayout } from "./components/dashboard/DashboardLayout";
import { fetchProfile, type UserProfile } from "./lib/api";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authView, setAuthView] = useState<"login" | "signup" | "reset-password">("login");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Email confirmation feedback
  const [confirmationSuccess, setConfirmationSuccess] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);

  // Backend profile validation & idempotent user provisioning
  const loadProfile = useCallback(async (token: string) => {
    try {
      const user = await fetchProfile(token);
      if (!user.is_active) {
        // Deactivated account — sign out immediately
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setConfirmationError("Your account has been deactivated. Please contact an administrator.");
        return;
      }
      setProfile(user);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    // -------------------------------------------------------------------------
    // 1. Process URL Parameters (Email confirmation, recovery, PKCE, errors)
    // -------------------------------------------------------------------------
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.substring(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(window.location.search);

    // Check for error parameters returned from Supabase Auth
    const errorParam = hashParams.get("error") || searchParams.get("error");
    const errorCode = hashParams.get("error_code") || searchParams.get("error_code");
    const errorDescription =
      hashParams.get("error_description") || searchParams.get("error_description");

    if (errorParam || errorCode || errorDescription) {
      let friendlyError =
        "The confirmation link is invalid or has expired. Please sign in or request a new confirmation email.";
      if (errorCode === "otp_expired") {
        friendlyError =
          "Your email confirmation link has expired. Please sign in or request a fresh confirmation link.";
      } else if (errorDescription) {
        try {
          friendlyError = decodeURIComponent(errorDescription.replace(/\+/g, " "));
        } catch {
          friendlyError = errorDescription.replace(/\+/g, " ");
        }
      }
      setConfirmationError(friendlyError);
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      const type = hashParams.get("type") || searchParams.get("type");
      if (type === "recovery") {
        setAuthView("reset-password");
      } else if (type === "signup" || type === "email_change") {
        setConfirmationSuccess(
          "Your email address has been successfully verified! Welcome to TrustVault."
        );
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    // Check for PKCE flow authorization code (?code=...)
    const code = searchParams.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (error) {
          setConfirmationError(
            "Failed to complete email verification with the provided code. Link may be expired."
          );
        } else if (data.session) {
          setSession(data.session);
          setConfirmationSuccess(
            "Your email address has been successfully verified! Welcome to TrustVault."
          );
        }
        window.history.replaceState(null, "", window.location.pathname);
      });
    }

    // -------------------------------------------------------------------------
    // 2. Initialize and Restore Session from localStorage
    // -------------------------------------------------------------------------
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.access_token) {
        loadProfile(session.access_token);
      }
      setIsInitializing(false);
    });

    // -------------------------------------------------------------------------
    // 3. Listen to Supabase Auth State Changes
    // -------------------------------------------------------------------------
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);

      if (event === "PASSWORD_RECOVERY") {
        setAuthView("reset-password");
      } else if (event === "SIGNED_IN" && session?.access_token) {
        loadProfile(session.access_token);
      } else if (event === "SIGNED_OUT" || !session) {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore sign-out errors
    }
    setSession(null);
    setProfile(null);
    setConfirmationSuccess(null);
    setConfirmationError(null);
    setAuthView("login");
  };

  // While resolving initial stored session, render a clean subtle loader
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#FBFBFE] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-[#6153CC] to-[#7074EE] text-white flex items-center justify-center shadow-md shadow-[#6153CC]/20 animate-pulse" />
          <span className="text-xs font-semibold text-[#8A93B6] tracking-wider uppercase">
            Loading TrustVault...
          </span>
        </div>
      </div>
    );
  }

  // Password Recovery Screen
  if (authView === "reset-password") {
    return (
      <ResetPasswordPage
        onNavigateToLogin={() => setAuthView("login")}
        onSuccess={() => {
          // Do not immediately redirect: ResetPasswordForm renders a success screen with "Return to Login" button
        }}
      />
    );
  }

  // Unauthenticated: Login or Signup Screen
  if (!session) {
    if (authView === "signup") {
      return (
        <SignupPage
          onNavigateToLogin={() => setAuthView("login")}
          onSuccess={() => {
            setConfirmationSuccess(
              "Account created successfully! Please sign in."
            );
            setAuthView("login");
          }}
        />
      );
    }

    return (
      <LoginPage
        onNavigateToSignup={() => setAuthView("signup")}
        onSuccess={() => {
          setConfirmationSuccess(null);
          setConfirmationError(null);
        }}
        confirmationSuccess={confirmationSuccess}
        confirmationError={confirmationError}
      />
    );
  }

  // Authenticated State: Professional SaaS Dashboard
  return (
    <DashboardLayout
      token={session.access_token}
      profile={profile}
      onProfileUpdated={setProfile}
      onSignOut={handleSignOut}
    />
  );
}

export default App;
