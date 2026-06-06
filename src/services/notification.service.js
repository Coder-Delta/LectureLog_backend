import pool from '../config/database.config.js';
import axios from 'axios';

export const slugifyStream = (stream) => {
  if (!stream) return 'cse';
  return String(stream).toLowerCase().replace(/[^a-z0-9]+/g, '-');
};

let ioInstance = null;

const dispatchExpoPush = async (pushToken, title, message, redirectUrl, priority, notifId) => {
  if (!pushToken || (!pushToken.startsWith('ExponentPushToken[') && !pushToken.startsWith('ExpoPushToken['))) return;

  try {
    await axios.post('https://exp.host/--/api/v2/push/send', {
      to: pushToken,
      title: title || 'Merge Notification',
      body: message,
      data: { redirect_url: redirectUrl, id: notifId },
      sound: 'default',
      priority: priority === 'critical' ? 'high' : 'default'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`[Expo Push] Dispatched push payload to ${pushToken}`);
  } catch (err) {
    console.error('[Expo Push Error]:', err?.response?.data || err.message);
  }
};

export const initNotificationSockets = (io) => {
  ioInstance = io;
  console.log('Initializing Real-Time Notification Socket Rooms...');

  io.on('connection', (socket) => {
    socket.on('authenticate', async (data) => {
      try {
        const userId = data.id || data.userId || data.sub;
        const role = data.role;
        const organization_id = data.organization_id || data.orgId;
        const year = data.year;
        const stream = data.stream;

        if (!userId || !role) {
          console.warn('[Socket Auth Warning]: Received authenticate without userId or role', data);
          return;
        }

        const userRoom = `user_${role}_${userId}`;
        socket.join(userRoom);
        console.log(`Socket ${socket.id} joined ${userRoom}`);

        if (organization_id) {
          const roleRoom = `role_${role}_${organization_id}`;
          socket.join(roleRoom);
          console.log(`Socket ${socket.id} joined ${roleRoom}`);

          const orgRoom = `org_${organization_id}`;
          socket.join(orgRoom);
          console.log(`Socket ${socket.id} joined ${orgRoom}`);

          if (role === 'student' && year) {
            const slugStream = slugifyStream(stream);
            const cohortRoom = `student_${organization_id}_${year}_${slugStream}`;
            socket.join(cohortRoom);
            console.log(`Socket ${socket.id} joined ${cohortRoom}`);
          }
        }

        // Perform Offline Unread Sync
        const unreadRes = await pool.query(
          `SELECT id, receiver_id, receiver_role, sender_id, sender_name, sender_image, type, session_type, priority, title, message, metadata, redirect_url, organization_id, is_read, created_at 
           FROM notifications 
           WHERE receiver_id = $1 AND receiver_role = $2 AND is_read = false 
           ORDER BY created_at DESC LIMIT 50`,
          [userId, role]
        );

        if (unreadRes.rows.length > 0) {
          socket.emit('unread_sync', { notifications: unreadRes.rows, unreadCount: unreadRes.rows.length });
          console.log(`Dispatched ${unreadRes.rows.length} unread notifications to ${userRoom}`);
        }
      } catch (err) {
        console.error('[Socket Auth Error]:', err.message);
      }
    });

    socket.on('mark_read', async (data) => {
      try {
        const notifId = data.notificationId || data.id;
        const uId = data.userId || data.id;
        const role = data.role;
        if (notifId && uId && role) {
          await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND receiver_id = $2 AND receiver_role = $3', [notifId, uId, role]);
        }
      } catch (err) {
        console.error('[Socket Mark Read Error]:', err.message);
      }
    });
  });
};

export const sendDirectNotification = async ({
  receiver_id,
  receiver_role,
  sender_id = null,
  sender_name = 'System',
  sender_image = null,
  type = 'system-alert',
  session_type = 'system',
  priority = 'normal',
  title,
  message,
  metadata = null,
  redirect_url = null,
  organization_id = null,
  expires_in_days = 30
}) => {
  try {
    const expiryClause = expires_in_days ? `NOW() + INTERVAL '${expires_in_days} days'` : 'NULL';
    const result = await pool.query(
      `INSERT INTO notifications (
         receiver_id, receiver_role, sender_id, sender_name, sender_image, type, session_type, priority, title, message, metadata, redirect_url, organization_id, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, ${expiryClause}) RETURNING *`,
      [receiver_id, receiver_role, sender_id, sender_name, sender_image, type, session_type, priority, title, message, JSON.stringify(metadata), redirect_url, organization_id]
    );

    const newNotif = result.rows[0];
    if (ioInstance) {
      ioInstance.to(`user_${receiver_role}_${receiver_id}`).emit('notification', newNotif);
    }

    // Dispatch Native Push
    const table = receiver_role === 'student' ? 'students' : 'users';
    const tokenRes = await pool.query(`SELECT push_token FROM ${table} WHERE id = $1`, [receiver_id]);
    if (tokenRes.rows.length > 0 && tokenRes.rows[0].push_token) {
      dispatchExpoPush(tokenRes.rows[0].push_token, title, message, redirect_url, priority, newNotif.id);
    }

    return newNotif;
  } catch (err) {
    console.error('[sendDirectNotification Error]:', err.message);
    return null;
  }
};

export const sendCohortNotification = async ({
  organization_id,
  year,
  stream,
  sender_id = null,
  sender_name = 'Faculty',
  sender_image = null,
  type = 'custom-session',
  session_type = 'custom',
  priority = 'important',
  title,
  message,
  metadata = null,
  redirect_url = null,
  expires_in_days = 30
}) => {
  try {
    const studentsRes = await pool.query(
      `SELECT id, push_token FROM students WHERE organization_id = $1 AND year::int = $2::int AND LOWER(stream) = LOWER($3) AND status = 'active'`,
      [organization_id, year, stream]
    );

    if (studentsRes.rows.length === 0) return;

    const values = [];
    const params = [];
    let paramIdx = 1;
    const metaStr = JSON.stringify(metadata);

    studentsRes.rows.forEach(st => {
      values.push(`($${paramIdx}, 'student', $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4}, $${paramIdx+5}, $${paramIdx+6}, $${paramIdx+7}, $${paramIdx+8}, $${paramIdx+9}::jsonb, $${paramIdx+10}, $${paramIdx+11}, NOW() + INTERVAL '${expires_in_days} days')`);
      params.push(st.id, sender_id, sender_name, sender_image, type, session_type, priority, title, message, metaStr, redirect_url, organization_id);
      paramIdx += 12;
    });

    if (values.length > 0) {
      await pool.query(
        `INSERT INTO notifications (
           receiver_id, receiver_role, sender_id, sender_name, sender_image, type, session_type, priority, title, message, metadata, redirect_url, organization_id, expires_at
         ) VALUES ${values.join(', ')}`,
        params
      );
    }

    if (ioInstance) {
      const slugStream = slugifyStream(stream);
      const broadcastRoom = `student_${organization_id}_${year}_${slugStream}`;
      ioInstance.to(broadcastRoom).emit('cohort_notification', {
        sender_id, sender_name, sender_image, type, session_type, priority, title, message, metadata, redirect_url, organization_id, created_at: new Date()
      });
    }

    // Dispatch Native Push to all students in cohort
    studentsRes.rows.forEach(st => {
      if (st.push_token) {
        dispatchExpoPush(st.push_token, title, message, redirect_url, priority, null);
      }
    });
  } catch (err) {
    console.error('[sendCohortNotification Error]:', err.message);
  }
};

export const sendRoleNotification = async ({
  role,
  organization_id,
  sender_id = null,
  sender_name = 'System',
  sender_image = null,
  type = 'system-alert',
  session_type = 'system',
  priority = 'important',
  title,
  message,
  metadata = null,
  redirect_url = null,
  expires_in_days = 30
}) => {
  try {
    const usersRes = await pool.query(
      `SELECT id, push_token FROM users WHERE role = $1 AND organization_id = $2 AND is_active = true`,
      [role, organization_id]
    );

    if (usersRes.rows.length === 0) return;

    const values = [];
    const params = [];
    let paramIdx = 1;
    const metaStr = JSON.stringify(metadata);

    usersRes.rows.forEach(u => {
      values.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4}, $${paramIdx+5}, $${paramIdx+6}, $${paramIdx+7}, $${paramIdx+8}, $${paramIdx+9}, $${paramIdx+10}::jsonb, $${paramIdx+11}, $${paramIdx+12}, NOW() + INTERVAL '${expires_in_days} days')`);
      params.push(u.id, role, sender_id, sender_name, sender_image, type, session_type, priority, title, message, metaStr, redirect_url, organization_id);
      paramIdx += 13;
    });

    if (values.length > 0) {
      await pool.query(
        `INSERT INTO notifications (
           receiver_id, receiver_role, sender_id, sender_name, sender_image, type, session_type, priority, title, message, metadata, redirect_url, organization_id, expires_at
         ) VALUES ${values.join(', ')}`,
        params
      );
    }

    if (ioInstance) {
      const broadcastRoom = `role_${role}_${organization_id}`;
      ioInstance.to(broadcastRoom).emit('role_notification', {
        receiver_role: role, sender_id, sender_name, sender_image, type, session_type, priority, title, message, metadata, redirect_url, organization_id, created_at: new Date()
      });
    }

    // Dispatch Native Push to all users in role
    usersRes.rows.forEach(u => {
      if (u.push_token) {
        dispatchExpoPush(u.push_token, title, message, redirect_url, priority, null);
      }
    });
  } catch (err) {
    console.error('[sendRoleNotification Error]:', err.message);
  }
};

export const cleanupExpiredNotifications = async () => {
  try {
    const { rowCount } = await pool.query('DELETE FROM notifications WHERE expires_at < NOW()');
    if (rowCount > 0) {
      console.log(`[Notification Cleanup]: Archived/Deleted ${rowCount} expired notification(s).`);
    }
  } catch (err) {
    console.error('[cleanupExpiredNotifications Error]:', err.message);
  }
};
