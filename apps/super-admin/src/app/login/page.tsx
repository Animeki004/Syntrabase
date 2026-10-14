'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, ShieldAlert, Lock, Mail, ArrowRight, ShieldCheck, Key } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { API_BASE } from '@/config';

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [email, setEmail] = useState('superadmin@syntrabase.internal');
  const [password, setPassword] = useState('SyntrabaseRoot2026!');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email || !password) {
      addToast('Super Admin credentials required', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/developer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorText = data.message || data.error || 'Authentication rejected by security gateway';
        setErrorMsg(errorText);
        addToast(errorText, 'error');
        return;
      }

      // Verify that this account is an authoritative platform Super Admin
      if (!data.user?.isPlatformAdmin) {
        const forbiddenMsg = 'FORBIDDEN: Verified Platform Super Admin authorization required';
        setErrorMsg(forbiddenMsg);
        addToast(forbiddenMsg, 'error');
        return;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('super_admin_token', data.accessToken);
        if (data.refreshToken) {
          localStorage.setItem('super_admin_refresh_token', data.refreshToken);
        }
        localStorage.setItem('super_admin_email', data.user.email);
        localStorage.setItem('super_admin_user', JSON.stringify(data.user));
      }

      addToast('Privileged root session established', 'success');
      router.push('/');
    } catch (err: any) {
      const msg = err.message || 'Unable to reach Super Admin gateway';
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
        backgroundColor: '#0a0b0e',
        backgroundImage: 'radial-gradient(circle at 50% 25%, rgba(220, 38, 38, 0.12), transparent 45%)',
        padding: '24px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '54px',
              height: '54px',
              borderRadius: '14px',
              backgroundColor: 'rgba(220, 38, 38, 0.15)',
              border: '1px solid rgba(220, 38, 38, 0.35)',
              marginBottom: '16px',
            }}
          >
            <Shield size={28} color="#dc2626" />
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Super Admin Command Center
          </h1>
          <p style={{ fontSize: '0.86rem', color: '#94a3b8', margin: 0 }}>
            Privileged fleet infrastructure &amp; zero-trust governance
          </p>
        </div>

        {/* Login Form Card */}
        <Card style={{ backgroundColor: '#13151b', borderColor: '#262933', boxShadow: '0 16px 40px rgba(0,0,0,0.6)' }}>
          <CardContent style={{ padding: '28px 24px' }}>
            {errorMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(220, 38, 38, 0.15)',
                  border: '1px solid rgba(220, 38, 38, 0.35)',
                  color: '#f87171',
                  fontSize: '0.82rem',
                  marginBottom: '16px',
                }}
              >
                <ShieldAlert size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                  Super Admin Identity
                </label>
                <div style={{ position: 'relative' }}>
                  <Input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="superadmin@syntrabase.internal"
                    required
                    style={{ backgroundColor: '#0d0f13', borderColor: '#2d313d', color: '#f8fafc', paddingLeft: '36px' }}
                  />
                  <Mail size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '11px', pointerEvents: 'none' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1' }}>
                    Master Secret / Password
                  </label>
                  <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600 }}>
                    Strict DB Validation
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    style={{ backgroundColor: '#0d0f13', borderColor: '#2d313d', color: '#f8fafc', paddingLeft: '36px' }}
                  />
                  <Key size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '11px', pointerEvents: 'none' }} />
                </div>
              </div>

              <Button
                type="submit"
                variant="destructive"
                disabled={loading}
                style={{ width: '100%', padding: '10px', fontSize: '0.9rem', marginTop: '4px' }}
              >
                {loading ? 'Verifying Platform Clearance...' : 'Authenticate Privileged Session'}
                <ArrowRight size={16} />
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Security Warning */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '0.75rem',
            color: '#64748b',
          }}
        >
          <ShieldAlert size={14} color="#dc2626" />
          <span>Restricted to Verified platform_admins Table Records</span>
        </div>
      </div>
    </div>
  );
}
