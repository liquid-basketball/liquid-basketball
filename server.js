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

// ----------------------------------------------------
// Middleware: Password Protection for Admin Routes
// ----------------------------------------------------
const requireAdminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const adminPassword = process.env.ADMIN_PASSWORD || 'Baller1!'; // Default fallback

    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Authentication required.');
    }

    // Decode basic auth header (Username:Password)
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const password = auth[1];

    if (password === adminPassword) {
        return next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Incorrect password! Please check uppercase/lowercase characters.');
    }
};

// Protect the admin HTML page
app.get('/admin-secret-portal.html', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-secret-portal.html'));
});

// Protect POST/DELETE endpoints so public users can't publish or delete
app.post('/api/cms', requireAdminAuth, async (req, res) => {
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

app.post('/api/posts', requireAdminAuth, async (req, res) => {
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

app.delete('/api/posts/:id', requireAdminAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
        res.json({ message: 'Post deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------------------------------------------
// Public Static Files & Public API Routes
// ----------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// Fetch CMS Data (Public)
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

// Fetch Blog Posts (Public)
app.get('/api/posts', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM posts ORDER BY id DESC');
        res.json(rows);
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
