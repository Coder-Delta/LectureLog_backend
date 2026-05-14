import express from 'express';
import pool from '../config/database.config.js';

const router = express.Router();

// GET all time slots
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM time_slots ORDER BY id ASC');
    console.log(`[TimeSlots] Fetched ${result.rows.length} slots`);
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST a new time slot
router.post('/', async (req, res) => {
  const { start_time, end_time, raw_start, raw_end } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO time_slots (start_time, end_time, raw_start, raw_end) VALUES ($1, $2, $3, $4) RETURNING *',
      [start_time, end_time, raw_start, raw_end]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE a time slot by ID
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM time_slots WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Time slot deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
