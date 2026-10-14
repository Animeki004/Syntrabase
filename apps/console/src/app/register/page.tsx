'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Flame,
  Lock,
  Mail,
  User,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { API_BASE_URL } from '@/config';

export default function RegisterPage() {
  const router = useRouter();
  const { addToast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live password validation
  const hasMinLength = password.length >= 10;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isFormValid =
    hasMinLength &&
    hasUppercase &&
    hasLowercase &&
    hasNumber &&
    hasSpecial &&
    passwordsMatch &&
    email.includes('@');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isFormValid) {
      if (!passwordsMatch) {
        setErrorMsg('Passwords do not match');
      } else {
        setErrorMsg('Please satisfy all password complexity requirements');
      }
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/developer/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          displayName: displayName.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorText = data.message || data.error || 'Registration failed';
        setErrorMsg(errorText);
        addToast(errorText, 'error');
        return;
      }

      // Account created successfully. Redirect to login so the developer can sign in cleanly.
      addToast(`Developer account registered! Please sign in with your credentials.`, 'success');
      router.push('/login');
    } catch (err: any) {
      const msg = err.message || 'Network error connecting to API gateway';
      setErrorMsg(msg);
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f1115',
        backgroundImage: 'radial-gradient(circle at 50% 15%, rgba(37, 99, 235, 0.15), transparent 50%)',
        padding: '32px 16px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '460px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              backgroundColor: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              marginBottom: '16px',
            }}
          >
            <Flame size={28} color="#3b82f6" />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Create Developer Account
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#9ca3af', margin: 0 }}>
            Provision your private Syntrabase developer workspace &amp; API credentials
          </p>
        </div>

        {/* Register Card */}
        <Card style={{ backgroundColor: '#16191f', borderColor: '#262a33', boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
          <CardContent style={{ padding: '28px 24px' }}>
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
                  marginBottom: '16px',
                }}
              >
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>
                  Display Name
                </label>
                <div style={{ position: 'relative' }}>
                  <Input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Rivera"
                    style={{ backgroundColor: '#101216', borderColor: '#2d323c', color: '#f3f4f6', paddingLeft: '36px' }}
                  />
                  <User size={16} color="#6b7280" style={{ position: 'absolute', left: '12px', top: '11px', pointerEvents: 'none' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>
                  Developer Email <span style={{ color: '#ef4444' }}>*</span>
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
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>
                  Password <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 10 chars, uppercase, lowercase, special"
                    required
                    style={{ backgroundColor: '#101216', borderColor: '#2d323c', color: '#f3f4f6', paddingLeft: '36px' }}
                  />
                  <Lock size={16} color="#6b7280" style={{ position: 'absolute', left: '12px', top: '11px', pointerEvents: 'none' }} />
                </div>

                {/* Password Criteria Checklist */}
                <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.72rem' }}>
                  <span style={{ color: hasMinLength ? '#10b981' : '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {hasMinLength ? <CheckCircle2 size={12} /> : <XCircle size={12} />} 10+ characters
                  </span>
                  <span style={{ color: hasUppercase ? '#10b981' : '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {hasUppercase ? <CheckCircle2 size={12} /> : <XCircle size={12} />} 1+ uppercase letter
                  </span>
                  <span style={{ color: hasLowercase ? '#10b981' : '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {hasLowercase ? <CheckCircle2 size={12} /> : <XCircle size={12} />} 1+ lowercase letter
                  </span>
                  <span style={{ color: hasNumber ? '#10b981' : '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {hasNumber ? <CheckCircle2 size={12} /> : <XCircle size={12} />} 1+ number
                  </span>
                  <span style={{ color: hasSpecial ? '#10b981' : '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', gridColumn: 'span 2' }}>
                    {hasSpecial ? <CheckCircle2 size={12} /> : <XCircle size={12} />} 1+ special character (!@#$%^&amp;*)
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db', marginBottom: '6px' }}>
                  Confirm Password <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    required
                    style={{ backgroundColor: '#101216', borderColor: '#2d323c', color: '#f3f4f6', paddingLeft: '36px' }}
                  />
                  <Lock size={16} color="#6b7280" style={{ position: 'absolute', left: '12px', top: '11px', pointerEvents: 'none' }} />
                </div>
                {confirmPassword && (
                  <span style={{ fontSize: '0.72rem', marginTop: '4px', display: 'block', color: passwordsMatch ? '#10b981' : '#f87171' }}>
                    {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                  </span>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={loading || !isFormValid}
                style={{ width: '100%', padding: '10px', fontSize: '0.9rem', marginTop: '8px' }}
              >
                {loading ? 'Provisioning Workspace...' : 'Create Account & Launch'}
                <ArrowRight size={16} />
              </Button>
            </form>

            <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.82rem', color: '#9ca3af' }}>
              Already registered?{' '}
              <Link href="/login" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
                Sign in to Console
              </Link>
            </div>
          </CardContent>
        </Card>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#6b7280', fontSize: '0.75rem' }}>
          <ShieldCheck size={14} color="#10b981" />
          <span>Zero-trust isolated PostgreSQL tenant with Argon2id/scrypt key derivation</span>
        </div>
      </div>
    </div>
  );
}
