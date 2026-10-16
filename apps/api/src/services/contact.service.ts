import crypto from 'crypto';
import { query } from '../db/pool.js';
import {
  ContactCategory,
  ContactStatus,
  ContactSubmission,
  ContactInquiryMessage,
  ContactRetentionPolicy,
} from '@syntrabase/shared-types';
import { NotificationService } from './notification.service.js';
import { EmailService } from './email.service.js';
import { AuditService } from './audit.service.js';
import { UrlUtil } from '../utils/url.util.js';

// In-memory fallback for offline test environments
const inMemoryContactSubmissions: ContactSubmission[] = [];
const inMemoryMessages: ContactInquiryMessage[] = [];
const rateLimitMap = new Map<string, number[]>();

export class ContactService {
  /**
   * Generates a unique human-readable ticket reference e.g. TKT-2026-89104.
   */
  public static generateTicketReference(): string {
    const year = new Date().getFullYear();
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    return `TKT-${year}-${randomNum}`;
  }

  /**
   * Submits a contact inquiry from Developer Console.
   * Completely decoupled from outbound email delivery.
   */
  public static async submitInquiry(params: {
    projectId: string;
    userId?: string;
    userEmail?: string;
    category: ContactCategory;
    subject: string;
    message: string;
    replyEmail?: string;
    clientIp?: string;
  }): Promise<ContactSubmission> {
    // 1. Validation
    const cleanSubject = (params.subject || '').trim();
    const cleanMessage = (params.message || '').trim();

    if (cleanSubject.length < 5 || cleanSubject.length > 120) {
      throw new Error('Subject must be between 5 and 120 characters.');
    }

    if (cleanMessage.length < 15 || cleanMessage.length > 4000) {
      throw new Error('Message must be between 15 and 4000 characters.');
    }

    // 2. Abuse Prevention: Rate Limiting (5 requests per 15 minutes per IP/project)
    const rateLimitKey = `${params.clientIp || 'client'}_${params.projectId}`;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const timestamps = (rateLimitMap.get(rateLimitKey) || []).filter((t) => now - t < windowMs);

    if (timestamps.length >= 5) {
      throw new Error('Too many inquiries submitted. Please wait 15 minutes before submitting again.');
    }
    timestamps.push(now);
    rateLimitMap.set(rateLimitKey, timestamps);

    // 3. Generate Reference & Commit Durably
    const id = crypto.randomUUID();
    const ticketReference = this.generateTicketReference();
    const createdAt = new Date().toISOString();

    let submission: ContactSubmission;

    try {
      const res = await query<any>(
        `INSERT INTO contact_submissions (
           id, ticket_reference, project_id, user_id, user_email, category,
           subject, message, reply_email, status, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $10)
         RETURNING id, ticket_reference as "ticketReference", project_id as "projectId",
                   user_id as "userId", user_email as "userEmail", category, subject,
                   message, reply_email as "replyEmail", status, created_at as "createdAt"`,
        [
          id,
          ticketReference,
          params.projectId,
          params.userId || null,
          params.userEmail || null,
          params.category,
          cleanSubject,
          cleanMessage,
          params.replyEmail ? params.replyEmail.trim().toLowerCase() : null,
          createdAt,
        ]
      );
      submission = res.rows[0];

      // Insert initial message into inquiry messages table
      const msgId = crypto.randomUUID();
      await query(
        `INSERT INTO contact_inquiry_messages (
           id, inquiry_id, sender_type, sender_name, sender_email, message, created_at
         ) VALUES ($1, $2, 'developer', $3, $4, $5, $6)`,
        [
          msgId,
          id,
          params.userEmail?.split('@')[0] || 'Developer',
          params.replyEmail || params.userEmail || null,
          cleanMessage,
          createdAt,
        ]
      ).catch(() => {});

      submission.messages = [
        {
          id: msgId,
          inquiryId: id,
          senderType: 'developer',
          senderName: params.userEmail?.split('@')[0] || 'Developer',
          senderEmail: params.replyEmail || params.userEmail,
          message: cleanMessage,
          createdAt,
        },
      ];
    } catch {
      const initialMsg: ContactInquiryMessage = {
        id: crypto.randomUUID(),
        inquiryId: id,
        senderType: 'developer',
        senderName: params.userEmail?.split('@')[0] || 'Developer',
        senderEmail: params.replyEmail || params.userEmail,
        message: cleanMessage,
        createdAt,
      };
      submission = {
        id,
        ticketReference,
        projectId: params.projectId,
        userId: params.userId,
        userEmail: params.userEmail,
        category: params.category,
        subject: cleanSubject,
        message: cleanMessage,
        replyEmail: params.replyEmail,
        status: 'open',
        messages: [initialMsg],
        createdAt,
      };
      inMemoryContactSubmissions.unshift(submission);
      inMemoryMessages.push(initialMsg);
    }

    // 4. Trigger Internal Super Admin Notification (Decoupled, zero email dependency)
    await NotificationService.createNotification({
      category: 'contact',
      severity: 'info',
      title: `[${submission.ticketReference}] New Inquiry: ${submission.subject}`,
      message: `${submission.category} from ${submission.replyEmail || submission.userEmail || 'Developer'}: ${submission.message.substring(0, 150)}...`,
      relatedId: submission.ticketReference,
      projectId: submission.projectId,
    }).catch(() => {});

    return submission;
  }

