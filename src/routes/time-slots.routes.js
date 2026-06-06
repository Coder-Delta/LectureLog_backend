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
       WHERE valid_from <= $1::date + interval '6 days'
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

    // ── Overlap check: find any active slot whose time range overlaps ──
    const { rows: overlapping } = await pool.query(
      `SELECT * FROM time_slots
       WHERE valid_from <= $1::date + interval '6 days'
         AND (valid_until IS NULL OR $1::date < valid_until)
         AND raw_start < $2 AND raw_end > $3`,
      [targetDate, raw_end, raw_start]
    );
    if (overlapping.length > 0) {
      const clash = overlapping[0];
      return res.status(409).json({
        success: false,
        message: `Time slot overlaps with existing slot ${clash.start_time} – ${clash.end_time}. Please choose a different time range.`
      });
    }

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

// PUT (update) a time slot by ID
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { start_time, end_time, raw_start, raw_end, week_start } = req.body;
  try {
    const targetDate = week_start ? week_start : new Date().toISOString().split('T')[0];
    
    // 1. Get the original time slot
    const { rows: slotRows } = await pool.query('SELECT * FROM time_slots WHERE id = $1', [id]);
    if (slotRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Time slot not found' });
    }
    const oldSlot = slotRows[0];

    // 2. Overlap check: find any OTHER active slot whose time range overlaps the new times
    const { rows: overlapping } = await pool.query(
      `SELECT * FROM time_slots
       WHERE id != $1
         AND valid_from <= $2::date + interval '6 days'
         AND (valid_until IS NULL OR $2::date < valid_until)
         AND raw_start < $3 AND raw_end > $4`,
      [id, targetDate, raw_end, raw_start]
    );
    if (overlapping.length > 0) {
      const clash = overlapping[0];
      return res.status(409).json({
        success: false,
        message: `Time slot overlaps with existing slot ${clash.start_time} – ${clash.end_time}. Please choose a different time range.`
      });
    }
    
    // 3. Soft-delete the old time slot starting from targetDate
    await pool.query(
      'UPDATE time_slots SET valid_until = $1 WHERE id = $2',
      [targetDate, id]
    );

    // 4. Create the new time slot starting from targetDate
    const newSlotRes = await pool.query(
      'INSERT INTO time_slots (start_time, end_time, raw_start, raw_end, valid_from) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [start_time, end_time, raw_start, raw_end, targetDate]
    );
    const newSlot = newSlotRes.rows[0];

    // 5. Update all schedules in this slot starting from targetDate to use the new times
    const oldRawStartHM = oldSlot.raw_start.substring(0, 5);
    const { rows: activeSchedules } = await pool.query(
      `SELECT * FROM schedules 
       WHERE start_time::text LIKE $1 
         AND (valid_until IS NULL OR valid_until > $2::date)`,
      [`${oldRawStartHM}%`, targetDate]
    );

    for (const schedule of activeSchedules) {
      // Soft-delete the old schedule starting from targetDate
      await pool.query(
        'UPDATE schedules SET valid_until = $1 WHERE id = $2',
        [targetDate, schedule.id]
      );

      // Insert new schedule with new start/end times and valid_from = targetDate
      await pool.query(
        'INSERT INTO schedules (subject_id, classroom_id, teacher_id, day_of_week, start_time, end_time, year, camera_id, stream, organization_id, valid_from) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [
          schedule.subject_id,
          schedule.classroom_id,
          schedule.teacher_id,
          schedule.day_of_week,
          raw_start,
          raw_end,
          schedule.year,
          schedule.camera_id,
          schedule.stream,
          schedule.organization_id,
          targetDate
        ]
      );
    }

    res.status(200).json({ success: true, message: 'Time slot updated successfully', slot: newSlot });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
