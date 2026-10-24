import React, { useState, useRef } from "react";
import { KeyRound, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  userEmail,
}) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isOAuthUser, setIsOAuthUser] = useState(false);

  const isSubmittingRef = useRef(false);

  React.useEffect(() => {
    if (isOpen) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        const hasEmailIdentity = user?.identities?.some((id) => id.provider === "email");
        const isEmailProvider = user?.app_metadata?.provider === "email" || hasEmailIdentity;
        if (user && !isEmailProvider && user.app_metadata?.provider) {
          setIsOAuthUser(true);
        } else {
          setIsOAuthUser(false);
        }
      }).catch(() => {
        setIsOAuthUser(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
    setIsOAuthUser(false);
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isSubmittingRef.current || loading) return;

    // 1. Validate fields
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);

    try {
      // 2. Reauthenticate using Supabase Auth to verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error("Incorrect current password. Please check and try again.");
      }

      // 3. Update password in Supabase Auth directly (no reset email flow)
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw new Error(updateError.message || "Failed to update password.");
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred. Please try again."
      );
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101936]/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#E8E6F8] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#E8E6F8]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#6153CC]/10 text-[#6153CC] flex items-center justify-center">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#101936]">Change Password</h2>
              <p className="text-xs text-[#6B7B9F]">Update your TrustVault account credentials</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-[#8A93B6] hover:text-[#101936] hover:bg-[#F6F8FD] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {isOAuthUser ? (
            <div className="py-4 space-y-4 text-center">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs text-left leading-relaxed flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-900 mb-1">Single Sign-On (OAuth) Account</p>
                  <p>
                    Your TrustVault account is authenticated via an external identity provider (such as Google). Password management is handled directly through your external provider.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-full h-10 rounded-xl bg-[#6153CC] hover:bg-[#554DE7] text-white text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          ) : success ? (
            <div className="py-6 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-[#101936]">Password Changed!</h3>
              <p className="text-xs text-[#6B7B9F]">
                Your password has been successfully updated. Closing window...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* Current Password */}
              <div>
                <label className="block text-xs font-semibold text-[#101936] mb-1.5">
                  Current Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A93B6]" />
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    disabled={loading}
                    className="w-full h-10 pl-9 pr-10 text-xs bg-[#FBFBFE] border border-[#E2E0F2] rounded-xl text-[#101936] placeholder-[#8A93B6] focus:outline-none focus:border-[#6153CC] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A93B6] hover:text-[#101936]"
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-semibold text-[#101936] mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A93B6]" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    disabled={loading}
                    className="w-full h-10 pl-9 pr-10 text-xs bg-[#FBFBFE] border border-[#E2E0F2] rounded-xl text-[#101936] placeholder-[#8A93B6] focus:outline-none focus:border-[#6153CC] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A93B6] hover:text-[#101936]"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-semibold text-[#101936] mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A93B6]" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Retype new password"
                    disabled={loading}
                    className="w-full h-10 pl-9 pr-10 text-xs bg-[#FBFBFE] border border-[#E2E0F2] rounded-xl text-[#101936] placeholder-[#8A93B6] focus:outline-none focus:border-[#6153CC] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A93B6] hover:text-[#101936]"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="h-9 px-4 rounded-xl border border-[#E2E0F2] hover:bg-[#F6F8FD] text-xs font-semibold text-[#6B7B9F] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="h-9 px-4 rounded-xl bg-[#6153CC] hover:bg-[#554DE7] text-xs font-semibold text-white shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>Update Password</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