  /**
   * Retrieves submissions for Super Admin triage or Developer Console project history.
   */
  public static async getSubmissions(options?: {
    projectId?: string;
    status?: ContactStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ submissions: ContactSubmission[]; total: number }> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    try {
      let filterSql = 'WHERE 1=1';
      const params: any[] = [];
      let paramIdx = 1;

      if (options?.projectId) {
        filterSql += ` AND project_id = $${paramIdx++}`;
        params.push(options.projectId);
      }

      if (options?.status) {
        filterSql += ` AND status = $${paramIdx++}`;
        params.push(options.status);
      }

      const listRes = await query<any>(
        `SELECT id, ticket_reference as "ticketReference", project_id as "projectId",
                user_id as "userId", user_email as "userEmail", category, subject,
                message, reply_email as "replyEmail", status,
                admin_reply as "adminReply", replied_at as "repliedAt", replied_by as "repliedBy",
                created_at as "createdAt"
         FROM contact_submissions
         ${filterSql}
         ORDER BY created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset]
      );

      const submissions: ContactSubmission[] = listRes.rows;

      if (submissions.length > 0) {
        const inquiryIds = submissions.map((s) => s.id);
        const msgRes = await query<any>(
          `SELECT id, inquiry_id as "inquiryId", sender_type as "senderType",
                  sender_name as "senderName", sender_email as "senderEmail",
                  message, created_at as "createdAt"
           FROM contact_inquiry_messages
           WHERE inquiry_id = ANY($1)
           ORDER BY created_at ASC`,
          [inquiryIds]
        ).catch(() => ({ rows: [] }));

        const messagesByInquiry = new Map<string, ContactInquiryMessage[]>();
        for (const msg of msgRes.rows) {
          const list = messagesByInquiry.get(msg.inquiryId) || [];
          list.push(msg);
          messagesByInquiry.set(msg.inquiryId, list);
        }

        for (const sub of submissions) {
          const thread = messagesByInquiry.get(sub.id) || [];
          if (thread.length === 0) {
            // Seed thread view from primary submission record
            thread.push({
              id: `${sub.id}-initial`,
              inquiryId: sub.id,
              senderType: 'developer',
              senderName: sub.userEmail?.split('@')[0] || 'Developer',
              senderEmail: sub.replyEmail || sub.userEmail,
              message: sub.message,
              createdAt: sub.createdAt,
            });
            if (sub.adminReply) {
              thread.push({
                id: `${sub.id}-reply`,
                inquiryId: sub.id,
                senderType: 'operator',
                senderName: sub.repliedBy || 'Syntrabase Support Operations',
                senderEmail: 'support@syntrabase.app',
                message: sub.adminReply,
                createdAt: sub.repliedAt || sub.createdAt,
              });
            }
          }
          sub.messages = thread;
        }
      }

      const countRes = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM contact_submissions ${filterSql}`,
        params.slice(0, paramIdx - 3)
      );

      return {
        submissions,
        total: parseInt(countRes.rows[0]?.count || '0', 10),
      };
    } catch {
      let filtered = inMemoryContactSubmissions;
      if (options?.projectId) {
        filtered = filtered.filter((s) => s.projectId === options.projectId);
      }
      if (options?.status) {
        filtered = filtered.filter((s) => s.status === options.status);
      }

      const result = filtered.slice(offset, offset + limit).map((s) => ({
        ...s,
        messages: inMemoryMessages.filter((m) => m.inquiryId === s.id),
      }));

      return {
        submissions: result,
        total: filtered.length,
      };
    }
  }

