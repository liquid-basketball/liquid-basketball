const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

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
                image_url TEXT,
                target_page TEXT,
                date TEXT
            );
        `);
        
        // Minor migrations just in case the table already exists without the new columns
        try { await pool.query(`ALTER TABLE posts ADD COLUMN image_url TEXT;`); } catch(e) {}
        try { await pool.query(`ALTER TABLE posts ADD COLUMN target_page TEXT DEFAULT 'both';`); } catch(e) {}
        
    } catch (err) {
        console.error('Database init error:', err.message);
    }
};
initDb();

app.use(cors());
app.use(express.json());

const getFilePath = (fileName) => {
    const publicPath = path.join(__dirname, 'public', fileName);
    if (fs.existsSync(publicPath)) return publicPath;
    return path.join(__dirname, fileName);
};

// Check Admin Password for Save/Delete actions
const requireAdminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const adminPassword = process.env.ADMIN_PASSWORD || 'Baller1!';

    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const password = auth[1];

    if (password === adminPassword) {
        return next();
    } else {
        return res.status(401).json({ error: 'Incorrect password' });
    }
};

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

app.get('/admin-secret-portal.html', (req, res) => {
    res.sendFile(getFilePath('admin-secret-portal.html'));
});

// Protected routes (Require password)
app.post('/api/cms', requireAdminAuth, async (req, res) => {
    const cmsData = req.body;
    try {
        for (const [key, value] of Object.entries(cmsData)) {
            await pool.query(
                'INSERT INTO cms_settings (id, content) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET content = $2',
                [key, value]
            );
        }
        res.json({ message: 'CMS saved!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/posts', requireAdminAuth, async (req, res) => {
    // Added imageUrl and targetPage to the destructured body
    const { title, content, videoUrl, imageUrl, targetPage, date } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO posts (title, content, video_url, image_url, target_page, date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [title, content, videoUrl, imageUrl, targetPage || 'both', date]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/posts/:id', requireAdminAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
        res.json({ message: 'Post deleted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Public read-only routes
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

app.get('*', (req, res) => {
    res.sendFile(getFilePath('index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
