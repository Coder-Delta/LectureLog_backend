import express from 'express';
import axios from 'axios';
import pool from '../config/database.config.js';

const router = express.Router();

// Get all active organizations
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, name, slug, primary_color, logo_url FROM organizations WHERE status = 'active' ORDER BY name ASC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});


router.get('/master-list', async (req, res) => {
  let { name, country } = req.query;
  try {
    // Sanitize: Remove special characters like parentheses
    let searchQuery = (name || '').replace(/[()]/g, '').trim();

    // Handle common abbreviations
    const abbreviations = {
      'iit': 'Indian Institute of Technology',
      'nit': 'National Institute of Technology',
      'mit': 'Massachusetts Institute of Technology'
    };

    Object.keys(abbreviations).forEach(abbr => {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      searchQuery = searchQuery.replace(regex, abbreviations[abbr]);
    });

    let url = `https://universities.hipolabs.com/search?name=${encodeURIComponent(searchQuery)}`;
    if (country) {
      url += `&country=${encodeURIComponent(country)}`;
    }
    
    console.log(`[AUTH] Searching global database: ${url}`);
    const response = await axios.get(url, { 
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    // Map to a cleaner format
    const results = response.data.map(uni => ({
      name: uni.name,
      domain: uni.domains[0] || 'unknown.edu',
      country: uni.country,
      website: uni.web_pages[0] || ''
    }));

    res.json(results.slice(0, 20));
  } catch (err) {
    console.error(`[AUTH] Global search failed: ${err.code || err.message}`);
    if (err.response) {
      console.error(`[AUTH] API Response Error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
    }
    
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ message: 'Global database timed out. Please try again.' });
    }
    res.status(500).json({ message: `Failed to fetch global list: ${err.message}` });
  }
});

// Officially onboard a college from the master list
router.post('/onboard', async (req, res) => {
  const { name, domain, primary_color } = req.body;
  try {
    const slug = domain.replace('.', '-');
    const result = await pool.query(
      'INSERT INTO organizations (name, slug, primary_color, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, slug, primary_color || '#105934', 'active']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Onboarding failed' });
  }
});

export default router;
