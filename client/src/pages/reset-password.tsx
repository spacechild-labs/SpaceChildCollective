/**
 * Password Reset Page
 * Handles password reset flow when user clicks link from email
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Loader2, Shield, Eye, EyeOff } from "lucide-react";
import { useSpaceChildAuth } from "@/hooks/useSpaceChildAuth";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { resetPassword } = useSpaceChildAuth();
  
  const [status, setStatus] = useState<"form" | "loading" | "success" | "error">("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const tokenParam = searchParams.get("token");
    if (!tokenParam) {
      setStatus("error");
      setErrorMessage("No reset token provided");
    } else {
      setToken(tokenParam);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    setStatus("loading");

    try {
      const result = await resetPassword(token!, password);
      if (result.success) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMessage(result.error || "Password reset failed");
      }
    } catch (error: any) {
      setStatus("error");
      setErrorMessage(error.message || "An error occurred");
    }
  };

  const PasswordInput = ({ 
    id, 
    label,
    value, 
    onChange, 
    show, 
    onToggle,
    testId,
  }: { 
    id: string; 
    label: string;
    value: string; 
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    show: boolean;
    onToggle: () => void;
    testId: string;
  }) => (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-gray-300">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          placeholder="••••••••"
          value={value}
          onChange={onChange}
          className="bg-slate-800 border-white/10 text-white pr-10"
          required
          minLength={8}
          data-testid={testId}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          data-testid={`${testId}-toggle`}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-purple-900/20 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-8">
        {status === "form" && (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cyan-500/20 flex items-center justify-center">
                <Shield className="w-8 h-8 text-cyan-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Reset Your Password</h1>
              <p className="text-gray-400">Enter your new password below</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <PasswordInput
                id="new-password"
                label="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                show={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
                testId="input-new-password"
              />
              <p className="text-xs text-gray-500 -mt-2">Minimum 8 characters</p>
              
              <PasswordInput
                id="confirm-password"
                label="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                show={showConfirmPassword}
                onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
                testId="input-confirm-password"
              />

              {errorMessage && (
                <p className="text-red-400 text-sm" data-testid="text-error">{errorMessage}</p>
              )}

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600"
                data-testid="button-reset-password"
              >
                Reset Password
              </Button>
            </form>
          </>
        )}

        {status === "loading" && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Resetting password...</h1>
            <p className="text-gray-400">Please wait</p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Password Reset!</h1>
            <p className="text-gray-400 mb-6">
              Your password has been successfully changed.
            </p>
            <Button
              onClick={() => navigate("/")}
              className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600"
              data-testid="button-continue"
            >
              Continue to App
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Reset Failed</h1>
            <p className="text-gray-400 mb-6">{errorMessage}</p>
            <Button
              onClick={() => navigate("/")}
              className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600"
              data-testid="button-go-home"
            >
              Go to Home
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
