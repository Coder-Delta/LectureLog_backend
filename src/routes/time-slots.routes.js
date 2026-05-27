import express from 'express';
import pool from '../config/database.config.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

// GET all time slots
router.get('/', async (req, res) => {
  const { week_start } = req.query;
  try {
    const targetDate = week_start ? week_start : new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT * FROM time_slots 
       WHERE valid_from <= $1::date 
         AND (valid_until IS NULL OR $1::date < valid_until) 
       ORDER BY id ASC`,
      [targetDate]
    );
    console.log(`[TimeSlots] Fetched ${result.rows.length} slots for week_start ${targetDate}`);
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST a new time slot
router.post('/', authenticateToken, async (req, res) => {
  const { start_time, end_time, raw_start, raw_end, week_start } = req.body;
  try {
    const targetDate = week_start ? week_start : new Date().toISOString().split('T')[0];
    const result = await pool.query(
      'INSERT INTO time_slots (start_time, end_time, raw_start, raw_end, valid_from) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [start_time, end_time, raw_start, raw_end, targetDate]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE a time slot by ID
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { week_start } = req.query;
  try {
    const targetDate = week_start ? week_start : new Date().toISOString().split('T')[0];
    
    // 1. Get the time slot to find raw_start
    const { rows: slotRows } = await pool.query('SELECT * FROM time_slots WHERE id = $1', [id]);
    if (slotRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Time slot not found' });
    }
    const slot = slotRows[0];
    
    // 2. Soft-delete the time slot
    await pool.query(
      'UPDATE time_slots SET valid_until = $1 WHERE id = $2',
      [targetDate, id]
    );

    // 3. Find and deactivate all active schedules in this time slot
    const rawStartHM = slot.raw_start.substring(0, 5);
    const { rows: updatedSchedules } = await pool.query(
      `UPDATE schedules 
       SET valid_until = $1 
       WHERE start_time::text LIKE $2 
         AND (valid_until IS NULL OR valid_until > $1::date)
       RETURNING *`,
      [targetDate, `${rawStartHM}%`]
    );

    // 4. Record snapshot history 'deleted' entries for each deactivated schedule
    for (const schedule of updatedSchedules) {
      const { rows: classRows } = await pool.query('SELECT camera_name FROM classrooms WHERE id = $1', [schedule.classroom_id]);
      const cameraName = classRows[0]?.camera_name || null;

      await pool.query(`
        INSERT INTO timetable_week_entries (
          week_start, entry_date, source_type, source_id, action,
          subject_id, classroom_id, teacher_id, day_of_week, start_time, end_time,
          year, stream, camera_id, camera_name, created_by, organization_id
        )
        VALUES (
          $1::date,
          $1::date + (
            CASE $2
              WHEN 'Monday' THEN 0
              WHEN 'Tuesday' THEN 1
              WHEN 'Wednesday' THEN 2
              WHEN 'Thursday' THEN 3
              WHEN 'Friday' THEN 4
              WHEN 'Saturday' THEN 5
              ELSE 6
            END
          ),
          'regular', $3, 'deleted', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
      `, [
        targetDate,
        schedule.day_of_week,
        schedule.id,
        schedule.subject_id,
        schedule.classroom_id,
        schedule.teacher_id,
        schedule.day_of_week,
        schedule.start_time,
        schedule.end_time,
        schedule.year,
        schedule.stream,
        schedule.camera_id,
        cameraName,
        req.user?.id || null,
        schedule.organization_id
      ]);
    }

    res.status(200).json({ success: true, message: 'Time slot deleted successfully and associated schedules deactivated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
