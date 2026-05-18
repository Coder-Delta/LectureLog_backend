import pool from '../config/database.config.js';

export const getMyNotifications = async (req, res) => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  if (userId === undefined || !role) {
    return res.status(401).json({ message: 'Unauthorized access' });
  }

  try {
    const { rows: notifications } = await pool.query(
      `SELECT * FROM notifications 
       WHERE receiver_id = $1 AND receiver_role = $2 
       ORDER BY created_at DESC 
       LIMIT $3 OFFSET $4`,
      [userId, role, limit, offset]
    );

    const { rows: countRow } = await pool.query(
      `SELECT COUNT(*) FROM notifications 
       WHERE receiver_id = $1 AND receiver_role = $2 AND is_read = false`,
      [userId, role]
    );

    const unreadCount = parseInt(countRow[0].count) || 0;

    res.json({
      notifications,
      unreadCount
    });
  } catch (err) {
    console.error('[getMyNotifications Error]:', err.message);
    res.status(500).json({ message: 'Failed to fetch notifications', error: err.message });
  }
};

export const markAsRead = async (req, res) => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const { id } = req.params;

  if (userId === undefined || !role) {
    return res.status(401).json({ message: 'Unauthorized access' });
  }

  try {
    const { rowCount } = await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND receiver_id = $2 AND receiver_role = $3',
      [id, userId, role]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Notification not found or unauthorized' });
    }

    res.json({ message: 'Notification marked as read successfully' });
  } catch (err) {
    console.error('[markAsRead Error]:', err.message);
    res.status(500).json({ message: 'Failed to mark notification read', error: err.message });
  }
};

export const markAllAsRead = async (req, res) => {
  const userId = req.user?.id;
  const role = req.user?.role;

  if (userId === undefined || !role) {
    return res.status(401).json({ message: 'Unauthorized access' });
  }

  try {
    const { rowCount } = await pool.query(
      'UPDATE notifications SET is_read = true WHERE receiver_id = $1 AND receiver_role = $2 AND is_read = false',
      [userId, role]
    );

    res.json({ message: `Successfully marked ${rowCount} notification(s) as read` });
  } catch (err) {
    console.error('[markAllAsRead Error]:', err.message);
    res.status(500).json({ message: 'Failed to mark all notifications read', error: err.message });
  }
};

export const deleteNotification = async (req, res) => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const { id } = req.params;

  if (userId === undefined || !role) {
    return res.status(401).json({ message: 'Unauthorized access' });
  }

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND receiver_id = $2 AND receiver_role = $3',
      [id, userId, role]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Notification not found or unauthorized' });
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (err) {
    console.error('[deleteNotification Error]:', err.message);
    res.status(500).json({ message: 'Failed to delete notification', error: err.message });
  }
};

export const clearAllReadNotifications = async (req, res) => {
  const userId = req.user?.id;
  const role = req.user?.role;

  if (userId === undefined || !role) {
    return res.status(401).json({ message: 'Unauthorized access' });
  }

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM notifications WHERE receiver_id = $1 AND receiver_role = $2 AND is_read = true',
      [userId, role]
    );

    res.json({ message: `Successfully cleared ${rowCount} read notification(s)` });
  } catch (err) {
    console.error('[clearAllReadNotifications Error]:', err.message);
    res.status(500).json({ message: 'Failed to clear read notifications', error: err.message });
  }
};

export const savePushToken = async (req, res) => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const { pushToken } = req.body;

  if (userId === undefined || !role || !pushToken) {
    return res.status(400).json({ message: 'Missing push token or authentication' });
  }

  try {
    const table = role === 'student' ? 'students' : 'users';
    await pool.query(`UPDATE ${table} SET push_token = $1 WHERE id = $2`, [pushToken, userId]);
    res.json({ message: 'Push token saved successfully' });
  } catch (err) {
    console.error('[savePushToken Error]:', err.message);
    res.status(500).json({ message: 'Failed to save push token', error: err.message });
  }
};

