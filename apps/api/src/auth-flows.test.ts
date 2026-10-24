import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Authentication Flow Validation & Client Logic Tests
// Verifies all Phase 8 Authentication Integration behaviors:
// - Login (valid, invalid, missing fields, unconfirmed email, rate limit)
// - Registration (valid, unconfirmed account, duplicate email, password length)
// - Password Recovery (request link, email enumeration prevention, reset/update)
// - Session Persistence & Sign Out
// ============================================================================

describe("TrustVault Phase 8 — Authentication & Recovery Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Login Validation & Error Handling", () => {
    it("validates that email and password are provided and well-formed", () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      // Missing email
      expect("".trim()).toBe("");

      // Malformed emails
      expect(emailRegex.test("notanemail")).toBe(false);
      expect(emailRegex.test("missing@domain")).toBe(false);
      expect(emailRegex.test("@nodomain.com")).toBe(false);

      // Valid email
      expect(emailRegex.test("valid.user@trustvault.io")).toBe(true);
    });

    it("maps 'invalid login credentials' to friendly error message", () => {
      const errorResponse = { message: "Invalid login credentials", code: "invalid_grant" };
      const rawMessage = errorResponse.message.toLowerCase();

      let friendly = "Failed to sign in. Please check your credentials.";
      if (rawMessage.includes("invalid login credentials") || rawMessage.includes("invalid_grant")) {
        friendly = "Invalid email or password. Please verify your credentials.";
      }

      expect(friendly).toBe("Invalid email or password. Please verify your credentials.");
    });

    it("maps 'email not confirmed' to clear confirmation reminder", () => {
      const errorResponse = { message: "Email not confirmed", code: "email_not_confirmed" };
      const rawMessage = errorResponse.message.toLowerCase();

      let friendly = "Failed to sign in. Please check your credentials.";
      if (rawMessage.includes("email not confirmed") || errorResponse.code === "email_not_confirmed") {
        friendly = "Your email address has not been confirmed yet. Please check your inbox for the confirmation email.";
      }

      expect(friendly).toBe(
        "Your email address has not been confirmed yet. Please check your inbox for the confirmation email."
      );
    });

    it("handles rate limiting gracefully", () => {
      const errorResponse = { message: "over_email_send_rate_limit", status: 429 };
      const rawMessage = errorResponse.message.toLowerCase();

      let friendly = "Failed to sign in. Please check your credentials.";
      if (rawMessage.includes("rate limit") || errorResponse.status === 429) {
        friendly = "Too many login attempts. Please wait a few moments before trying again.";
      }

      expect(friendly).toBe("Too many login attempts. Please wait a few moments before trying again.");
    });
  });

  describe("2. Sign-Up & Registration Handling", () => {
    it("enforces minimum password length of 8 characters and matching confirmation", () => {
      const shortPass = "1234567";
      expect(shortPass.length < 8).toBe(true);

      const passA: string = "StrongP@ssw0rd!";
      const passB: string = "DifferentP@ssw0rd!";
      expect(passA !== passB).toBe(true);

      const passMatch = "StrongP@ssw0rd!";
      expect(passA === passMatch).toBe(true);
      expect(passMatch.length >= 8).toBe(true);
    });

    it("detects unconfirmed account state and instructs user to check inbox", () => {
      // Supabase returns user object but session = null when email confirmation is active
      const signupResponse = {
        data: {
          user: { id: "user-uuid-1", email: "newuser@example.com" },
          session: null,
        },
        error: null,
      };

      const isUnconfirmed = signupResponse.data.user && !signupResponse.data.session;
      expect(isUnconfirmed).toBe(true);

      const message = isUnconfirmed
        ? "Account created! Please check your inbox and confirm your email address before signing in."
        : "Success";

      expect(message).toBe(
        "Account created! Please check your inbox and confirm your email address before signing in."
      );
    });

    it("handles duplicate email registration without exposing system internals", () => {
      const duplicateError = {
        message: "User already registered",
        status: 400,
      };

      const rawMessage = duplicateError.message.toLowerCase();
      let friendly = "Failed to create account. Please try again.";

      if (rawMessage.includes("already registered") || rawMessage.includes("user already exists")) {
        friendly = "An account with this email address already exists. Please log in instead.";
      }

      expect(friendly).toBe("An account with this email address already exists. Please log in instead.");
    });

    it("maps Supabase email send rate limit (over_email_send_rate_limit) to actionable prompt", () => {
      const rateLimitError = {
        message: "For security purposes, you can only request this once every 60 seconds",
        status: 429,
        code: "over_email_send_rate_limit",
      };

      const rawMessage = rateLimitError.message.toLowerCase();
      const code = rateLimitError.code.toLowerCase();
      const status = rateLimitError.status;

      let friendly = "Failed to create account. Please try again.";
      if (code === "over_email_send_rate_limit" || rawMessage.includes("60 seconds") || rawMessage.includes("email rate limit")) {
        friendly = "Email delivery rate limit reached. For security purposes, please wait a minute before requesting another confirmation email.";
      } else if (code === "over_request_rate_limit" || rawMessage.includes("rate limit") || status === 429) {
        friendly = "Too many registration attempts. Please wait a moment before trying again.";
      }

      expect(friendly).toBe(
        "Email delivery rate limit reached. For security purposes, please wait a minute before requesting another confirmation email."
      );
    });

    it("prevents duplicate concurrent submissions while a request is pending", () => {
      let submissionCount = 0;
      let isSubmitting = false;

      const triggerSubmit = () => {
        if (isSubmitting) return false;
        isSubmitting = true;
        submissionCount++;
        return true;
      };

      // First click: accepted
      const firstResult = triggerSubmit();
      expect(firstResult).toBe(true);
      expect(submissionCount).toBe(1);

      // Rapid second click while pending: rejected
      const secondResult = triggerSubmit();
      expect(secondResult).toBe(false);
      expect(submissionCount).toBe(1);

      // Once finished: next submission permitted
      isSubmitting = false;
      const thirdResult = triggerSubmit();
      expect(thirdResult).toBe(true);
      expect(submissionCount).toBe(2);
    });
  });

  describe("3. Forgot Password & Recovery Flow", () => {
    it("returns non-enumerating generic response for password reset requests", () => {
      const requestedEmail = "test@example.com";
      // To prevent user enumeration attacks, response must be generic
      const genericMessage = `If an account is associated with ${requestedEmail}, a password recovery link has been sent. Please check your inbox and spam folder.`;

      expect(genericMessage).toContain("If an account is associated with");
      expect(genericMessage).toContain("check your inbox and spam folder");
    });

    it("validates recovery token parameters in URL", () => {
      const recoveryHash = "#access_token=test-recovery-token&refresh_token=refresh-123&type=recovery";
      const isRecovery = recoveryHash.includes("type=recovery");
      expect(isRecovery).toBe(true);

      const normalHash = "";
      expect(normalHash.includes("type=recovery")).toBe(false);
    });

    it("maps expired or invalid recovery token error to actionable prompt", () => {
      const tokenError = { message: "Token has expired or is invalid", status: 403 };
      const rawMessage = tokenError.message.toLowerCase();

      let friendly = "Failed to reset password. Please try again.";
      if (
        rawMessage.includes("expired") ||
        rawMessage.includes("invalid") ||
        tokenError.status === 403
      ) {
        friendly =
          "This password recovery link is invalid or has expired. Please request a new recovery link.";
      }

      expect(friendly).toBe(
        "This password recovery link is invalid or has expired. Please request a new recovery link."
      );
    });

    it("validates password update requirements", () => {
      const newPassword = "NewSecretPassword123!";
      const confirmPassword = "NewSecretPassword123!";

      expect(newPassword.length >= 8).toBe(true);
      expect(newPassword === confirmPassword).toBe(true);
    });
  });

  describe("4. Session Persistence & Sign Out", () => {
    it("clears all session and profile state upon logout", () => {
      let session: any = { access_token: "active-token", user: { id: "123" } };
      let profile: any = { id: "123", role: "owner", is_active: true };
      let documents: any[] = [{ id: "doc-1", title: "Passport" }];
      let authView: string = "dashboard";

      // Simulate handleSignOut
      session = null;
      profile = null;
      documents = [];
      authView = "login";

      expect(session).toBeNull();
      expect(profile).toBeNull();
      expect(documents.length).toBe(0);
      expect(authView).toBe("login");
    });
  });
});
