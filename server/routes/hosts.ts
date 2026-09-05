import { Router } from 'express';
import { pool } from '../db';

const router = Router();

// Verify/login with a host code
router.post('/login', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || code.length !== 6) {
      res.status(400).json({ error: 'Host code must be exactly 6 characters' });
      return;
    }

    // Check if host code exists
    const result = await pool.query(
      'SELECT id, code, created_at FROM hosts WHERE code = $1 AND is_active = TRUE',
      [code]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Host code not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Hosts] Failed to login:', err);
    res.status(500).json({ error: 'Failed to verify host code' });
  }
});

// Get host info by code
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(
      'SELECT id, code, created_at FROM hosts WHERE code = $1 AND is_active = TRUE',
      [code]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Host not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Hosts] Failed to get host:', err);
    res.status(500).json({ error: 'Failed to get host' });
  }
});

export default router;
