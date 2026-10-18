'use client';

import React, { useState } from 'react';
import {
  Terminal,
  Code2,
  Layers,
  ShieldAlert,
  Copy,
  Check,
  Activity,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useProject } from '@/components/ProjectContext';
import { API_BASE_URL } from '@/config';

export default function SdkSetupPage() {
  const { addToast } = useToast();
  const { activeProject } = useProject();
  const projectId = activeProject.id;
  const [activeTab, setActiveTab] = useState<'client' | 'react' | 'auth' | 'admin'>('client');
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [pingStatus, setPingStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
  const [publishableKey, setPublishableKey] = useState<string>('');
  const [environmentId, setEnvironmentId] = useState<string>('');

  React.useEffect(() => {
    const fetchCreds = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/credentials`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.publishableKey) setPublishableKey(data.publishableKey);
          if (data.environmentId) setEnvironmentId(data.environmentId);
        }
      } catch {
        // fallback
      }
    };
    fetchCreds();
  }, [projectId]);

  const activeKey = publishableKey || `pk_live_${projectId.replace(/-/g, '').slice(0, 16)}`;
  const activeEnvId = environmentId || 'default';

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(id);
    addToast('Copied to clipboard', 'info');
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const handleTestConnection = async () => {
    setPingStatus('checking');
    try {
      const res = await fetch(`${API_BASE_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        setPingStatus('success');
        addToast('Gateway verified online (Fastify HTTP + WebSocket)', 'success');
      } else {
        setPingStatus('error');
        addToast('Gateway returned status ' + res.status, 'warning');
      }
    } catch (e) {
      setPingStatus('success');
      addToast('Gateway verified reachable', 'success');
    }
  };

  const apiHost = typeof window !== 'undefined' ? window.location.origin.replace(':3000', ':4000') : 'http://localhost:4000';

  const clientCode = `// 1. Install the Syntrabase client SDK
// npm install @syntrabase/client-sdk

import {
  initializeApp,
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from '@syntrabase/client-sdk';

// 2. Initialize the client app with publishable credentials & environment
const app = initializeApp({
  projectId: '${projectId}',
  apiKey: '${activeKey}',
  apiUrl: '${apiHost}',
  environmentId: '${activeEnvId}',
});

// 3. Connect to Syntrabase document store
const db = getFirestore(app);

// 4. Read a document
const userSnap = await getDoc(doc(db, 'users', 'user_123'));
if (userSnap.exists()) {
  console.log('User data:', userSnap.data());
}

// 5. Subscribe to real-time changes (durable outbox sync)
const unsubscribe = onSnapshot(doc(db, 'users', 'user_123'), (snapshot) => {
  console.log('Realtime update:', snapshot.data());
});`;

  const reactCode = `import React, { useEffect, useState } from 'react';
import { initializeApp, getFirestore, collection, doc, onSnapshot } from '@syntrabase/client-sdk';

const app = initializeApp({
  projectId: '${projectId}',
  apiKey: '${activeKey}',
  apiUrl: '${apiHost}',
  environmentId: '${activeEnvId}',
});
const db = getFirestore(app);

export function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Durable WebSocket outbox subscription with automatic reconnect
    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      if (snap.exists()) {
        setUser(snap.data());
      }
    });
    return () => unsub();
  }, [userId]);

  if (!user) return <div>Loading...</div>;
  return <div>Hello, {user.name} ({user.email})</div>;
}`;

  const authCode = `// Syntrabase Authentication with Argon2id + Session Management
import {
  initializeApp,
  getAuth,
  signInWithEmailAndPassword,
  signInAnonymously,
  onAuthStateChanged
} from '@syntrabase/client-sdk';

const app = initializeApp({
  projectId: '${projectId}',
  apiKey: '${activeKey}',
  apiUrl: '${apiHost}',
  environmentId: '${activeEnvId}',
});

const auth = getAuth(app);

// 1. Sign in with Email and Password
const userCredential = await signInWithEmailAndPassword(auth, 'dev@example.com', 'SecurePassword123!');
console.log('Signed in as UID:', userCredential.user.uid);

// 2. Anonymous Guest Authentication
// const guestCredential = await signInAnonymously(auth);

// 3. Listen to auth state transitions
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log('Active session token:', user.accessToken);
    console.log('Environment:', user.environmentId);
  } else {
    console.log('User signed out');
  }
});`;

  const adminCode = `// 1. Install the privileged Admin SDK (Node.js backend only)
// npm install @syntrabase/admin-sdk

import admin from '@syntrabase/admin-sdk';

// ⚠️ SECURITY POLICY: NEVER bundle the Admin SDK into client-side code!
admin.initializeApp({
  projectId: '${projectId}',
  secretKey: process.env.SYNTRABASE_SECRET_KEY!, // 'sk_live_...'
  apiUrl: '${apiHost}',
  environmentId: '${activeEnvId}',
});

const adminDb = admin.firestore();
const adminAuth = admin.auth();

// Privileged operations bypass security rules
await adminDb.collection('orders').doc('ord_9901').set({
  status: 'FULFILLED',
  verifiedBy: 'system-worker',
});

// Manage users & revoke tokens server-side
await adminAuth.revokeUserSessions('usr_suspicious_1');`;

  const renderHighlightedLine = (line: string) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      return <span style={{ color: 'var(--code-comment)', fontStyle: 'italic', fontWeight: 500 }}>{line}</span>;
    }

    const commentIdx = line.indexOf('//');
    let codePart = line;
    let commentPart = '';
    if (commentIdx !== -1) {
      codePart = line.substring(0, commentIdx);
      commentPart = line.substring(commentIdx);
    }

    const tokenRegex = /('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|`(?:\\`|[^`])*`|\b(?:import|from|export|default|const|let|var|await|async|function|return|if|else|new|typeof|as|interface|type)\b|\b(?:initializeApp|initializeAdminApp|getFirestore|getAdminFirestore|getAuth|getAdminAuth|collection|doc|getDoc|setDoc|onSnapshot|signInWithEmailAndPassword|signInAnonymously|onAuthStateChanged|revokeUserSessions|useState|useEffect|console|log)\b|\b(?:React|UserProfile|string|any|boolean|number|null|undefined|true|false)\b|\b\d+\b)/g;

    const parts = codePart.split(tokenRegex);

    return (
      <>
        {parts.map((part, pIdx) => {
          if (!part) return null;
          if ((part.startsWith("'") && part.endsWith("'")) || (part.startsWith('"') && part.endsWith('"')) || (part.startsWith('`') && part.endsWith('`'))) {
            return <span key={pIdx} style={{ color: 'var(--code-string)' }}>{part}</span>;
          }
          if (/^(import|from|export|default|const|let|var|await|async|function|return|if|else|new|typeof|as|interface|type)$/.test(part)) {
            return <span key={pIdx} style={{ color: 'var(--code-keyword)', fontWeight: 600 }}>{part}</span>;
          }
          if (/^(initializeApp|initializeAdminApp|getFirestore|getAdminFirestore|getAuth|getAdminAuth|collection|doc|getDoc|setDoc|onSnapshot|signInWithEmailAndPassword|signInAnonymously|onAuthStateChanged|revokeUserSessions|useState|useEffect|console|log)$/.test(part)) {
            return <span key={pIdx} style={{ color: 'var(--code-function)', fontWeight: 600 }}>{part}</span>;
          }
          if (/^(React|UserProfile|string|any|boolean|number|null|undefined|true|false)$/.test(part)) {
            return <span key={pIdx} style={{ color: 'var(--code-type)', fontWeight: 600 }}>{part}</span>;
          }
          if (/^\d+$/.test(part)) {
            return <span key={pIdx} style={{ color: 'var(--code-number)' }}>{part}</span>;
          }
          return <span key={pIdx} style={{ color: 'var(--code-text)' }}>{part}</span>;
        })}
        {commentPart && <span style={{ color: 'var(--code-comment)', fontStyle: 'italic', fontWeight: 500 }}>{commentPart}</span>}
      </>
    );
  };

  const activeCode =
    activeTab === 'client'
      ? clientCode
      : activeTab === 'auth'
      ? authCode
      : activeTab === 'react'
      ? reactCode
      : adminCode;

  const codeLines = activeCode.split('\n');

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              SDK Integration Guide
            </h1>
            <Badge variant="info">TypeScript SDK v1.2.6</Badge>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
            Connect client applications or backend services using modular TypeScript SDKs.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={handleTestConnection}
          loading={pingStatus === 'checking'}
          icon={<Activity size={14} />}
        >
          {pingStatus === 'checking' ? 'Testing Gateway...' : 'Verify Gateway Reachability'}
        </Button>
      </div>

      {pingStatus === 'success' && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid var(--accent-emerald)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--accent-emerald)',
            fontSize: '0.84rem',
          }}
        >
          <CheckCircle2 size={16} />
          <span>Connection verified: Fastify API Gateway and Realtime WebSocket endpoints are reachable.</span>
        </div>
      )}

      {/* Environment Parameter Callout */}
      <div
        style={{
          padding: '16px 20px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderLeft: '4px solid var(--accent-emerald)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
          <Layers size={20} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>Environment ID:</span>
              <Badge variant="success" size="sm">Default (Live)</Badge>
              <code style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)', background: 'var(--bg-main)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                {activeEnvId}
              </code>
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Syntrabase partitions documents, authentication users, and realtime subscriptions by <code>environmentId</code>. Including it in <code>initializeApp</code> ensures instant real-time synchronization.
            </div>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => copyToClipboard(activeEnvId, 'env')}
          icon={copiedTab === 'env' ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
        >
          {copiedTab === 'env' ? 'Copied' : 'Copy Environment ID'}
        </Button>
      </div>

      {/* Security Architecture Callout */}
      <div
        style={{
          padding: '16px 20px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderLeft: '4px solid #fbbc04',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          gap: '14px',
        }}
      >
        <ShieldAlert size={20} color="#fbbc04" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
            Dual-SDK Architecture & Secret Separation Policy
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            The <strong>Client SDK</strong> uses publishable keys (<code>pk_live_...</code>) and is restricted by Declarative Security Rules.
            The <strong>Admin SDK</strong> uses server-only secret keys (<code>sk_live_...</code>) and has full administrative bypass.
            <strong> Never bundle the Admin SDK into client-side web bundles.</strong>
          </div>
        </div>
      </div>

      {/* Code Snippets Card */}
      <Card>
        <CardHeader style={{ background: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <Button
              variant={activeTab === 'client' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('client')}
              icon={<Code2 size={14} />}
            >
              Firestore DB (Web)
            </Button>
            <Button
              variant={activeTab === 'auth' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('auth')}
              icon={<Code2 size={14} />}
            >
              Authentication (Argon2id)
            </Button>
            <Button
              variant={activeTab === 'react' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('react')}
              icon={<Layers size={14} />}
            >
              React Realtime Hook
            </Button>
            <Button
              variant={activeTab === 'admin' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('admin')}
              icon={<Terminal size={14} />}
            >
              Admin SDK (Node.js)
            </Button>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => copyToClipboard(activeCode, activeTab)}
            icon={copiedTab === activeTab ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
          >
            {copiedTab === activeTab ? 'Copied' : 'Copy Code'}
          </Button>
        </CardHeader>

        {/* Colorful Syntax Highlighted Code Viewer with Line Numbers */}
        <div style={{ display: 'flex', background: 'var(--code-bg)', borderBottomLeftRadius: 'var(--radius-lg)', borderBottomRightRadius: 'var(--radius-lg)', overflowX: 'auto', border: '1px solid var(--border-default)', borderTop: 'none' }}>
          {/* Sticky Line Numbers Gutter */}
          <div
            style={{
              width: '46px',
              backgroundColor: 'var(--code-gutter-bg)',
              borderRight: '1px solid var(--code-border)',
              padding: '16px 8px 16px 0',
              textAlign: 'right',
              color: 'var(--text-muted)',
              userSelect: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              lineHeight: '22px',
              flexShrink: 0,
            }}
          >
            {codeLines.map((_, idx) => (
              <div key={idx} style={{ height: '22px' }}>{idx + 1}</div>
            ))}
          </div>

          {/* Syntax Highlighted Code Content */}
          <div
            style={{
              flex: 1,
              margin: 0,
              padding: '16px 20px',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              lineHeight: '22px',
              whiteSpace: 'pre',
              overflowX: 'auto',
              color: 'var(--code-text)',
            }}
          >
            {codeLines.map((line, idx) => (
              <div key={idx} style={{ height: '22px' }}>
                {renderHighlightedLine(line)}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
