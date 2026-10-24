import * as React from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
  text?: string;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onError,
  disabled = false,
  className,
  text = "Continue with Google",
}) => {
  const [loading, setLoading] = React.useState(false);

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      const msg =
        "Supabase is not configured. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your frontend environment, and enable Google OAuth in the Supabase Dashboard.";
      onError?.(msg);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) {
        throw error;
      }
      // Note: OAuth completes via browser redirect and Supabase auth state change; do not fire onSuccess prematurely.
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to initiate Google sign-in. Check your Supabase Google OAuth provider configuration.";
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      id="google-signin-btn"
      type="button"
      variant="outline"
      className={cn(
        "w-full flex items-center justify-center gap-3 py-5 font-medium border-border/80 hover:bg-accent/60 transition-colors",
        className
      )}
      onClick={handleGoogleSignIn}
      disabled={disabled || loading}
    >
      <svg
        className="h-4 w-4 shrink-0"
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
      >
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          fill="#EA4335"
        />
      </svg>
      <span>{loading ? "Connecting to Google..." : text}</span>
    </Button>
  );
};
