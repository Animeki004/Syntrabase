'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  HelpCircle,
  ShieldAlert,
  LifeBuoy,
  FileText,
  Copy,
  Check,
  RefreshCw,
  FolderOpen,
  ShieldCheck,
  Layers
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useProject } from '@/components/ProjectContext';
import { API_BASE_URL } from '@/config';
import { ContactSubmission, ContactCategory } from '@syntrabase/shared-types';

const CATEGORIES: { id: ContactCategory; label: string; icon: any; desc: string }[] = [
  {
    id: 'Technical Support',
    label: 'Technical Support',
    icon: LifeBuoy,
    desc: 'API integration, database performance, SDK issues',
  },
  {
    id: 'Billing Inquiry',
    label: 'Billing Inquiry',
    icon: FileText,
    desc: 'Tier upgrades, rate limits, enterprise capacity',
  },
  {
    id: 'Security & Vulnerability',
    label: 'Security & Vulnerability',
    icon: ShieldAlert,
    desc: 'Vulnerability disclosure, access control, audit records',
  },
  {
    id: 'Feature Request',
    label: 'Feature Request',
    icon: HelpCircle,
    desc: 'Suggestions, roadmap enhancements, developer experience',
  },
  {
    id: 'Operational Issue',
    label: 'Operational Issue',
    icon: MessageSquare,
    desc: 'Deployment anomalies, network routing, triage matters',
  },
];