  /**
   * Updates inquiry status in Super Admin and notifies the developer.
   */
  public static async updateStatus(id: string, status: ContactStatus): Promise<void> {
    try {
      const res = await query<any>(
        `UPDATE contact_submissions SET status = $1 WHERE id = $2 RETURNING ticket_reference, project_id, subject`,
        [status, id]
      );
      if (res.rows.length > 0) {
        const ticket = res.rows[0];
        await NotificationService.createNotification({
          category: 'contact',
          severity: status === 'resolved' ? 'info' : status === 'closed' ? 'info' : 'warning',
          title: `[${ticket.ticket_reference}] Ticket Status: ${status.toUpperCase().replace('_', ' ')}`,
          message: `Support operations updated status for "${ticket.subject}" to ${status.toUpperCase().replace('_', ' ')}.`,
          relatedId: ticket.ticket_reference,
          projectId: ticket.project_id,
        }).catch(() => {});
      }
    } catch {
      const item = inMemoryContactSubmissions.find((s) => s.id === id);
      if (item) item.status = status;
    }
  }

  /**
   * Records an official administrator reply to a support inquiry, appends message to the thread,
   * updates ticket status, and dispatches a transactional email notification to the developer via Brevo.
   */
  public static async replyToInquiry(params: {
    id: string;
    replyText: string;
    status?: ContactStatus;
    repliedBy?: string;
    actorId?: string;
  }): Promise<ContactSubmission> {
    const cleanReply = (params.replyText || '').trim();
    if (cleanReply.length < 2 || cleanReply.length > 4000) {
      throw new Error('Reply message must be between 2 and 4000 characters.');
    }

    const nextStatus = params.status || 'resolved';
    const operator = params.repliedBy || 'Syntrabase Support Team';
    const nowIso = new Date().toISOString();

    let submission: ContactSubmission;

    try {
      const res = await query<any>(
        `UPDATE contact_submissions
         SET admin_reply = $1, status = $2, replied_at = NOW(), replied_by = $3
         WHERE id = $4
         RETURNING id, ticket_reference as "ticketReference", project_id as "projectId",
                   user_id as "userId", user_email as "userEmail", category, subject,
                   message, reply_email as "replyEmail", status,
                   admin_reply as "adminReply", replied_at as "repliedAt", replied_by as "repliedBy",
                   created_at as "createdAt"`,
        [cleanReply, nextStatus, operator, params.id]
      );

      if (res.rows.length === 0) {
        throw new Error('Support inquiry ticket not found.');
      }
      submission = res.rows[0];

      // Add to inquiry messages thread
      const msgId = crypto.randomUUID();
      const { email: platformFromEmail, name: platformFromName } = await UrlUtil.resolvePlatformSender();
      await query(
        `INSERT INTO contact_inquiry_messages (
           id, inquiry_id, sender_type, sender_name, sender_email, message, created_at
         ) VALUES ($1, $2, 'operator', $3, $4, $5, NOW())`,
        [msgId, params.id, operator, platformFromEmail, cleanReply]
      );

      const msgRes = await query<any>(
        `SELECT id, inquiry_id as "inquiryId", sender_type as "senderType",
                sender_name as "senderName", sender_email as "senderEmail",
                message, created_at as "createdAt"
         FROM contact_inquiry_messages
         WHERE inquiry_id = $1
         ORDER BY created_at ASC`,
        [params.id]
      );
      submission.messages = msgRes.rows;
    } catch (err: any) {
      if (err.message === 'Support inquiry ticket not found.') throw err;
      const memItem = inMemoryContactSubmissions.find((s) => s.id === params.id);
      if (!memItem) throw new Error('Support inquiry ticket not found.');
      memItem.adminReply = cleanReply;
      memItem.status = nextStatus;
      memItem.repliedAt = nowIso;
      memItem.repliedBy = operator;

      const { email: fallbackSenderEmail } = await UrlUtil.resolvePlatformSender();
      const newMsg: ContactInquiryMessage = {
        id: crypto.randomUUID(),
        inquiryId: params.id,
        senderType: 'operator',
        senderName: operator,
        senderEmail: fallbackSenderEmail,
        message: cleanReply,
        createdAt: nowIso,
      };
      inMemoryMessages.push(newMsg);
      memItem.messages = inMemoryMessages.filter((m) => m.inquiryId === params.id);
      submission = memItem;
    }

    // Dispatch email notification to the inquiry recipient via Brevo outbox
    const recipientEmail = submission.replyEmail || submission.userEmail;
    if (recipientEmail && recipientEmail.includes('@')) {
      const safeReplyHtml = cleanReply
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');

      const safeSubjectHtml = (submission.subject || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const consoleBaseUrl = UrlUtil.resolveConsoleUrl();
      const { email: platformFromEmail, name: platformFromName } = await UrlUtil.resolvePlatformSender();

      EmailService.enqueueEmail({
        projectId: submission.projectId,
        toEmail: recipientEmail.trim(),
        fromEmail: platformFromEmail,
        fromName: platformFromName || 'Syntrabase Support Team',
        subject: `[${submission.ticketReference}] Response to your support inquiry: ${submission.subject}`,
            text: `Hello,\n\nAn official response has been posted to your support inquiry (${submission.ticketReference}):\n\n${cleanReply}\n\nStatus: ${nextStatus.toUpperCase()}\nReplied by: ${operator}\n\nYou can review your ticket status and follow up in the Syntrabase Developer Console at ${consoleBaseUrl}/contact.\n\nBest regards,\nSyntrabase Support Team`,
            html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:20px auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;color:#0f172a;">
              <div style="margin-bottom:16px;">
                <h2 style="color:#2563eb;margin:0;font-size:20px;letter-spacing:-0.02em;">Syntrabase Support Team</h2>
              </div>
              <p style="font-size:14px;color:#334155;line-height:1.6;">An official response has been issued for your ticket <strong style="font-family:monospace;color:#2563eb;">${submission.ticketReference}</strong> (<strong>${safeSubjectHtml}</strong>):</p>
              <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:16px;border-radius:6px;font-size:14px;line-height:1.6;color:#1e293b;margin:20px 0;">
                ${safeReplyHtml}
              </div>
              <div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;font-size:13px;color:#475569;display:flex;justify-content:space-between;margin-bottom:18px;">
                <span><strong>Status:</strong> ${nextStatus.toUpperCase()}</span>
                <span><strong>Representative:</strong> ${operator}</span>
              </div>
              <p style="font-size:13px;color:#64748b;margin-top:20px;border-top:1px solid #f1f5f9;padding-top:14px;">View and follow up on this ticket in your <a href="${consoleBaseUrl}/contact" style="color:#2563eb;text-decoration:none;font-weight:600;">Developer Console Support Center</a>.</p>
            </div>`,
            actionType: 'SUPPORT_REPLY',
          }).catch((err) => {
            console.warn('[CONTACT SERVICE] Non-fatal notification email dispatch error:', err.message);
          });
    }

    // In-console notification for developer so console bell shows the reply immediately
    await NotificationService.createNotification({
      category: 'contact',
      severity: 'info',
      title: `[${submission.ticketReference}] Support Team Response`,
      message: `${operator}: ${cleanReply.substring(0, 120)}${cleanReply.length > 120 ? '...' : ''}`,
      relatedId: submission.ticketReference,
      projectId: submission.projectId,
    }).catch(() => {});

    if (params.actorId) {
      AuditService.log({
        actorId: params.actorId,
        actorType: 'developer',
        action: 'contact.inquiry_replied',
        targetResource: `ticket:${submission.ticketReference}`,
        projectId: submission.projectId,
        payload: { ticketReference: submission.ticketReference, status: nextStatus, operator },
      }).catch(() => {});
    }

    return submission;
  }

  /**
   * Developer follow-up on an open or in_progress inquiry.
   * Allows multi-turn continuous messaging until resolved or closed.
   */
  public static async addDeveloperFollowUp(params: {
    inquiryId: string;
    projectId: string;
    message: string;
    senderName?: string;
    senderEmail?: string;
    developerId: string;
  }): Promise<ContactSubmission> {
    const cleanMessage = (params.message || '').trim();
    if (cleanMessage.length < 2 || cleanMessage.length > 4000) {
      throw new Error('Follow-up message must be between 2 and 4000 characters.');
    }

    let submission: ContactSubmission;

    try {
      const checkRes = await query<any>(
        `SELECT id, ticket_reference as "ticketReference", project_id as "projectId",
                user_id as "userId", user_email as "userEmail", category, subject,
                message, reply_email as "replyEmail", status,
                admin_reply as "adminReply", replied_at as "repliedAt", replied_by as "repliedBy",
                created_at as "createdAt"
         FROM contact_submissions
         WHERE id = $1 AND project_id = $2`,
        [params.inquiryId, params.projectId]
      );

      if (checkRes.rows.length === 0) {
        throw new Error('Support inquiry ticket not found or project access denied.');
      }
      submission = checkRes.rows[0];

      if (submission.status === 'closed') {
        throw new Error('Ticket is closed. Please submit a new inquiry to resume support.');
      }

      // Re-open if resolved or keep in_progress
      const nextStatus = 'in_progress';
      await query(
        `UPDATE contact_submissions SET status = $1 WHERE id = $2`,
        [nextStatus, params.inquiryId]
      );
      submission.status = nextStatus;

      // Add message
      const msgId = crypto.randomUUID();
      await query(
        `INSERT INTO contact_inquiry_messages (
           id, inquiry_id, sender_type, sender_name, sender_email, message, created_at
         ) VALUES ($1, $2, 'developer', $3, $4, $5, NOW())`,
        [msgId, params.inquiryId, params.senderName || 'Developer', params.senderEmail || submission.userEmail, cleanMessage]
      );

      const msgRes = await query<any>(
        `SELECT id, inquiry_id as "inquiryId", sender_type as "senderType",
                sender_name as "senderName", sender_email as "senderEmail",
                message, created_at as "createdAt"
         FROM contact_inquiry_messages
         WHERE inquiry_id = $1
         ORDER BY created_at ASC`,
        [params.inquiryId]
      );
      submission.messages = msgRes.rows;
    } catch (err: any) {
      if (err.message.includes('not found') || err.message.includes('closed')) throw err;
      const memItem = inMemoryContactSubmissions.find((s) => s.id === params.inquiryId && s.projectId === params.projectId);
      if (!memItem) throw new Error('Support inquiry ticket not found or project access denied.');
      if (memItem.status === 'closed') throw new Error('Ticket is closed. Please submit a new inquiry.');

      memItem.status = 'in_progress';
      const newMsg: ContactInquiryMessage = {
        id: crypto.randomUUID(),
        inquiryId: params.inquiryId,
        senderType: 'developer',
        senderName: params.senderName || 'Developer',
        senderEmail: params.senderEmail || memItem.userEmail,
        message: cleanMessage,
        createdAt: new Date().toISOString(),
      };
      inMemoryMessages.push(newMsg);
      memItem.messages = inMemoryMessages.filter((m) => m.inquiryId === params.inquiryId);
      submission = memItem;
    }

    // Trigger internal notification for Super Admin operator
    await NotificationService.createNotification({
      category: 'contact',
      severity: 'info',
      title: `[${submission.ticketReference}] Developer Follow-Up: ${submission.subject}`,
      message: `${params.senderName || 'Developer'}: ${cleanMessage.substring(0, 150)}...`,
      relatedId: submission.ticketReference,
      projectId: submission.projectId,
    }).catch(() => {});

    await AuditService.log({
      actorId: params.developerId,
      actorType: 'developer',
      action: 'contact.inquiry_follow_up',
      targetResource: `ticket:${submission.ticketReference}`,
      projectId: submission.projectId,
      payload: { ticketReference: submission.ticketReference, messageLength: cleanMessage.length },
    }).catch(() => {});

    return submission;
  }

  /**
   * Permanently deletes a single support inquiry and its message thread.
   */
  public static async deleteInquiry(id: string, actorId?: string): Promise<{ success: boolean; ticketReference?: string }> {
    try {
      const getRes = await query<{ ticket_reference: string; project_id: string }>(
        'SELECT ticket_reference, project_id FROM contact_submissions WHERE id = $1',
        [id]
      );
      if (getRes.rows.length === 0) {
        throw new Error('Support inquiry ticket not found.');
      }
      const ticket = getRes.rows[0];

      // Delete associated internal notifications
      await query('DELETE FROM internal_notifications WHERE related_id = $1', [ticket.ticket_reference]).catch(() => {});

      // Delete inquiry (foreign key CASCADE deletes contact_inquiry_messages)
      await query('DELETE FROM contact_submissions WHERE id = $1', [id]);

      if (actorId) {
        await AuditService.log({
          actorId,
          actorType: 'developer',
          action: 'contact.inquiry_deleted',
          targetResource: `ticket:${ticket.ticket_reference}`,
          projectId: ticket.project_id,
          payload: { ticketId: id, ticketReference: ticket.ticket_reference },
        }).catch(() => {});
      }

      return { success: true, ticketReference: ticket.ticket_reference };
    } catch (err: any) {
      if (err.message === 'Support inquiry ticket not found.') throw err;
      const idx = inMemoryContactSubmissions.findIndex((s) => s.id === id);
      if (idx === -1) throw new Error('Support inquiry ticket not found.');
      const ref = inMemoryContactSubmissions[idx].ticketReference;
      inMemoryContactSubmissions.splice(idx, 1);
      return { success: true, ticketReference: ref };
    }
  }

  /**
   * Bulk purge inquiries matching criteria (e.g. all tickets, stale tickets, resolved tickets).
   */
  public static async purgeInquiries(
    options: { olderThanDays?: number; status?: ContactStatus; purgeAll?: boolean },
    actorId?: string
  ): Promise<{ deletedCount: number }> {
    try {
      let whereClauses: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (!options.purgeAll) {
        if (options.status) {
          whereClauses.push(`status = $${paramIdx++}`);
          params.push(options.status);
        }
        if (typeof options.olderThanDays === 'number' && options.olderThanDays > 0) {
          whereClauses.push(`created_at < NOW() - ($${paramIdx++} || ' days')::interval`);
          params.push(options.olderThanDays);
        }
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const delRes = await query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM contact_submissions ${whereSql} RETURNING ticket_reference
         )
         SELECT count(*) as count FROM deleted`,
        params
      );

      const deletedCount = parseInt(delRes.rows[0]?.count || '0', 10);

      // Clean up orphaned notifications for deleted tickets
      await query(`DELETE FROM internal_notifications WHERE category = 'contact' AND related_id NOT IN (SELECT ticket_reference FROM contact_submissions)`).catch(() => {});

      if (actorId) {
        await AuditService.log({
          actorId,
          actorType: 'developer',
          action: 'contact.inquiries_purged',
          targetResource: 'contact_submissions',
          payload: { deletedCount, criteria: options },
        }).catch(() => {});
      }

      return { deletedCount };
    } catch {
      let beforeCount = inMemoryContactSubmissions.length;
      if (options.purgeAll) {
        inMemoryContactSubmissions.length = 0;
      }
      return { deletedCount: beforeCount - inMemoryContactSubmissions.length };
    }
  }

  /**
   * Retrieves ticket auto-remove / retention configuration.
   */
  public static async getRetentionPolicy(): Promise<ContactRetentionPolicy> {
    try {
      const res = await query<any>(
        `SELECT auto_remove_enabled as "autoRemoveEnabled",
                retention_days as "retentionDays",
                resolved_only as "resolvedOnly",
                last_pruned_at as "lastPrunedAt",
                updated_at as "updatedAt"
         FROM contact_retention_policy
         WHERE id = 1`
      );
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    } catch {}
    return {
      autoRemoveEnabled: false,
      retentionDays: 30,
      resolvedOnly: true,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Updates ticket auto-remove / retention configuration.
   */
  public static async updateRetentionPolicy(
    params: { autoRemoveEnabled: boolean; retentionDays: number; resolvedOnly: boolean },
    actorId?: string
  ): Promise<ContactRetentionPolicy> {
    try {
      const res = await query<any>(
        `UPDATE contact_retention_policy
         SET auto_remove_enabled = $1,
             retention_days = $2,
             resolved_only = $3,
             updated_at = NOW()
         WHERE id = 1
         RETURNING auto_remove_enabled as "autoRemoveEnabled",
                   retention_days as "retentionDays",
                   resolved_only as "resolvedOnly",
                   last_pruned_at as "lastPrunedAt",
                   updated_at as "updatedAt"`,
        [params.autoRemoveEnabled, params.retentionDays, params.resolvedOnly]
      );

      if (actorId) {
        await AuditService.log({
          actorId,
          actorType: 'developer',
          action: 'contact.retention_policy_updated',
          targetResource: 'contact_retention_policy',
          payload: params,
        }).catch(() => {});
      }

      if (res.rows.length > 0) {
        return res.rows[0];
      }
    } catch {}

    return {
      autoRemoveEnabled: params.autoRemoveEnabled,
      retentionDays: params.retentionDays,
      resolvedOnly: params.resolvedOnly,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Background sweep to auto-remove tickets exceeding retention duration if policy is active.
   */
  public static async autoPruneOldTickets(): Promise<{ prunedCount: number }> {
    try {
      const policy = await this.getRetentionPolicy();
      if (!policy.autoRemoveEnabled || policy.retentionDays <= 0) {
        return { prunedCount: 0 };
      }

      let statusFilter = policy.resolvedOnly ? "AND status IN ('resolved', 'closed')" : "";
      const res = await query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM contact_submissions
           WHERE created_at < NOW() - ($1 || ' days')::interval ${statusFilter}
           RETURNING id
         )
         SELECT count(*) as count FROM deleted`,
        [policy.retentionDays]
      );

      await query('UPDATE contact_retention_policy SET last_pruned_at = NOW() WHERE id = 1').catch(() => {});

      return { prunedCount: parseInt(res.rows[0]?.count || '0', 10) };
    } catch {
      return { prunedCount: 0 };
    }
  }
}


