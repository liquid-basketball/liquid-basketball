'use strict';
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const compression = require('compression');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'site-media';

if (!ADMIN_PASSWORD) console.warn('WARNING: ADMIN_PASSWORD is not set. Admin mutations will be disabled.');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) console.warn('WARNING: Supabase server credentials are missing. CMS API will be unavailable until configured.');

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

app.disable('x-powered-by');
app.use(compression());
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'", 'https://www.youtube.com', 'https://player.vimeo.com', 'https://fake-ballers-basketball-league.onrender.com', 'https://fake-ballers-football-league.onrender.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(PUBLIC_DIR, { maxAge: '1h', etag: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'ADMIN_PASSWORD is not configured.' });
  if (!safeEqual(req.get('x-admin-key'), ADMIN_PASSWORD)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function requireDb(res) {
  if (!supabase) { res.status(503).json({ error: 'Supabase is not configured.' }); return false; }
  return true;
}
function cleanBaseName(name='file') {
  return String(name).normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^[-.]+|[-.]+$/g,'').slice(-100) || 'file';
}
async function ensureBucket() {
  if (!supabase) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 12 * 1024 * 1024 });
    if (error && !/already exists/i.test(error.message)) console.error('Storage bucket:', error.message);
  }
}
async function storeFile(file, folder) {
  if (!file) return null;
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}-${cleanBaseName(file.originalname)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, file.buffer, { contentType: file.mimetype, upsert: false, cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return data.publicUrl;
}
function isImage(file) { return !!file && ['image/jpeg','image/png','image/webp'].includes(file.mimetype); }
function isAdAsset(file) { return !!file && (isImage(file) || file.mimetype === 'application/pdf'); }
function sanitizeTarget(v) { return ['home','news','both'].includes(v) ? v : 'both'; }
function sanitizeType(v) { return ['news','photo','video'].includes(v) ? v : 'news'; }
function sanitizePlacement(v) { return ['side','bottom'].includes(v) ? v : 'side'; }

app.get('/api/health', (_req,res)=>res.json({ok:true}));
app.post('/api/admin/auth', requireAdmin, (_req,res)=>res.json({ok:true}));

app.get('/api/cms', async (_req,res) => {
  if (!requireDb(res)) return;
  const { data, error } = await supabase.from('site_cms').select('key,value');
  if (error) return res.status(500).json({ error: error.message });
  res.json(Object.fromEntries((data || []).map(r => [r.key, r.value])));
});

app.get('/api/posts', async (_req,res) => {
  if (!requireDb(res)) return;
  const { data, error } = await supabase.from('site_posts').select('*').eq('published',true).order('created_at',{ascending:false});
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/ads', async (_req,res) => {
  if (!requireDb(res)) return;
  const { data, error } = await supabase.from('site_ads').select('*').eq('active',true).order('created_at',{ascending:false});
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.get('/api/admin/posts', requireAdmin, async (_req,res) => {
  if (!requireDb(res)) return;
  const { data, error } = await supabase.from('site_posts').select('*').order('created_at',{ascending:false});
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});
app.get('/api/admin/ads', requireAdmin, async (_req,res) => {
  if (!requireDb(res)) return;
  const { data, error } = await supabase.from('site_ads').select('*').order('created_at',{ascending:false});
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/admin/cms', requireAdmin, async (req,res) => {
  if (!requireDb(res)) return;
  const allowed = ['cms-hero-sub','cms-news-sub','cms-youtube-url'];
  const rows = allowed.filter(k => Object.prototype.hasOwnProperty.call(req.body,k)).map(k => ({ key:k, value:String(req.body[k] || '').slice(0,4000), updated_at:new Date().toISOString() }));
  const { error } = await supabase.from('site_cms').upsert(rows,{onConflict:'key'});
  if (error) return res.status(500).json({ error:error.message });
  res.json({ok:true});
});

app.post('/api/admin/posts', requireAdmin, upload.single('image'), async (req,res) => {
  if (!requireDb(res)) return;
  try {
    if (req.file && !isImage(req.file)) return res.status(400).json({ error:'Post photos must be JPG, PNG, or WebP.' });
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error:'Title is required.' });
    const imageUrl = req.file ? await storeFile(req.file,'posts') : null;
    const row = {
      title: title.slice(0,180),
      content: String(req.body.content || '').slice(0,30000),
      category: String(req.body.category || 'News').slice(0,80),
      content_type: sanitizeType(req.body.content_type),
      target_page: sanitizeTarget(req.body.target_page),
      image_url: imageUrl,
      image_alt: String(req.body.image_alt || '').slice(0,300),
      video_url: String(req.body.video_url || '').slice(0,1200),
      published: true
    };
    const { data, error } = await supabase.from('site_posts').insert(row).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message || 'Post upload failed.' }); }
});

app.post('/api/admin/ads', requireAdmin, upload.single('asset'), async (req,res) => {
  if (!requireDb(res)) return;
  try {
    if (!isAdAsset(req.file)) return res.status(400).json({ error:'Ad asset must be JPG, PNG, WebP, or PDF.' });
    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error:'Ad title is required.' });
    const assetUrl = await storeFile(req.file,'ads');
    const row = {
      title: title.slice(0,140),
      placement: sanitizePlacement(req.body.placement),
      asset_url: assetUrl,
      asset_type: req.file.mimetype,
      link_url: String(req.body.link_url || '').slice(0,1200),
      alt_text: String(req.body.alt_text || title).slice(0,300),
      active: true
    };
    const { data, error } = await supabase.from('site_ads').insert(row).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message || 'Ad upload failed.' }); }
});

app.delete('/api/admin/posts/:id', requireAdmin, async (req,res) => {
  if (!requireDb(res)) return;
  const { error } = await supabase.from('site_posts').delete().eq('id',req.params.id);
  if (error) return res.status(500).json({ error:error.message });
  res.json({ok:true});
});
app.delete('/api/admin/ads/:id', requireAdmin, async (req,res) => {
  if (!requireDb(res)) return;
  const { error } = await supabase.from('site_ads').delete().eq('id',req.params.id);
  if (error) return res.status(500).json({ error:error.message });
  res.json({ok:true});
});

app.use((err,_req,res,_next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large. Maximum 12 MB.' : err.message });
  console.error(err);
  res.status(500).json({ error:'Server error.' });
});

app.get('*', (_req,res)=>res.sendFile(path.join(PUBLIC_DIR,'index.html')));

ensureBucket().catch(err=>console.error('Bucket setup:',err.message));
app.listen(PORT,()=>console.log(`Liquid Sports website listening on ${PORT}`));
