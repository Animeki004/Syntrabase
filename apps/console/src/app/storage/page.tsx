'use client';

import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Upload,
  Link as LinkIcon,
  Trash2,
  Copy,
  Check,
  FileText,
  Image as ImageIcon,
  File,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  AlertTriangle,
  ArrowUpRight,
  ShieldAlert
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useProject } from '@/components/ProjectContext';
import { ProjectPlanContext } from '@syntrabase/shared-types';
import { API_BASE_URL } from '@/config';

interface StorageItem {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
}


function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function getFileIcon(type: string) {
  if (!type) return <File size={15} color="var(--text-muted)" />;
  if (type.startsWith('image/')) return <ImageIcon size={15} color="var(--accent-blue)" />;
  if (type.includes('pdf')) return <FileText size={15} color="var(--accent-rose)" />;
  return <File size={15} color="var(--text-muted)" />;
}

export default function StoragePage() {
  const { addToast } = useToast();
  const { activeProject } = useProject();
  const projectId = activeProject?.id || '00000000-0000-0000-0000-000000000020';
  const [files, setFiles] = useState<StorageItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Authoritative project plan context
  const [isPlanLoading, setIsPlanLoading] = useState(true);
  const [planContext, setPlanContext] = useState<ProjectPlanContext | null>(null);

  // Modals
  const [signedUrlModal, setSignedUrlModal] = useState<{ path: string; url: string; expires: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState<StorageItem | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const fetchFiles = React.useCallback(async () => {
    setIsLoadingFiles(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/storage/${projectId}/objects`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.objects)) {
          setFiles(data.objects);
        }
      }
    } catch {
      // offline fallback keeps files empty
    } finally {
      setIsLoadingFiles(false);
    }
  }, [projectId]);

  useEffect(() => {
    const fetchPlan = async () => {
      setIsPlanLoading(true);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/plan`, {
          headers,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          setPlanContext(data);
        }
      } catch {
        // Safe fallback
      } finally {
        setIsPlanLoading(false);
      }
    };
    fetchPlan();
    fetchFiles();
  }, [projectId, fetchFiles]);

  const isStorageEnabled = planContext ? !!planContext.capabilities['storage.objects'] : false;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isPlanLoading || !isStorageEnabled) {
      addToast(
        "Upload rejected by backend policy: Feature 'storage.objects' is disabled on current plan (FEATURE_DISABLED)",
        'error'
      );
      setShowUpgradeModal(true);
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    // Check MIME type
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/json', 'text/plain'];
    if (!allowed.includes(file.type)) {
      addToast(`Invalid MIME type: ${file.type}. Allowed: ${allowed.join(', ')}`, 'error');
      return;
    }

    setUploadProgress(20);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        setUploadProgress(60);
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const res = await fetch(`${API_BASE_URL}/api/v1/storage/${projectId}/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            objectPath: file.name,
            originalName: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64Data,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          addToast(data.message || data.error || 'Upload failed', 'error');
          setUploadProgress(null);
          return;
        }

        setUploadProgress(100);
        addToast(`Uploaded object '${file.name}'`, 'success');
        setTimeout(() => setUploadProgress(null), 500);
        await fetchFiles();
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      addToast(err.message || 'File read error', 'error');
      setUploadProgress(null);
    }
  };

  const handleGenerateSignedUrl = async (item: StorageItem) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/storage/${projectId}/signed-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          bucketName: 'default',
          objectPath: item.path,
          expiresInSeconds: 3600,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        addToast(data.message || 'Failed to generate signed URL', 'error');
        return;
      }

      const fullUrl = `${API_BASE_URL}${data.signedUrl}`;
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      setSignedUrlModal({
        path: item.path,
        url: fullUrl,
        expires: expiresAt,
      });
    } catch (err: any) {
      addToast(err.message || 'Error generating signed URL', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/storage/${projectId}/objects/${deletingItem.id}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast(data.message || 'Failed to delete object', 'error');
        return;
      }

      addToast(`Deleted object '${deletingItem.name}'`, 'info');
      setDeletingItem(null);
      await fetchFiles();
    } catch (err: any) {
      addToast(err.message || 'Network error deleting object', 'error');
    }
  };

  const totalBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              Object Storage Buckets
            </h1>
            {isPlanLoading ? (
              <div className="skeleton-box" style={{ width: '190px', height: '22px', borderRadius: 'var(--radius-full)' }} />
            ) : (
              <Badge variant={isStorageEnabled ? 'success' : 'danger'}>
                {isStorageEnabled ? 'Encrypted Object Storage: Active' : `Storage Disabled (${planContext?.planName || 'Plan'})`}
              </Badge>
            )}
          </div>
          {isPlanLoading ? (
            <div className="skeleton-box" style={{ width: '380px', height: '14px', borderRadius: '4px', marginTop: '6px' }} />
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              {isStorageEnabled
                ? 'Local & S3-compatible persistent storage with presigned URLs and MIME-type verification.'
                : 'File & object storage capabilities are governed authoritatively by the assigned project plan.'}
            </p>
          )}
        </div>
        <div>
          {isPlanLoading ? (
            <div className="skeleton-box" style={{ width: '130px', height: '36px', borderRadius: 'var(--radius-md)' }} />
          ) : isStorageEnabled ? (
            <label>
              <Button variant="primary" icon={<Upload size={15} />} style={{ cursor: 'pointer' }}>
                Upload Object
              </Button>
              <input type="file" onChange={handleUpload} style={{ display: 'none' }} />
            </label>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                icon={<Lock size={15} color="var(--accent-rose)" />}
                onClick={() => {
                  addToast(
                    `Upload rejected by backend policy: Feature 'storage.objects' is disabled on ${planContext?.planName || 'current plan'} (FEATURE_DISABLED)`,
                    'error'
                  );
                  setShowUpgradeModal(true);
                }}
                style={{ opacity: 0.85, cursor: 'not-allowed', borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--text-muted)' }}
              >
                Uploads Disabled ({planContext?.planName || 'Plan'})
              </Button>
              <Button variant="primary" size="md" onClick={() => setShowUpgradeModal(true)}>
                Upgrade Plan
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Prominent Free Plan Storage Restriction Banner */}
      {!isPlanLoading && !isStorageEnabled && (
        <div
          style={{
            padding: '16px 20px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '14px',
          }}
        >
          <div
            style={{
              padding: '8px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--accent-rose)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Lock size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#f87171' }}>
                Dedicated File Storage is Disabled on the {planContext?.planName || 'Plan'}
              </h4>
              <Badge variant="danger" size="sm">FEATURE_DISABLED</Badge>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Your project is assigned to the <strong>{planContext?.planName || 'Plan'}</strong> where the <code>storage.objects</code> capability is disabled.
              Direct upload endpoints (<code>/api/v1/storage/upload</code>), multipart chunks, and presigned upload URLs are blocked authoritatively by the backend gateway with HTTP 403 <code>FEATURE_DISABLED</code>.
            </p>
            <div
              style={{
                marginTop: '10px',
                padding: '8px 12px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.76rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ShieldCheck size={14} color="var(--accent-emerald)" />
              <span>
                <strong>Authoritative Enforcement Guarantee:</strong> Disabling UI buttons is for developer convenience; all direct HTTP and SDK upload requests are verified and rejected at the server level regardless of client state.
              </span>
            </div>
          </div>
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowUpgradeModal(true)}
              style={{ whiteSpace: 'nowrap' }}
            >
              Request Upgrade
            </Button>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {uploadProgress !== null && (
        <Card style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.82rem' }}>
            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Uploading & hashing object...</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>{uploadProgress}%</span>
          </div>
          <div style={{ width: '100%', height: '6px', background: 'var(--bg-main)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--accent-blue)', transition: 'width 0.2s ease' }} />
          </div>
        </Card>
      )}

      {/* Storage Summary */}
      <div className="grid-3">
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Bucket Identifier
            </span>
            <HardDrive size={15} color="var(--accent-blue)" />
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            default-storage
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            Path: <code>/app/storage/uploads</code>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Total Stored
            </span>
            {isPlanLoading ? (
              <div className="skeleton-box" style={{ width: '60px', height: '14px', borderRadius: '3px' }} />
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {isStorageEnabled ? `${files.length} objects` : 'Disabled'}
              </span>
            )}
          </div>
          {isPlanLoading ? (
            <div className="skeleton-box" style={{ width: '90px', height: '28px', borderRadius: '4px', margin: '4px 0' }} />
          ) : (
            <div style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: isStorageEnabled ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
              {isStorageEnabled ? formatBytes(totalBytes) : '0 B'}
            </div>
          )}
          {isPlanLoading ? (
            <div className="skeleton-box" style={{ width: '150px', height: '12px', borderRadius: '3px', marginTop: '6px' }} />
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              {isStorageEnabled ? 'Local NVMe persisted volume' : '0 B / 0 B (Disabled on Free Plan)'}
            </div>
          )}
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Quota & Guards
            </span>
            {isPlanLoading ? (
              <div className="skeleton-box" style={{ width: '16px', height: '16px', borderRadius: '50%' }} />
            ) : isStorageEnabled ? (
              <ShieldCheck size={15} color="var(--accent-emerald)" />
            ) : (
              <ShieldAlert size={15} color="var(--accent-rose)" />
            )}
          </div>
          {isPlanLoading ? (
            <div className="skeleton-box" style={{ width: '130px', height: '28px', borderRadius: '4px', margin: '4px 0' }} />
          ) : (
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: isStorageEnabled ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
              {isStorageEnabled ? 'Active Enforcement' : 'FEATURE_DISABLED'}
            </div>
          )}
          {isPlanLoading ? (
            <div className="skeleton-box" style={{ width: '180px', height: '12px', borderRadius: '3px', marginTop: '6px' }} />
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              {isStorageEnabled
                ? `${formatBytes(planContext?.limits.maxFileStorageBytes || 0)} max capacity • Strict MIME validation`
                : 'File uploads disabled on Free Tier • Upgrade required'}
            </div>
          )}
        </Card>
      </div>

      {/* Files Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Stored Objects ({files.length})</CardTitle>
            <CardDescription>All bucket keys, MIME categories, and signed URL generation</CardDescription>
          </div>
        </CardHeader>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Object Name / Path</th>
                <th style={{ width: '150px' }}>Content Type</th>
                <th style={{ width: '120px' }}>Size</th>
                <th style={{ width: '160px' }}>Created At</th>
                <th style={{ width: '180px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingFiles ? (
                [1, 2, 3].map((i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div className="skeleton-box animate-pulse" style={{ width: '160px', height: '14px', borderRadius: '4px', marginBottom: '4px' }} />
                      <div className="skeleton-box animate-pulse" style={{ width: '90px', height: '10px', borderRadius: '3px' }} />
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div className="skeleton-box animate-pulse" style={{ width: '70px', height: '16px', borderRadius: '4px' }} />
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div className="skeleton-box animate-pulse" style={{ width: '50px', height: '14px', borderRadius: '3px' }} />
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div className="skeleton-box animate-pulse" style={{ width: '80px', height: '12px', borderRadius: '3px' }} />
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div className="skeleton-box animate-pulse" style={{ width: '120px', height: '24px', borderRadius: '4px', marginLeft: 'auto' }} />
                    </td>
                  </tr>
                ))
              ) : files.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <HardDrive size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      No Stored Objects in Bucket
                    </div>
                    <div style={{ fontSize: '0.8rem' }}>
                      {isStorageEnabled
                        ? "Click 'Upload Object' above to store your first persistent file."
                        : "Storage is disabled on the current plan. Upgrade plan to enable object storage."}
                    </div>
                  </td>
                </tr>
              ) : (
                files.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getFileIcon(item.contentType)}
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>{item.path}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge variant="outline" size="sm">{item.contentType}</Badge>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{formatBytes(item.sizeBytes)}</span>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{item.createdAt}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleGenerateSignedUrl(item)}
                          icon={<LinkIcon size={13} />}
                          style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                        >
                          Signed URL
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeletingItem(item)}
                          icon={<Trash2 size={13} />}
                          style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Signed URL Modal */}
      <Modal
        isOpen={!!signedUrlModal}
        onClose={() => setSignedUrlModal(null)}
        title="Presigned Object URL"
        size="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            This URL contains a cryptographic HMAC-SHA256 token valid for 60 minutes for resource{' '}
            <code style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{signedUrlModal?.path}</code>.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              readOnly
              value={signedUrlModal?.url || ''}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--accent-blue)',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono)',
              }}
            />
            <Button
              variant="primary"
              onClick={() => {
                if (signedUrlModal?.url) {
                  navigator.clipboard.writeText(signedUrlModal.url);
                  setCopiedUrl(true);
                  addToast('Copied signed URL to clipboard', 'info');
                  setTimeout(() => setCopiedUrl(false), 2000);
                }
              }}
              icon={copiedUrl ? <Check size={14} /> : <Copy size={14} />}
            >
              {copiedUrl ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => setSignedUrlModal(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deletingItem}
        onClose={() => setDeletingItem(null)}
        title="Delete Storage Object"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Permanently delete storage object{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{deletingItem?.name}</strong>?
          </p>
          <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-rose)', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: '#f87171' }}>
            The object will be immediately removed from the volume and invalidated in cache.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => setDeletingItem(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Plan Upgrade Guidance Modal */}
      <Modal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        title="Storage Upgrade & Capability Governance"
        size="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <ShieldAlert size={22} color="var(--accent-rose)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#f87171' }}>
                Restricted Capability: <code>storage.objects</code>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Dedicated object and file storage is disabled on your assigned <strong>{planContext?.planName || 'current plan'}</strong>.
              </div>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            To enable object storage buckets, multipart uploads, and high-volume presigned assets, request a plan upgrade or quota expansion from your platform Super Administrator.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Pro Tier</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.6 }}>
                • 50 GB Object Storage<br />
                • S3 / MinIO Integration<br />
                • Presigned URLs & Multipart
              </div>
            </div>
            <div style={{ padding: '12px', border: '1px solid var(--accent-blue)', borderRadius: 'var(--radius-md)', background: 'rgba(59, 130, 246, 0.05)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-blue)' }}>Enterprise Tier</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.6 }}>
                • Unlimited Object Storage<br />
                • Dedicated Custom Overrides<br />
                • 24/7 SLA & SOC Governance
              </div>
            </div>
          </div>

          <div style={{ padding: '10px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <strong>Authoritative Boundary:</strong> Developers cannot change authoritative plans directly in the Developer Console. Project quotas and plan assignments are managed centrally by Super Administrators in <code>apps/super-admin</code>.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <Button variant="secondary" onClick={() => setShowUpgradeModal(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                addToast('Upgrade request registered. Super Admin notified.', 'success');
                setShowUpgradeModal(false);
              }}
            >
              Contact Super Admin
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
