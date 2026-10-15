'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Flame,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  Check,
  Shield,
  Fingerprint,
  Smartphone,
  Key,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { API_BASE_URL } from '@/config';

type AuthMode = 'login' | 'forgot' | 'reset' | 'mfa';

export default function LoginPage() {
  const router = useRouter();
  const { addToast } = useToast();

  const [mode, setMode] = useState<AuthMode>('login');

  // Login credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sessionRevokedNotice, setSessionRevokedNotice] = useState(false);
  const [revokedReason, setRevokedReason] = useState<string | null>(null);

  // Multi-Factor Authentication Second-Stage State
  const [mfaSession, setMfaSession] = useState('');
  const [mfaAllowedFactors, setMfaAllowedFactors] = useState<('totp' | 'passkey')[]>(['totp']);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaVerifying, setMfaVerifying] = useState(false);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Reset password state
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetSuccessNotice, setResetSuccessNotice] = useState<string | null>(null);

  // Check URL parameters for session revoke or reset token
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const reason = params.get('reason');
      if (reason) {
        setRevokedReason(reason);
        setSessionRevokedNotice(true);
      }
      const token = params.get('reset_token');
      if (token) {
        setResetToken(token);
        setMode('reset');
      }
    }
  }, []);

  // Centralized session completion helper - strictly prevents storing undefined tokens
  const completeSessionLogin = async (data: any, fallbackEmail: string) => {
    if (typeof window !== 'undefined') {
      if (!data.accessToken) {
        throw new Error('Authentication gateway did not provide a valid access token');
      }
      localStorage.setItem('auth_token', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('auth_refresh_token', data.refreshToken);
      }
      localStorage.setItem('auth_email', data.user?.email || fallbackEmail);
      if (data.user) {
        localStorage.setItem('auth_developer', JSON.stringify(data.user));
      }

      // Pre-fetch authoritative developer projects before transitioning
      try {
        const pRes = await fetch(`${API_BASE_URL}/api/v1/projects`, {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        });
        if (pRes.ok) {
          const pData = await pRes.json();
          if (Array.isArray(pData.projects) && pData.projects.length > 0) {
            localStorage.setItem('syntrabase_cached_projects', JSON.stringify(pData.projects));
            localStorage.setItem('syntrabase_active_project_id', pData.projects[0].id);
            if (pData.maxProjects) {
              localStorage.setItem('syntrabase_max_projects', String(pData.maxProjects));
            }
          }
        }
      } catch {
        // Non-fatal pre-fetch error
      }
    }

    addToast(`Authenticated successfully as ${data.user?.email || fallbackEmail}`, 'success');
    router.push('/');
  };

  // 1. Handle Standard Developer Sign In (Password stage)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email || !password) {
      addToast('Please enter both email and password', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/developer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorText = data.message || data.error || 'Authentication failed';
        setErrorMsg(errorText);
        addToast(errorText, 'error');
        return;
      }

      // If developer account has MFA enabled, transition to stage 2
      if (data.mfaRequired) {
        setMfaSession(data.mfaSession);
        setMfaAllowedFactors(data.allowedFactors || ['totp']);
        setMfaCode('');
        setErrorMsg(null);
        setMode('mfa');
        addToast('Multi-factor authentication required. Please enter your code.', 'info');
        return;
      }

      await completeSessionLogin(data, email);
    } catch (err: any) {
      const msg = err.message || 'Unable to reach authentication gateway';
      setErrorMsg(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 1b. Handle Developer Sign In with Passkey (WebAuthn)
  const handlePasskeyLogin = async () => {
    setErrorMsg(null);
    setPasskeyLoading(true);
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser');

      // 1. Fetch challenge/options from API
      const optRes = await fetch(`${API_BASE_URL}/api/v1/auth/developer/passkeys/authenticate/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() || undefined }),
      });
      const options = await optRes.json();
      if (!optRes.ok) {
        throw new Error(options.message || options.error || 'Failed to initialize passkey authentication');
      }

      // 2. Prompt user via browser WebAuthn prompt
      const authResponse = await startAuthentication({ optionsJSON: options });

      // 3. Verify response with server
      const verifyRes = await fetch(`${API_BASE_URL}/api/v1/auth/developer/passkeys/authenticate/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: authResponse }),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(data.message || data.error || 'Passkey verification failed');
      }

      await completeSessionLogin(data, data.user?.email || email || 'developer');
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        return; // User dismissed browser prompt
      }
      const msg = err.message || 'Passkey authentication failed';
      setErrorMsg(msg);
      addToast(msg, 'error');
    } finally {
      setPasskeyLoading(false);
    }
  };

  // 1c. Handle MFA TOTP Verification (Stage 2)
  const handleVerifyMfaTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!mfaCode.trim()) {
      addToast('Please enter your confirmation code', 'error');
      return;
    }

    setMfaVerifying(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/developer/mfa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mfaSession,
          factor: 'totp',
          code: mfaCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Verification code is invalid');
      }

      await completeSessionLogin(data, email);
    } catch (err: any) {
      const msg = err.message || 'Verification code invalid. Please try again or use a backup code.';
      setErrorMsg(msg);
      addToast(msg, 'error');
    } finally {
      setMfaVerifying(false);
    }
  };

  // 1d. Handle MFA Passkey Verification (Stage 2 alternative)
  const handleVerifyMfaPasskey = async () => {
    setErrorMsg(null);
    setPasskeyLoading(true);
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser');

      const optRes = await fetch(`${API_BASE_URL}/api/v1/auth/developer/passkeys/authenticate/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() || undefined }),
      });
      const options = await optRes.json();
      if (!optRes.ok) {
        throw new Error(options.message || options.error || 'Failed to initialize passkey challenge');
      }

      const authResponse = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch(`${API_BASE_URL}/api/v1/auth/developer/mfa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mfaSession,
          factor: 'passkey',
          passkeyResponse: authResponse,
        }),
      });

      const data = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(data.message || data.error || 'Passkey verification failed');
      }

      await completeSessionLogin(data, email);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') return;
      const msg = err.message || 'Passkey verification failed';
      setErrorMsg(msg);
      addToast(msg, 'error');
    } finally {
      setPasskeyLoading(false);
    }
  };

  // 2. Handle Forgot Password Request Dispatch
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!forgotEmail || !forgotEmail.includes('@')) {
      addToast('Please provide a valid developer email address', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/developer/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to dispatch password reset request');
      }

      setForgotSent(true);
      addToast(data.message || 'Password reset link dispatched via secure Brevo outbox', 'success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to submit password reset request');
      addToast(err.message || 'Password reset request failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle Reset Password Confirmation
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!resetToken.trim()) {
      addToast('Missing reset token. Please use the link provided in your email.', 'error');
      return;
    }

    if (newPassword.length < 10) {
      addToast('Password must be at least 10 characters long', 'error');
      return;
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      addToast('Password must include uppercase, lowercase, a number, and a special character', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      addToast('Passwords do not match', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/developer/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken.trim(),
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to reset password');
      }

      setResetSuccessNotice('Your password has been updated successfully. Please sign in with your new credentials.');
      addToast('Password updated! All previous sessions invalidated.', 'success');
      setMode('login');
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');

      // Clean URL params if any
      if (typeof window !== 'undefined' && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Password reset failed');
      addToast(err.message || 'Password reset failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Password complexity validation helpers
  const hasLength = newPassword.length >= 10;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f1115',
        backgroundImage: 'radial-gradient(circle at 50% 20%, rgba(37, 99, 235, 0.12), transparent 45%)',
        padding: '16px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '14px', margin: 'auto' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              marginBottom: '10px',
            }}
          >
            <Flame size={24} color="#3b82f6" />
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            {mode === 'mfa' ? 'Two-Factor Authentication' : 'Developer Console'}
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
            {mode === 'login' && 'Self-hosted Firestore alternative gateway authentication'}
            {mode === 'forgot' && 'Self-service account password recovery'}
            {mode === 'reset' && 'Set new password for your developer account'}
            {mode === 'mfa' && 'Enter your second factor confirmation code to complete sign-in'}
          </p>
        </div>

        {/* Authentication Card */}
        <Card style={{ backgroundColor: '#16191f', borderColor: '#262a33', boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
          <CardContent style={{ padding: '20px 20px' }}>
            {/* Session Invalidation / Expired Warning */}
            {sessionRevokedNotice && mode === 'login' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: '0.8rem',
                  lineHeight: 1.4,
                  marginBottom: '14px',
                }}
              >
                <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ display: 'block', color: '#ffffff', marginBottom: '2px' }}>
                    {revokedReason === 'password_reset' || revokedReason === 'password_changed'
                      ? 'Password Changed'
                      : 'Session Expired'}
                  </strong>
                  {revokedReason === 'password_reset' || revokedReason === 'password_changed'
                    ? 'Your developer session was invalidated because your password was reset. Please sign in with your updated credentials.'
                    : 'Your authentication session has expired or was cleared. Please sign in to continue.'}
                </div>
              </div>
            )}

            {/* Success Notification after Reset */}
            {resetSuccessNotice && mode === 'login' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: '#6ee7b7',
                  fontSize: '0.8rem',
                  lineHeight: 1.4,
                  marginBottom: '14px',
                }}
              >
                <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
                <div>{resetSuccessNotice}</div>
              </div>
            )}

            {/* General Error Alert */}
            {errorMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '0.82rem',
                  marginBottom: '14px',
                }}
              >
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VIEW 1: LOGIN */}
            {/* ------------------------------------------------------------- */}
            {mode === 'login' && (
              <>
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>
                      Developer Email
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="developer@company.com"
                        required
                        style={{ backgroundColor: '#101216', borderColor: '#2d323c', color: '#f3f4f6', paddingLeft: '36px' }}
                      />
                      <Mail size={16} color="#6b7280" style={{ position: 'absolute', left: '12px', top: '11px', pointerEvents: 'none' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db' }}>
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg(null);
                          setForgotEmail(email);
                          setForgotSent(false);
                          setMode('forgot');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#3b82f6',
                          fontSize: '0.78rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        required
                        style={{ backgroundColor: '#101216', borderColor: '#2d323c', color: '#f3f4f6', paddingLeft: '36px' }}
                      />
                      <Lock size={16} color="#6b7280" style={{ position: 'absolute', left: '12px', top: '11px', pointerEvents: 'none' }} />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={loading || passkeyLoading}
                    style={{ width: '100%', padding: '9px', fontSize: '0.88rem', marginTop: '2px' }}
                  >
                    {loading ? 'Authenticating Gateway...' : 'Sign In to Console'}
                    <ArrowRight size={16} />
                  </Button>
                </form>

                <div style={{ display: 'flex', alignItems: 'center', margin: '14px 0', gap: '10px' }}>
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#232730' }} />
                  <span style={{ fontSize: '0.72rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OR</span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#232730' }} />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePasskeyLogin}
                  disabled={loading || passkeyLoading}
                  style={{
                    width: '100%',
                    padding: '9px',
                    fontSize: '0.88rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    backgroundColor: 'rgba(59, 130, 246, 0.06)',
                    borderColor: 'rgba(59, 130, 246, 0.25)',
                    color: '#93c5fd',
                  }}
                >
                  <Fingerprint size={17} color="#60a5fa" />
                  {passkeyLoading ? 'Authenticating with Passkey...' : 'Sign In with Passkey'}
                </Button>

                <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '0.82rem', color: '#9ca3af' }}>
                  New developer?{' '}
                  <Link href="/register" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
                    Create an account
                  </Link>
                </div>
              </>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VIEW 4: TWO-FACTOR AUTHENTICATION (TOTP / PASSKEY) */}
            {/* ------------------------------------------------------------- */}
            {mode === 'mfa' && (
              <div>
                <form onSubmit={handleVerifyMfaTotp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      color: '#93c5fd',
                      fontSize: '0.82rem',
                      lineHeight: 1.45,
                    }}
                  >
                    <Smartphone size={20} color="#3b82f6" style={{ flexShrink: 0 }} />
                    <div>
                      Account protected by <strong>Multi-Factor Authentication</strong>. Enter your 6-digit authenticator code or 8-character backup code.
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>
                      Security Confirmation Code
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Input
                        type="text"
                        autoFocus
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value.replace(/\s/g, ''))}
                        placeholder="000 000"
                        maxLength={16}
                        required
                        style={{
                          backgroundColor: '#101216',
                          borderColor: '#2d323c',
                          color: '#f3f4f6',
                          paddingLeft: '38px',
                          fontFamily: 'monospace',
                          fontSize: '1.15rem',
                          letterSpacing: '0.25em',
                          textAlign: 'center',
                        }}
                      />
                      <ShieldCheck size={18} color="#3b82f6" style={{ position: 'absolute', left: '12px', top: '10px', pointerEvents: 'none' }} />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={mfaVerifying || !mfaCode.trim()}
                    style={{ width: '100%', padding: '10px', fontSize: '0.9rem', marginTop: '4px' }}
                  >
                    {mfaVerifying ? 'Verifying Code...' : 'Verify & Sign In'}
                    <ArrowRight size={16} />
                  </Button>

                  {mfaAllowedFactors.includes('passkey') && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0', gap: '10px' }}>
                        <div style={{ flex: 1, height: '1px', backgroundColor: '#232730' }} />
                        <span style={{ fontSize: '0.72rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OR</span>
                        <div style={{ flex: 1, height: '1px', backgroundColor: '#232730' }} />
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleVerifyMfaPasskey}
                        disabled={passkeyLoading || mfaVerifying}
                        style={{
                          width: '100%',
                          padding: '9px',
                          fontSize: '0.88rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          backgroundColor: 'rgba(59, 130, 246, 0.06)',
                          borderColor: 'rgba(59, 130, 246, 0.25)',
                          color: '#93c5fd',
                        }}
                      >
                        <Fingerprint size={17} color="#60a5fa" />
                        {passkeyLoading ? 'Authenticating with Passkey...' : 'Verify with Security Key / Passkey'}
                      </Button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setMfaCode('');
                      setMfaSession('');
                      setMode('login');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#9ca3af',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '4px',
                      marginTop: '6px',
                    }}
                  >
                    <ArrowLeft size={14} /> Back to Sign In
                  </button>
                </form>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VIEW 2: FORGOT PASSWORD */}
            {/* ------------------------------------------------------------- */}
            {mode === 'forgot' && (
              <div>
                {!forgotSent ? (
                  <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div style={{ fontSize: '0.84rem', color: '#9ca3af', lineHeight: 1.5 }}>
                      Enter your registered developer email address. We will dispatch a single-use password reset link via our secure email gateway.
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>
                        Developer Email
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Input
                          type="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="developer@company.com"
                          required
                          style={{ backgroundColor: '#101216', borderColor: '#2d323c', color: '#f3f4f6', paddingLeft: '36px' }}
                        />
                        <Mail size={16} color="#6b7280" style={{ position: 'absolute', left: '12px', top: '11px', pointerEvents: 'none' }} />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      variant="primary"
                      disabled={loading}
                      style={{ width: '100%', padding: '10px', fontSize: '0.9rem' }}
                    >
                      {loading ? 'Dispatching Reset Link...' : 'Send Password Reset Link'}
                      <KeyRound size={16} />
                    </Button>

                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setMode('login');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#9ca3af',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '4px',
                      }}
                    >
                      <ArrowLeft size={14} /> Back to Sign In
                    </button>
                  </form>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto',
                      }}
                    >
                      <CheckCircle2 size={24} color="#10b981" />
                    </div>

                    <div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f3f4f6', margin: '0 0 6px' }}>
                        Reset Link Dispatched
                      </h3>
                      <p style={{ fontSize: '0.84rem', color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
                        A password reset link has been dispatched to <strong style={{ color: '#ffffff' }}>{forgotEmail}</strong> via our secure Brevo outbound dispatcher with instructions to set your new password.
                      </p>
                    </div>

                    <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#101216', border: '1px solid #232730', fontSize: '0.78rem', color: '#6b7280' }}>
                      The link is single-use and will automatically expire in 30 minutes.
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => {
                        setForgotSent(false);
                        setMode('login');
                      }}
                      style={{ width: '100%' }}
                    >
                      <ArrowLeft size={14} style={{ marginRight: '6px' }} /> Return to Sign In
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* VIEW 3: RESET PASSWORD (WITH TOKEN) */}
            {/* ------------------------------------------------------------- */}
            {mode === 'reset' && (
              <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ fontSize: '0.84rem', color: '#9ca3af', lineHeight: 1.5 }}>
                  Choose a new, strong password for your Syntrabase Developer Console account.
                </div>

                {!resetToken && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>
                      Reset Security Token
                    </label>
                    <Input
                      type="text"
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Paste token from email"
                      required
                      style={{ backgroundColor: '#101216', borderColor: '#2d323c', color: '#f3f4f6', fontFamily: 'monospace' }}
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>
                    New Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      style={{ backgroundColor: '#101216', borderColor: '#2d323c', color: '#f3f4f6', paddingLeft: '36px' }}
                    />
                    <Lock size={16} color="#6b7280" style={{ position: 'absolute', left: '12px', top: '11px', pointerEvents: 'none' }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>
                    Confirm New Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      style={{ backgroundColor: '#101216', borderColor: '#2d323c', color: '#f3f4f6', paddingLeft: '36px' }}
                    />
                    <Lock size={16} color="#6b7280" style={{ position: 'absolute', left: '12px', top: '11px', pointerEvents: 'none' }} />
                  </div>
                </div>

                {/* Password Complexity Checklist */}
                <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: '#101216', border: '1px solid #232730', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontWeight: 600, color: '#9ca3af', marginBottom: '2px' }}>Password Requirements:</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasLength ? '#10b981' : '#6b7280' }}>
                    <Check size={12} color={hasLength ? '#10b981' : '#6b7280'} /> At least 10 characters
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasUpper ? '#10b981' : '#6b7280' }}>
                    <Check size={12} color={hasUpper ? '#10b981' : '#6b7280'} /> One uppercase letter (A-Z)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasLower ? '#10b981' : '#6b7280' }}>
                    <Check size={12} color={hasLower ? '#10b981' : '#6b7280'} /> One lowercase letter (a-z)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasNumber ? '#10b981' : '#6b7280' }}>
                    <Check size={12} color={hasNumber ? '#10b981' : '#6b7280'} /> One numeric digit (0-9)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasSpecial ? '#10b981' : '#6b7280' }}>
                    <Check size={12} color={hasSpecial ? '#10b981' : '#6b7280'} /> One special character (!@#$%^&*)
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading || !hasLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial || newPassword !== confirmPassword}
                  style={{ width: '100%', padding: '10px', fontSize: '0.9rem' }}
                >
                  {loading ? 'Updating Credentials...' : 'Save New Password & Sign In'}
                  <Shield size={16} />
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setMode('login');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#9ca3af',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '4px',
                  }}
                >
                  <ArrowLeft size={14} /> Cancel &amp; Back to Sign In
                </button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Security Info */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '0.75rem',
            color: '#6b7280',
          }}
        >
          <ShieldCheck size={14} color="#10b981" />
          <span>Fastify API Gateway • Argon2id • HMAC-SHA256 JWTs</span>
        </div>
      </div>
    </div>
  );
}
