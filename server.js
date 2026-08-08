const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to Cloud Database (Supabase)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Auto-create database tables if they do not exist
const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cms_settings (
                id TEXT PRIMARY KEY,
                content TEXT
            );
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                title TEXT,
                content TEXT,
                video_url TEXT,
                date TEXT
            );
        `);
        console.log('Database tables verified/created.');
    } catch (err) {
        console.error('Database init error:', err.message);
    }
};
initDb();

app.use(cors());
app.use(express.json());

// Helper function to find HTML files whether they are in root or public/
const getFilePath = (fileName) => {
    const publicPath = path.join(__dirname, 'public', fileName);
    if (fs.existsSync(publicPath)) {
        return publicPath;
    }
    return path.join(__dirname, fileName);
};

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

    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const password = auth[1];

    if (password === adminPassword) {
        return next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Incorrect password!');
    }
};

// Protect the admin HTML page
app.get('/admin-secret-portal.html', requireAdminAuth, (req, res) => {
    res.sendFile(getFilePath('admin-secret-portal.html'));
});

// Protect POST/DELETE endpoints
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
// Serve static assets from both public and root directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

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

app.get('/api/posts', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM posts ORDER BY id DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Catch-all route to serve the main frontend
app.get('*', (req, res) => {
    res.sendFile(getFilePath('index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
