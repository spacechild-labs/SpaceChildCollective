/**
 * Space Child Auth Modal
 * Portable authentication modal for the Space Child ecosystem
 * Supports login, registration, email verification, and password reset
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Loader2, Eye, EyeOff, Mail, CheckCircle, ExternalLink } from "lucide-react";
import type { LoginParams, RegisterParams, AuthResult } from "@/lib/space-child-auth";

interface SpaceChildAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: (params: LoginParams) => Promise<AuthResult>;
  onRegister: (params: RegisterParams) => Promise<AuthResult>;
  onForgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  onResendVerification: (email: string) => Promise<{ success: boolean; error?: string }>;
  onLoginWithSSO?: () => void;
  isLoading?: boolean;
  logoSrc?: string;
  appName?: string;
}

type ModalView = "auth" | "verification-pending" | "forgot-password" | "forgot-sent";

const PasswordInput = ({ 
  id, 
  value, 
  onChange, 
  show, 
  onToggle,
  placeholder = "••••••••",
  testId,
}: { 
  id: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  show: boolean;
  onToggle: () => void;
  placeholder?: string;
  testId: string;
}) => (
  <div className="relative">
    <Input
      id={id}
      type={show ? "text" : "password"}
      placeholder={placeholder}
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
);

export function SpaceChildAuthModal({ 
  open, 
  onOpenChange, 
  onLogin,
  onRegister,
  onForgotPassword,
  onResendVerification,
  onLoginWithSSO,
  isLoading: externalLoading,
  logoSrc,
  appName = "Space Child",
}: SpaceChildAuthModalProps) {
  const [view, setView] = useState<ModalView>("auth");
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    
    try {
      const result = await onLogin({ email, password });
      if (result.success) {
        onOpenChange(false);
        resetForm();
      } else if (result.requiresVerification) {
        setPendingEmail(email);
        setView("verification-pending");
      } else {
        setError(result.error || "Login failed");
      }
    } catch (err: any) {
      if (err.requiresVerification) {
        setPendingEmail(email);
        setView("verification-pending");
      } else {
        setError(err.message || "Login failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const result = await onRegister({ email, password, firstName, lastName });
      if (result.success) {
        if (result.requiresVerification) {
          setPendingEmail(email);
          setView("verification-pending");
        } else {
          onOpenChange(false);
          resetForm();
        }
      } else {
        setError(result.error || "Registration failed");
      }
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    setIsResending(true);
    setError(null);
    try {
      const result = await onResendVerification(pendingEmail);
      if (!result.success) {
        setError(result.error || "Failed to resend");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsResending(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSendingReset(true);
    try {
      const result = await onForgotPassword(email);
      if (result.success) {
        setView("forgot-sent");
      } else {
        setError(result.error || "Failed to send reset email");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSendingReset(false);
    }
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFirstName("");
    setLastName("");
    setError(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setView("auth");
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  const isLoading = isSubmitting || externalLoading;

  // Verification pending view
  if (view === "verification-pending") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[425px] bg-slate-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Mail className="w-5 h-5 text-cyan-400" />
              Verify Your Email
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              We've sent a verification link to your email
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <Mail className="w-8 h-8 text-cyan-400" />
            </div>
            <p className="text-white mb-2">Check your inbox</p>
            <p className="text-gray-400 text-sm mb-4">
              We sent a verification link to<br />
              <span className="text-cyan-400">{pendingEmail}</span>
            </p>
            <p className="text-gray-500 text-xs mb-6">
              Click the link in the email to verify your account.
            </p>
            
            {error && (
              <p className="text-red-400 text-sm mb-4" data-testid="text-auth-error">{error}</p>
            )}
            
            <Button
              variant="outline"
              onClick={handleResendVerification}
              disabled={isResending}
              className="border-white/10 text-gray-300 hover:bg-slate-800"
              data-testid="button-resend-verification"
            >
              {isResending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Resend verification email
            </Button>
          </div>
          
          <div className="border-t border-white/10 pt-4">
            <Button
              variant="ghost"
              onClick={() => { resetForm(); setView("auth"); }}
              className="w-full text-gray-400 hover:text-white"
              data-testid="button-back-to-login"
            >
              Back to login
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Forgot password view
  if (view === "forgot-password") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[425px] bg-slate-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              {logoSrc ? (
                <img src={logoSrc} alt={appName} className="w-6 h-6 rounded mix-blend-screen" />
              ) : (
                <Sparkles className="w-5 h-5 text-cyan-400" />
              )}
              Reset Password
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Enter your email to receive a password reset link
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleForgotPassword} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email" className="text-gray-300">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-800 border-white/10 text-white"
                required
                data-testid="input-forgot-email"
              />
            </div>
            
            {error && (
              <p className="text-red-400 text-sm" data-testid="text-auth-error">{error}</p>
            )}
            
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600"
              disabled={isSendingReset}
              data-testid="button-send-reset"
            >
              {isSendingReset ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Send Reset Link
            </Button>
          </form>
          
          <div className="border-t border-white/10 pt-4">
            <Button
              variant="ghost"
              onClick={() => { setError(null); setView("auth"); }}
              className="w-full text-gray-400 hover:text-white"
              data-testid="button-back-to-login"
            >
              Back to login
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Reset email sent view
  if (view === "forgot-sent") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[425px] bg-slate-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <CheckCircle className="w-5 h-5 text-green-400" />
              Check Your Email
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <Mail className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-white mb-2">Reset link sent!</p>
            <p className="text-gray-400 text-sm mb-4">
              If an account exists with <span className="text-cyan-400">{email}</span>,<br />
              you'll receive a password reset link shortly.
            </p>
            <p className="text-gray-500 text-xs">
              The link will expire in 15 minutes for security.
            </p>
          </div>
          
          <div className="border-t border-white/10 pt-4">
            <Button
              variant="ghost"
              onClick={() => { resetForm(); }}
              className="w-full text-gray-400 hover:text-white"
              data-testid="button-back-to-login"
            >
              Back to login
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Main auth view
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-slate-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {logoSrc ? (
              <img src={logoSrc} alt={appName} className="w-6 h-6 rounded mix-blend-screen" />
            ) : (
              <Sparkles className="w-5 h-5 text-cyan-400" />
            )}
            {appName} Auth
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Secure authentication powered by Space Child
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as "login" | "register"); setError(null); }}>
          <TabsList className="grid w-full grid-cols-2 bg-slate-800">
            <TabsTrigger value="login" className="data-[state=active]:bg-cyan-500/20" data-testid="tab-login">
              Sign In
            </TabsTrigger>
            <TabsTrigger value="register" className="data-[state=active]:bg-cyan-500/20" data-testid="tab-register">
              Create Account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4 mt-4">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-gray-300">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-slate-800 border-white/10 text-white"
                  required
                  data-testid="input-login-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-gray-300">Password</Label>
                <PasswordInput
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  show={showPassword}
                  onToggle={() => setShowPassword(!showPassword)}
                  testId="input-login-password"
                />
              </div>
              
              <button
                type="button"
                onClick={() => { setError(null); setView("forgot-password"); }}
                className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                data-testid="link-forgot-password"
              >
                Forgot password?
              </button>
              
              {error && (
                <p className="text-red-400 text-sm" data-testid="text-auth-error">{error}</p>
              )}
              
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600"
                disabled={isLoading}
                data-testid="button-login-submit"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Sign In
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register" className="space-y-4 mt-4">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="register-firstName" className="text-gray-300">First Name</Label>
                  <Input
                    id="register-firstName"
                    type="text"
                    placeholder="First"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="bg-slate-800 border-white/10 text-white"
                    data-testid="input-register-firstName"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-lastName" className="text-gray-300">Last Name</Label>
                  <Input
                    id="register-lastName"
                    type="text"
                    placeholder="Last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="bg-slate-800 border-white/10 text-white"
                    data-testid="input-register-lastName"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-email" className="text-gray-300">Email</Label>
                <Input
                  id="register-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-slate-800 border-white/10 text-white"
                  required
                  data-testid="input-register-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password" className="text-gray-300">Password</Label>
                <PasswordInput
                  id="register-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  show={showPassword}
                  onToggle={() => setShowPassword(!showPassword)}
                  testId="input-register-password"
                />
                <p className="text-xs text-gray-500">Minimum 8 characters</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-confirmPassword" className="text-gray-300">Confirm Password</Label>
                <PasswordInput
                  id="register-confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  show={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
                  testId="input-register-confirmPassword"
                />
              </div>
              {error && (
                <p className="text-red-400 text-sm" data-testid="text-auth-error">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600"
                disabled={isLoading}
                data-testid="button-register-submit"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : logoSrc ? (
                  <img src={logoSrc} alt="" className="w-4 h-4 rounded mr-2 mix-blend-screen" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Create Account
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {onLoginWithSSO && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <Button
              variant="outline"
              onClick={onLoginWithSSO}
              className="w-full border-white/10 text-gray-300 hover:bg-slate-800"
              data-testid="button-sso-login"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Sign in with Space Child Hub
            </Button>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-xs text-gray-500 text-center">
            By signing up, you agree to our Terms of Service and Privacy Policy.
            <br />
            <span className="text-cyan-400">Powered by Space Child Auth</span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
