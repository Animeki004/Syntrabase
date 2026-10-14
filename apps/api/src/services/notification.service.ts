import { query } from '../db/pool.js';
import {
  InternalNotification,
  NotificationCategory,
  NotificationSeverity,
} from '@syntrabase/shared-types';

// In-memory fallback for offline test environments
const inMemoryNotifications: InternalNotification[] = [];

export class NotificationService {
  /**
   * Generates an internal Super Admin notification.
   */
  public static async createNotification(params: {
    category: NotificationCategory;
    severity?: NotificationSeverity;
    title: string;
    message: string;
    relatedId?: string;
    projectId?: string;
  }): Promise<InternalNotification> {
    const id = crypto.randomUUID();
    const severity = params.severity || 'info';
    const createdAt = new Date().toISOString();

    try {
      const res = await query<any>(
        `INSERT INTO internal_notifications (id, category, severity, title, message, related_id, project_id, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8)
         RETURNING id, category, severity, title, message, related_id as "relatedId",
                   project_id as "projectId", is_read as "isRead", created_at as "createdAt"`,
        [id, params.category, severity, params.title, params.message, params.relatedId || null, params.projectId || null, createdAt]
      );
      return res.rows[0];
    } catch {
      const item: InternalNotification = {
        id,
        category: params.category,
        severity,
        title: params.title,
        message: params.message,
        relatedId: params.relatedId,
        projectId: params.projectId,
        isRead: false,
        createdAt,
      };
      inMemoryNotifications.unshift(item);
      return item;
    }
  }

  /**
   * Retrieves operational notifications with filtering and unread count.
   */
  public static async getNotifications(options?: {
    isRead?: boolean;
    category?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ notifications: InternalNotification[]; unreadCount: number }> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    try {
      let filterSql = 'WHERE 1=1';
      const params: any[] = [];
      let paramIdx = 1;

      if (options?.isRead !== undefined) {
        filterSql += ` AND is_read = $${paramIdx++}`;
        params.push(options.isRead);
      }

      if (options?.category) {
        filterSql += ` AND category = $${paramIdx++}`;
        params.push(options.category);
      }

      const listRes = await query<any>(
        `SELECT id, category, severity, title, message, related_id as "relatedId",
                project_id as "projectId", is_read as "isRead", created_at as "createdAt"
         FROM internal_notifications
         ${filterSql}
         ORDER BY created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset]
      );

      const countRes = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM internal_notifications WHERE is_read = FALSE`
      );

      return {
        notifications: listRes.rows,
        unreadCount: parseInt(countRes.rows[0]?.count || '0', 10),
      };
    } catch {
      let filtered = inMemoryNotifications;
      if (options?.isRead !== undefined) {
        filtered = filtered.filter((n) => n.isRead === options.isRead);
      }
      if (options?.category) {
        filtered = filtered.filter((n) => n.category === options.category);
      }
      const unreadCount = inMemoryNotifications.filter((n) => !n.isRead).length;

      return {
        notifications: filtered.slice(offset, offset + limit),
        unreadCount,
      };
    }
  }

  /**
   * Marks a notification as read.
   */
  public static async markAsRead(id: string): Promise<void> {
    try {
      await query(`UPDATE internal_notifications SET is_read = TRUE WHERE id = $1`, [id]);
    } catch {
      const item = inMemoryNotifications.find((n) => n.id === id);
      if (item) item.isRead = true;
    }
  }

  /**
   * Marks all notifications as read.
   */
  public static async markAllAsRead(): Promise<void> {
    try {
      await query(`UPDATE internal_notifications SET is_read = TRUE WHERE is_read = FALSE`);
    } catch {
      inMemoryNotifications.forEach((n) => {
        n.isRead = true;
      });
    }
  }
}
