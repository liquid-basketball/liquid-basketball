const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to Cloud Database (Supabase)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fetch CMS Data
app.get('/api/cms', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT id, content FROM cms_settings');
        const cmsData = {};
        rows.forEach(row => cmsData[row.id] = row.content);
        res.json(cmsData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save CMS Data
app.post('/api/cms', async (req, res) => {
    const cmsData = req.body;
    try {
        for (const [key, value] of Object.entries(cmsData)) {
            await pool.query(
                'INSERT INTO cms_settings (id, content) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET content = $2',
                [key, value]
            );
        }
        res.json({ message: 'CMS saved permanently!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch Blog Posts
app.get('/api/posts', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM posts ORDER BY id DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Blog Post
app.post('/api/posts', async (req, res) => {
    const { title, content, videoUrl, date } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO posts (title, content, video_url, date) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, content, videoUrl, date]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Blog Post
app.delete('/api/posts/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
        res.json({ message: 'Post deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});