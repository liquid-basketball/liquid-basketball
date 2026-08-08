const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Higher payload limit for base64 photo uploads
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to verify admin password
async function verifyAdmin(req, res, next) {
    const authHeader = req.headers['x-admin-password'];
    try {
        const { rows } = await pool.query('SELECT content FROM cms_settings WHERE id = $1', ['admin_password']);
        const currentPassword = rows.length > 0 ? rows[0].content : 'Baller1!';
        
        if (authHeader === currentPassword) {
            next();
        } else {
            res.status(401).json({ error: 'Unauthorized: Incorrect Password' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// Check Auth Endpoint
app.post('/api/admin/verify', verifyAdmin, (req, res) => {
    res.json({ success: true });
});

// Update Admin Password
app.post('/api/admin/change-password', verifyAdmin, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password required.' });

    try {
        await pool.query(
            'INSERT INTO cms_settings (id, content) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET content = $2',
            ['admin_password', newPassword]
        );
        res.json({ message: 'Password updated successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch CMS Settings
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

// Save CMS Settings (Protected)
app.post('/api/cms', verifyAdmin, async (req, res) => {
    const cmsData = req.body;
    try {
        for (const [key, value] of Object.entries(cmsData)) {
            if (key === 'admin_password') continue; // Managed separately
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

// Fetch Posts (Filterable by target_page)
app.get('/api/posts', async (req, res) => {
    const page = req.query.page;
    try {
        let query = 'SELECT * FROM posts ORDER BY id DESC';
        let params = [];
        if (page) {
            query = 'SELECT * FROM posts WHERE target_page = $1 OR target_page = \'both\' ORDER BY id DESC';
            params = [page];
        }
        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Post (Protected)
app.post('/api/posts', verifyAdmin, async (req, res) => {
    const { title, content, videoUrl, imageUrl, targetPage, date } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO posts (title, content, video_url, image_url, target_page, date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [title, content, videoUrl, imageUrl, targetPage || 'news', date]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Post (Protected)
app.delete('/api/posts/:id', verifyAdmin, async (req, res) => {
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