export default function ContactSupportPage() {
  const { addToast } = useToast();
  const { activeProject } = useProject();
  const projectId = activeProject.id;

  const [category, setCategory] = useState<ContactCategory>('Technical Support');
  const [subject, setSubject] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmittedTicket, setLastSubmittedTicket] = useState<{
    ticketReference: string;
    createdAt: string;
    category: string;
    subject: string;
  } | null>(null);

  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [copiedTicket, setCopiedTicket] = useState<string | null>(null);

  // Multi-message thread & follow-up state
  const [followUpMap, setFollowUpMap] = useState<Record<string, string>>({});
  const [isSendingFollowUp, setIsSendingFollowUp] = useState<Record<string, boolean>>({});
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  const handleSendFollowUp = async (inquiryId: string) => {
    const text = (followUpMap[inquiryId] || '').trim();
    if (!text || text.length < 2) {
      addToast('Please enter a follow-up message of at least 2 characters', 'error');
      return;
    }

    setIsSendingFollowUp((prev) => ({ ...prev, [inquiryId]: true }));
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/contact/${inquiryId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: text }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to send follow-up message');
      }

      setSubmissions((prev) =>
        prev.map((s) => (s.id === inquiryId ? data.submission : s))
      );
      setFollowUpMap((prev) => ({ ...prev, [inquiryId]: '' }));
      addToast('Follow-up message sent! Support operations notified.', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to send follow-up', 'error');
    } finally {
      setIsSendingFollowUp((prev) => ({ ...prev, [inquiryId]: false }));
    }
  };

  // Pre-fill category and subject from query parameters if present
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const catParam = params.get('category');
      const subParam = params.get('subject');
      if (catParam && CATEGORIES.some((c) => c.id === catParam)) {
        setCategory(catParam as ContactCategory);
      }
      if (subParam) {
        setSubject(subParam);
      }
      const savedEmail = localStorage.getItem('auth_email');
      if (savedEmail) {
        setReplyEmail(savedEmail);
      }
    }
  }, []);

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoadingSubmissions(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/contact`, {
        headers,
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoadingSubmissions(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!subject.trim() || subject.trim().length < 5) {
      addToast('Please provide a descriptive subject (at least 5 characters)', 'error');
      return;
    }

    if (!message.trim() || message.trim().length < 10) {
      addToast('Please provide more details in your message (at least 10 characters)', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/contact`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          message: message.trim(),
          replyEmail: replyEmail.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Failed to submit inquiry');
      }

      const data = await res.json();
      const ticketRef = data.ticketReference || `TKT-${Math.floor(1000 + Math.random() * 9000)}`;

      if (data.submission) {
        setSubmissions((prev) => [data.submission, ...prev]);
      } else {
        await fetchSubmissions();
      }

      setLastSubmittedTicket({
        ticketReference: ticketRef,
        createdAt: new Date().toISOString(),
        category,
        subject: subject.trim(),
      });

      addToast(`Support ticket ${ticketRef} created successfully!`, 'success');
      setSubject('');
      setMessage('');
    } catch (err: any) {
      addToast(err.message || 'Failed to submit inquiry', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyTicket = (ticketRef: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(ticketRef).catch(() => {});
    }
    setCopiedTicket(ticketRef);
    addToast(`Ticket ${ticketRef} copied to clipboard`, 'info');
    setTimeout(() => setCopiedTicket(null), 2500);
  };

  return (
    <div className="page-container" style={{ padding: '24px 32px 48px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header Card */}
      <Card style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--primary-subtle)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LifeBuoy size={18} />
              </div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: 'var(--text-primary)' }}>
                Contact Center &amp; Support
              </h1>
              <Badge variant="success">Priority Operations Queue</Badge>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Submit technical questions, report security issues, or request quota adjustments. Submissions are persisted directly into the operations triage queue.
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchSubmissions}
            loading={loadingSubmissions}
            icon={<RefreshCw size={14} />}
          >
            Refresh History
          </Button>
        </div>
      </Card>

      {/* Main Two-Column Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Form or Success Card */}
        <div>
          {lastSubmittedTicket ? (
            <Card style={{ borderColor: 'rgba(16, 185, 129, 0.4)', background: 'var(--bg-surface)' }}>
              <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: 'var(--success)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <CheckCircle2 size={28} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
                  Support Ticket Successfully Created
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 20px', lineHeight: 1.5 }}>
                  Your inquiry has been recorded in the platform operations triage center. A support engineer will review it shortly.
                </p>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 20px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-default)',
                    marginBottom: '24px',
                  }}
                >
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Ticket Reference:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--primary)' }}>
                    {lastSubmittedTicket.ticketReference}
                  </span>
                  <button
                    onClick={() => copyTicket(lastSubmittedTicket.ticketReference)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                    }}
                    title="Copy Ticket Reference"
                  >
                    {copiedTicket === lastSubmittedTicket.ticketReference ? (
                      <Check size={16} color="var(--success)" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>

                <div>
                  <Button variant="primary" size="md" onClick={() => setLastSubmittedTicket(null)}>
                    Submit Another Inquiry
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <div style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  New Support Inquiry
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                  Project: <strong style={{ color: 'var(--text-primary)' }}>{activeProject.name}</strong> ({activeProject.id})
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Category Selection */}
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
                    Inquiry Category
                  </label>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                      gap: '8px',
                    }}
                  >
                    {CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      const isSelected = category === cat.id;
                      return (
                        <div
                          key={cat.id}
                          onClick={() => setCategory(cat.id)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-md)',
                            border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border-default)'}`,
                            background: isSelected ? 'var(--primary-subtle)' : 'var(--bg-surface-subtle)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: 'var(--radius-sm)',
                              background: isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                              color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Icon size={14} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: isSelected ? 'var(--primary-text)' : 'var(--text-primary)' }}>
                              {cat.label}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                              {cat.desc}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Subject <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{subject.length} / 200</span>
                  </div>
                  <input
                    className="form-input"
                    placeholder="Brief summary of your inquiry or issue"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={200}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Reply Email */}
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                    Contact Email for Follow-Up (Optional)
                  </label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="developer@yourcompany.com"
                    value={replyEmail}
                    onChange={(e) => setReplyEmail(e.target.value)}
                    style={{ width: '100%' }}
                  />
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    If omitted, notifications will be tied to your active developer account profile.
                  </p>
                </div>

                {/* Description Textarea */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Detailed Description <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{message.length} / 5000</span>
                  </div>
                  <textarea
                    className="form-input form-textarea"
                    rows={6}
                    placeholder="Please include error messages, steps to reproduce, or relevant endpoint URLs..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={5000}
                    required
                    style={{ width: '100%', minHeight: '130px', resize: 'vertical' }}
                  />
                </div>

                {/* Submit button */}
                <div style={{ paddingTop: '6px' }}>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={isSubmitting}
                    icon={<Send size={14} />}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Submit Support Ticket
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>

        {/* Right Column: History & SLAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Submissions History */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} color="var(--primary)" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  Your Recent Inquiries
                </h3>
              </div>
              <Badge variant="neutral">{submissions.length} total</Badge>
            </div>

            {submissions.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <FolderOpen size={32} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
                <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>No previous inquiries</p>
                <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>Submitted support tickets will appear here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {submissions.map((sub) => {
                  const isExpanded = expandedTicketId === sub.id;
                  const messageCount = sub.messages?.length || (sub.adminReply ? 2 : 1);
                  return (
                    <div
                      key={sub.id}
                      style={{
                        padding: '12px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-surface-subtle)',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span
                          onClick={() => copyTicket(sub.ticketReference)}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: 'var(--primary)',
                            cursor: 'pointer',
                          }}
                          title="Click to copy ticket ID"
                        >
                          {sub.ticketReference}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Badge
                            variant={
                              sub.status === 'resolved'
                                ? 'success'
                                : sub.status === 'in_progress'
                                ? 'info'
                                : 'warning'
                            }
                          >
                            {sub.status.replace('_', ' ')}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedTicketId(isExpanded ? null : sub.id)}
                            style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                          >
                            {isExpanded ? 'Collapse' : `Thread (${messageCount})`}
                          </Button>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {sub.subject}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        <span style={{ textTransform: 'capitalize' }}>{sub.category.replace('_', ' ')}</span>
                        <span>{new Date(sub.createdAt).toLocaleDateString()}</span>
                      </div>

                      {/* Expanded Multi-Turn Thread */}
                      {isExpanded && (
                        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                            Conversation Thread
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                            {sub.messages && sub.messages.length > 0 ? (
                              sub.messages.map((m) => {
                                const isOp = m.senderType === 'operator';
                                return (
                                  <div
                                    key={m.id}
                                    style={{
                                      padding: '8px 10px',
                                      borderRadius: 'var(--radius-sm)',
                                      background: isOp ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface)',
                                      border: isOp ? '1px solid rgba(37, 99, 235, 0.25)' : '1px solid var(--border-default)',
                                      fontSize: '0.8rem',
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                      <span style={{ fontWeight: 700, color: isOp ? '#3b82f6' : 'var(--text-primary)', fontSize: '0.72rem' }}>
                                        {isOp ? 'Syntrabase Support Team' : m.senderName || 'Developer'}
                                      </span>
                                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                        {new Date(m.createdAt).toLocaleDateString()}
                                      </span>
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                                      {m.message}
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <>
                                <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', fontSize: '0.8rem' }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.72rem', marginBottom: '4px' }}>
                                    Initial Inquiry
                                  </div>
                                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                                    {sub.message}
                                  </div>
                                </div>
                                {sub.adminReply && (
                                  <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.25)', fontSize: '0.8rem' }}>
                                    <div style={{ fontWeight: 700, color: '#3b82f6', fontSize: '0.72rem', marginBottom: '4px' }}>
                                      Syntrabase Support Response
                                    </div>
                                    <div style={{ color: 'var(--text-primary)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                                      {sub.adminReply}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* Follow-up input form if ticket is not closed */}
                          {sub.status !== 'closed' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                              <textarea
                                rows={2}
                                value={followUpMap[sub.id] || ''}
                                onChange={(e) => setFollowUpMap((prev) => ({ ...prev, [sub.id]: e.target.value }))}
                                placeholder="Write follow-up message to the support team..."
                                style={{
                                  width: '100%',
                                  padding: '8px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--bg-surface)',
                                  border: '1px solid var(--border-default)',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.8rem',
                                  lineHeight: 1.4,
                                  resize: 'vertical',
                                }}
                              />
                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  loading={isSendingFollowUp[sub.id]}
                                  onClick={() => handleSendFollowUp(sub.id)}
                                  icon={<Send size={12} />}
                                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                >
                                  Send Follow-Up
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '4px' }}>
                              This ticket has been permanently closed.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Zero-Dependency Guaranteed Persistence */}
          <Card style={{ background: 'var(--bg-surface-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
              <ShieldCheck size={18} color="var(--success)" />
              <span>Atomic Queue Persistence</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              Inquiries are committed atomically into PostgreSQL database storage before confirmation. Your ticket will be safely received and triaged by the operations team even during external service maintenance.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
