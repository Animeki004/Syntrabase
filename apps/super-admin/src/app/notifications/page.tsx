'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Mail,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Eye,
  Check,
  RefreshCw,
  Clock,
  Layers,
  Inbox,
  MessageSquare,
  Send
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import {
  InternalNotification,
  ContactSubmission,
  ContactStatus,
} from '@syntrabase/shared-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function NotificationsCenterPage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'notifications' | 'contact_inquiries'>('notifications');

  // Notifications State
  const [notifications, setNotifications] = useState<InternalNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);

  // Contact Inquiries State
  const [inquiries, setInquiries] = useState<ContactSubmission[]>([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(true);
  const [selectedInquiry, setSelectedInquiry] = useState<ContactSubmission | null>(null);
  const [inquiryStatus, setInquiryStatus] = useState<ContactStatus>('open');
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const getAdminToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('super_admin_token') || '';
    }
    return '';
  };

  // Fetch Notifications
  const fetchNotifications = useCallback(async () => {
    try {
      let url = `${API_BASE}/api/v1/admin/notifications`;
      if (categoryFilter !== 'all') url += `?category=${categoryFilter}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // In-memory fallback
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [categoryFilter]);

  // Fetch Inquiries
  const fetchInquiries = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/contact/inquiries`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInquiries(data.submissions || []);
      }
    } catch {
      // In-memory fallback
    } finally {
      setIsLoadingInquiries(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchInquiries();
  }, [fetchNotifications, fetchInquiries]);

  // Direct open ticket if specified in URL query parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'contact_inquiries') {
        setActiveTab('contact_inquiries');
      }
      const ticketParam = params.get('ticket');
      if (ticketParam && inquiries.length > 0) {
        const found = inquiries.find(
          (i) => i.ticketReference === ticketParam || i.id === ticketParam || ticketParam.includes(i.ticketReference)
        );
        if (found) {
          setSelectedInquiry(found);
          setInquiryStatus(found.status);
          setActiveTab('contact_inquiries');
        }
      }
    }
  }, [inquiries]);

  // Mark As Read
  const handleMarkAsRead = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/v1/admin/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Fallback
    }
  };

  // Mark All Read
  const handleMarkAllRead = async () => {
    try {
      await fetch(`${API_BASE}/api/v1/admin/notifications/mark-all-read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      addToast('All notifications marked as read', 'info');
    } catch {
      addToast('Failed to mark all read', 'error');
    }
  };

  // Update Inquiry Status
  const handleUpdateInquiryStatus = async (id: string, newStatus: ContactStatus) => {
    try {
      await fetch(`${API_BASE}/api/v1/admin/contact/inquiries/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i)));
      if (selectedInquiry) setSelectedInquiry({ ...selectedInquiry, status: newStatus });
      addToast(`Inquiry status updated to ${newStatus}`, 'success');
    } catch {
      addToast('Failed to update status', 'error');
    }
  };

  // Send Official Reply & Notify Developer via Brevo
  const handleSendReply = async () => {
    if (!selectedInquiry) return;
    if (!replyText.trim() || replyText.trim().length < 5) {
      addToast('Please enter a response of at least 5 characters.', 'error');
      return;
    }

    setIsSubmittingReply(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/contact/inquiries/${selectedInquiry.id}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({
          reply: replyText.trim(),
          status: inquiryStatus,
          repliedBy: 'Syntrabase Support Operations',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to dispatch reply');
      }

      setInquiries((prev) =>
        prev.map((i) => (i.id === selectedInquiry.id ? data.submission : i))
      );
      setSelectedInquiry(data.submission);
      setReplyText('');
      addToast('Official reply dispatched & queued for Brevo delivery', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to dispatch reply', 'error');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Operations &amp; Notifications Center
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Internal operations feed for developer contact submissions, email provider alerts, and operational events.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Button variant="outline" onClick={() => { fetchNotifications(); fetchInquiries(); }}>
            <RefreshCw size={15} style={{ marginRight: '6px' }} /> Refresh
          </Button>
          {unreadCount > 0 && (
            <Button variant="primary" onClick={handleMarkAllRead}>
              <Check size={15} style={{ marginRight: '6px' }} /> Mark All Read ({unreadCount})
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-default)', paddingBottom: '8px' }}>
        <Button
          variant={activeTab === 'notifications' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('notifications')}
        >
          <Bell size={15} style={{ marginRight: '6px' }} />
          Notifications Feed {unreadCount > 0 && `(${unreadCount} unread)`}
        </Button>
        <Button
          variant={activeTab === 'contact_inquiries' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('contact_inquiries')}
        >
          <MessageSquare size={15} style={{ marginRight: '6px' }} />
          Contact Inquiries ({inquiries.length})
        </Button>
      </div>

      {/* TAB 1: NOTIFICATIONS FEED */}
      {activeTab === 'notifications' && (
        <Card>
          <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
            <div>
              <CardTitle>System &amp; Developer Operations Events</CardTitle>
              <CardDescription>
                Events are decoupled from external mail servers. Notifications continue functioning when email is offline.
              </CardDescription>
            </div>

            {/* Category Filter */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {['all', 'contact', 'email_infra', 'email_queue', 'security'].map((cat) => (
                <Button
                  key={cat}
                  variant={categoryFilter === cat ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setCategoryFilter(cat)}
                  style={{ fontSize: '11px', textTransform: 'capitalize' }}
                >
                  {cat.replace('_', ' ')}
                </Button>
              ))}
            </div>
          </CardHeader>

          <div style={{ padding: '16px' }}>
            {isLoadingNotifications ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--border-default)',
                }}
              >
                <CheckCircle2 size={36} style={{ color: 'var(--success)', marginBottom: '12px' }} />
                <h3 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>All Caught Up</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  No pending operational notifications or unresolved alerts.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (!notif.isRead) handleMarkAsRead(notif.id);
                      if (notif.category === 'contact' || notif.relatedId?.startsWith('TKT-')) {
                        const found = inquiries.find(
                          (i) => i.ticketReference === notif.relatedId || i.id === notif.relatedId || (notif.relatedId && notif.relatedId.includes(i.ticketReference))
                        );
                        if (found) {
                          setSelectedInquiry(found);
                          setInquiryStatus(found.status);
                          setActiveTab('contact_inquiries');
                        } else {
                          setActiveTab('contact_inquiries');
                        }
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: notif.isRead ? 'var(--bg-surface)' : 'var(--bg-surface-subtle)',
                      border: notif.isRead ? '1px solid var(--border-default)' : '1px solid var(--primary)',
                      boxShadow: notif.isRead ? 'none' : '0 2px 8px rgba(37, 99, 235, 0.08)',
                      cursor: 'pointer',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      {notif.severity === 'critical' ? (
                        <ShieldAlert size={20} color="var(--danger)" style={{ marginTop: '2px', flexShrink: 0 }} />
                      ) : notif.severity === 'warning' ? (
                        <AlertTriangle size={20} color="var(--warning)" style={{ marginTop: '2px', flexShrink: 0 }} />
                      ) : notif.category === 'contact' ? (
                        <MessageSquare size={20} color="var(--primary)" style={{ marginTop: '2px', flexShrink: 0 }} />
                      ) : (
                        <Bell size={20} color="var(--text-muted)" style={{ marginTop: '2px', flexShrink: 0 }} />
                      )}

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: notif.isRead ? 600 : 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                            {notif.title}
                          </span>
                          {!notif.isRead && (
                            <Badge variant="default" style={{ fontSize: '10px', height: '18px', padding: '0 6px' }}>
                              NEW
                            </Badge>
                          )}
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            {notif.category}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                          {notif.message}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(notif.createdAt).toLocaleTimeString()}
                      </span>
                      {!notif.isRead && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(notif.id);
                          }}
                        >
                          <Check size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* TAB 2: CONTACT INQUIRIES */}
      {activeTab === 'contact_inquiries' && (
        <Card>
          <CardHeader>
            <CardTitle>Developer Contact Center Submissions</CardTitle>
            <CardDescription>
              Inquiries submitted through the Developer Console form. Messages are durably recorded in the database.
            </CardDescription>
          </CardHeader>

          <div style={{ padding: '16px' }}>
            {isLoadingInquiries ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading inquiries...
              </div>
            ) : inquiries.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No contact submissions found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket Ref</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Project / Sender</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead style={{ textAlign: 'right' }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inquiries.map((inq) => (
                    <TableRow key={inq.id}>
                      <TableCell>
                        <code style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>
                          {inq.ticketReference}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{inq.category}</Badge>
                      </TableCell>
                      <TableCell style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {inq.subject}
                      </TableCell>
                      <TableCell>
                        <div style={{ fontSize: '0.85rem' }}>{inq.replyEmail || inq.userEmail || 'Developer'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{inq.projectId}</div>
                      </TableCell>
                      <TableCell>
                        {inq.status === 'open' ? (
                          <Badge variant="outline" style={{ color: 'var(--warning)', borderColor: 'var(--warning)' }}>
                            Open
                          </Badge>
                        ) : inq.status === 'in_progress' ? (
                          <Badge variant="default">In Progress</Badge>
                        ) : (
                          <Badge variant="outline" style={{ color: 'var(--success)', borderColor: 'var(--success)' }}>
                            Resolved
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(inq.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedInquiry(inq);
                            setInquiryStatus(inq.status);
                            setReplyText(inq.adminReply || '');
                          }}
                        >
                          <Eye size={13} style={{ marginRight: '4px' }} /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      )}

      {/* DETAIL MODAL FOR CONTACT INQUIRY */}
      {selectedInquiry && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedInquiry(null)}
          title={`Inquiry: ${selectedInquiry.ticketReference}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Badge variant="outline">{selectedInquiry.category}</Badge>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {new Date(selectedInquiry.createdAt).toLocaleString()}
              </span>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Subject
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                {selectedInquiry.subject}
              </div>
            </div>

            <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                Developer Context
              </div>
              <div style={{ fontSize: '0.85rem' }}><strong>Project:</strong> {selectedInquiry.projectId}</div>
              <div style={{ fontSize: '0.85rem' }}><strong>Sender Reply:</strong> {selectedInquiry.replyEmail || 'None provided'}</div>
            </div>

            {/* Conversation Messages Thread */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Conversation History ({selectedInquiry.messages?.length || 1} messages)
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  paddingRight: '4px',
                }}
              >
                {selectedInquiry.messages && selectedInquiry.messages.length > 0 ? (
                  selectedInquiry.messages.map((m) => {
                    const isOperator = m.senderType === 'operator';
                    return (
                      <div
                        key={m.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 'var(--radius-md)',
                          background: isOperator ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface-subtle)',
                          border: isOperator ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid var(--border-subtle)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isOperator ? '#3b82f6' : 'var(--text-primary)' }}>
                            {isOperator ? 'Syntrabase Support Team' : m.senderName || 'Developer'}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {new Date(m.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                          {m.message}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)' }}>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {selectedInquiry.message}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Compose / Update Official Reply Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-primary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Compose Official Response (Emailed to Developer via Brevo)
              </label>
              <textarea
                rows={4}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write your official response to the developer. This response will be stored in PostgreSQL and delivered to their email address..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  resize: 'vertical',
                }}
              />

              {/* Status Selector */}
              <div style={{ marginTop: '4px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '6px' }}>
                  Set Ticket Status After Reply
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['open', 'in_progress', 'resolved', 'closed'] as ContactStatus[]).map((st) => (
                    <Button
                      key={st}
                      variant={inquiryStatus === st ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setInquiryStatus(st)}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {st.replace('_', ' ')}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <Button variant="ghost" onClick={() => setSelectedInquiry(null)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  loading={isSubmittingReply}
                  onClick={handleSendReply}
                  icon={<Send size={14} />}
                >
                  Dispatch Official Reply &amp; Notify Developer
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
