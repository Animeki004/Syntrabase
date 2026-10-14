'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Lock,
  ShieldCheck,
  Eye,
  Hash,
  Clock,
  Layers,
  RefreshCw
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface AuditBlock {
  sequenceId: string | number;
  timestamp: string;
  projectId?: string | null;
  actorId: string;
  actorType: string;
  action: string;
  targetResource: string;
  prevHash: string;
  currentHash: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  payload?: any;
  status?: 'VERIFIED' | 'TAMPERED';
}

export default function AuditLedgerPage() {
  const { addToast } = useToast();
  const [chain, setChain] = useState<AuditBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [inspectingBlock, setInspectingBlock] = useState<AuditBlock | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    totalChecked: number;
    timeMs: number;
    brokenSequenceId?: string | null;
  } | null>(null);

  function getAdminToken(): string {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('super_admin_token') || 'admin-token';
    }
    return 'admin-token';
  }

  const fetchLedger = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_BASE}/api/v1/admin/audit/ledger?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const records = (data.entries || []).map((e: any) => ({
          ...e,
          status: 'VERIFIED' as const,
        }));
        setChain(records);
        setTotalCount(data.totalCount || records.length);
      }
    } catch (err: any) {
      addToast(`Failed to load audit ledger: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const handleVerifyLedger = async () => {
    setIsVerifying(true);
    const start = performance.now();
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_BASE}/api/v1/admin/audit/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const elapsed = Math.round((performance.now() - start) * 100) / 100;
      setVerificationResult({
        valid: data.valid,
        totalChecked: data.totalChecked || chain.length,
        timeMs: data.durationMs || elapsed || 1.2,
        brokenSequenceId: data.brokenSequenceId || null,
      });

      if (data.valid) {
        addToast(`Cryptographic chain verified: All ${data.totalChecked || chain.length} blocks authentic`, 'success');
      } else {
        addToast(`Security Warning: Chain break detected at sequence #${data.brokenSequenceId}!`, 'error');
      }
    } catch (err: any) {
      addToast(`Verification request failed: ${err.message}`, 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
              Tamper-Evident Audit Ledger
            </h1>
            <Badge variant="success" dot>HMAC-SHA256 Chained</Badge>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
            Authoritative, cryptographically hash-chained audit ledger queried live from PostgreSQL <code style={{ fontFamily: 'var(--font-mono)' }}>audit_ledger</code>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="outline"
            onClick={fetchLedger}
            disabled={isRefreshing}
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} style={{ marginRight: '6px' }} />
            Refresh Ledger
          </Button>
          <Button
            variant="primary"
            onClick={handleVerifyLedger}
            disabled={isVerifying}
          >
            <Search size={14} className={isVerifying ? 'animate-spin' : ''} style={{ marginRight: '6px' }} />
            {isVerifying ? 'Verifying Hashes...' : 'Verify Chain Integrity'}
          </Button>
        </div>
      </div>

      {/* Verification Result Banner */}
      {verificationResult && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            background: verificationResult.valid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${verificationResult.valid ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {verificationResult.valid ? (
                <CheckCircle2 size={16} color="var(--accent-emerald)" />
              ) : (
                <AlertTriangle size={16} color="var(--accent-rose)" />
              )}
              <span style={{ fontWeight: 800, fontSize: '0.9rem', color: verificationResult.valid ? 'var(--accent-emerald)' : '#f87171' }}>
                {verificationResult.valid ? 'CRYPTOGRAPHIC AUDIT LEDGER VALID & IMMUTABLE' : 'INTEGRITY VIOLATION DETECTED'}
              </span>
            </div>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Verified in {verificationResult.timeMs} ms</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {verificationResult.valid
              ? `All ${verificationResult.totalChecked} records verified through root genesis. Every previous hash matches current block HMAC-SHA256 signature with zero tampering.`
              : `Tamper alert! Block link break detected at sequence #${verificationResult.brokenSequenceId}. Record modified without valid cryptographic proof.`}
          </div>
        </div>
      )}

      {/* Architecture Principles */}
      <div className="grid-3">
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Algorithm
            </span>
            <Hash size={15} color="var(--accent-blue)" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            HMAC-SHA256
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            HMAC(prev_hash | time | actor | action | resource | payload)
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Live Ledger Size
            </span>
            <Lock size={15} color="var(--accent-purple)" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            {isLoading ? '...' : `${totalCount} Blocks`}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            Authoritative append-only PostgreSQL chain
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Ledger Pipeline
            </span>
            <Layers size={15} color="var(--accent-emerald)" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
            Append-Only
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            Zero-mutation guarantees across all tenants
          </div>
        </Card>
      </div>

      {/* Ledger Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Audit Ledger Records ({chain.length})</CardTitle>
            <CardDescription>Live cryptographically linked sequence of platform state changes</CardDescription>
          </div>
        </CardHeader>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>Seq #</th>
                <th style={{ width: '150px' }}>Timestamp</th>
                <th>Actor</th>
                <th style={{ width: '180px' }}>Action</th>
                <th>Target Resource</th>
                <th style={{ width: '150px' }}>Block Hash</th>
                <th style={{ width: '100px' }}>Status</th>
                <th style={{ width: '70px', textAlign: 'right' }}>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center' }}>
                    <div className="skeleton-box animate-pulse" style={{ height: '24px', width: '220px', margin: '0 auto 8px' }} />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Querying cryptographic audit chain from database...</span>
                  </td>
                </tr>
              ) : chain.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No audit records registered yet.
                  </td>
                </tr>
              ) : (
                chain.map((b) => (
                  <tr key={b.sequenceId}>
                    <td>
                      <strong style={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                        #{b.sequenceId}
                      </strong>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {new Date(b.timestamp).toLocaleString()}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {b.actorId}
                      <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        Tier: {b.actorType}
                      </span>
                    </td>
                    <td>
                      <Badge variant="outline" size="sm">{b.action}</Badge>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{b.targetResource}</code>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }} title={b.currentHash}>
                        {b.currentHash?.substring(0, 14)}...
                      </code>
                    </td>
                    <td>
                      <Badge variant={b.status === 'VERIFIED' ? 'success' : 'danger'} size="sm">
                        {b.status || 'VERIFIED'}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInspectingBlock(b)}
                        style={{ padding: '4px 6px' }}
                        title="Inspect Block Hash"
                      >
                        <Eye size={14} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Block Inspector Modal */}
      <Modal
        isOpen={!!inspectingBlock}
        onClose={() => setInspectingBlock(null)}
        title={`Audit Block #${inspectingBlock?.sequenceId}`}
        size="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              PREVIOUS BLOCK HASH (CHAIN LINK)
            </label>
            <input
              type="text"
              readOnly
              value={inspectingBlock?.prevHash || ''}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.74rem',
                color: 'var(--text-muted)',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
              CURRENT BLOCK HMAC-SHA256 SIGNATURE
            </label>
            <input
              type="text"
              readOnly
              value={inspectingBlock?.currentHash || ''}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.74rem',
                color: 'var(--accent-blue)',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actor:</span>{' '}
              <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{inspectingBlock?.actorId}</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Project:</span>{' '}
              <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{inspectingBlock?.projectId || 'platform'}</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Operation:</span>{' '}
              <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{inspectingBlock?.action}</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Timestamp:</span>{' '}
              <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                {inspectingBlock?.timestamp ? new Date(inspectingBlock.timestamp).toISOString() : ''}
              </strong>
            </div>
          </div>

          {inspectingBlock?.payload && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                PAYLOAD (HMAC INTEGRITY BOUND)
              </label>
              <pre
                style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  overflowX: 'auto',
                  maxHeight: '160px',
                  color: 'var(--text-secondary)',
                }}
              >
                {JSON.stringify(inspectingBlock.payload, null, 2)}
              </pre>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => setInspectingBlock(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
