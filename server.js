'use strict';
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { imageSize } = require('image-size');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'site-media';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const supabase = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const BETA_SUPABASE_URL = process.env.BETA_SUPABASE_URL || 'https://fieogjsweqshiichjrel.supabase.co';
const BETA_SERVICE_KEY = process.env.BETA_SUPABASE_SERVICE_ROLE_KEY || '';
const betaSupabase = BETA_SUPABASE_URL && BETA_SERVICE_KEY ? createClient(BETA_SUPABASE_URL, BETA_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(PUBLIC_DIR, { maxAge: process.env.NODE_ENV === 'production' ? '6h' : 0, etag: true }));

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PDF_MAX_BYTES = 12 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PDF_MAX_BYTES, files: 2 } });
const postUpload = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'attachment', maxCount: 1 }]);
const adUpload = upload.single('asset');
const sponsorUpload = upload.single('logo');

function requireDb(res) { if (!supabase) { res.status(503).json({ error: 'CMS database is not configured on this server.' }); return false; } return true; }
function requireBetaDb(res) { if (!betaSupabase) { res.status(503).json({ error: 'Beta results are stored safely in Supabase, but the private admin reader is not configured on this server yet. Add BETA_SUPABASE_SERVICE_ROLE_KEY in Render Environment.' }); return false; } return true; }
function secureEqual(a, b) { const aa = Buffer.from(String(a || '')); const bb = Buffer.from(String(b || '')); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb); }
function requireAdmin(req, res, next) { if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'ADMIN_PASSWORD is not configured in Render.' }); const supplied = req.get('x-admin-password') || req.body?.admin_password || ''; if (!secureEqual(supplied, ADMIN_PASSWORD)) return res.status(401).json({ error: 'Incorrect admin password.' }); next(); }
function cleanBaseName(name='file') { return String(name).normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-120) || 'file'; }
function isImage(file) { return !!file && ['image/jpeg','image/png','image/webp'].includes(file.mimetype); }
function isPdf(file) { return !!file && file.mimetype === 'application/pdf'; }
function validateImageSize(file) { if(file && file.size > IMAGE_MAX_BYTES) throw new Error('Image is too large. Maximum image size is 5 MB.'); }
function validatePdfSize(file) { if(file && file.size > PDF_MAX_BYTES) throw new Error('PDF is too large. Maximum PDF size is 12 MB.'); }
function isYouTubeUrl(v) { const raw=String(v||'').trim(); if(!raw) return true; try { const u=new URL(raw); const h=u.hostname.toLowerCase().replace(/^www\./,''); return h==='youtube.com'||h==='m.youtube.com'||h==='youtu.be'; } catch { return false; } }
function bool(v, fallback=false) { if (v === undefined || v === null) return fallback; return ['true','1','yes','on'].includes(String(v).toLowerCase()); }
function clampText(v, n) { return String(v ?? '').trim().slice(0, n); }
function sanitizeSport(v) { return ['football','basketball','baseball','all'].includes(v) ? v : 'all'; }
function sanitizeType(v) { return ['news','photo','video','media'].includes(v) ? v : 'news'; }
function sanitizePlacement(v) { return ['side','bottom'].includes(v) ? v : 'side'; }
function sanitizeSide(v) { return ['left','right','auto'].includes(v) ? v : 'auto'; }
function sanitizeSponsorTarget(v) { return ['football','basketball','both'].includes(v) ? v : 'both'; }
function isPng(file) { return !!file && file.mimetype === 'image/png'; }
function safeHttpUrl(v, allowRelative=false) { const raw=String(v||'').trim(); if(!raw) return ''; if(allowRelative && raw.startsWith('/')) return raw.slice(0,1200); try { const u=new URL(raw); return ['http:','https:'].includes(u.protocol) ? u.href.slice(0,1200) : ''; } catch { return ''; } }
function isoDate(v) { if(!v) return new Date().toISOString(); const d=new Date(v); return Number.isNaN(d.valueOf()) ? new Date().toISOString() : d.toISOString(); }

async function ensureBucket() {
  if(!supabase) return;
  const { data, error } = await supabase.storage.listBuckets();
  if(error) throw error;
  if(!(data||[]).some(b=>b.name===BUCKET)) {
    const { error:createError } = await supabase.storage.createBucket(BUCKET,{ public:true, fileSizeLimit:12*1024*1024, allowedMimeTypes:['image/jpeg','image/png','image/webp','application/pdf'] });
    if(createError && !/already exists/i.test(createError.message)) throw createError;
  }
}
async function storeFile(file, folder) {
  if(!file) return '';
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}-${cleanBaseName(file.originalname)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(key,file.buffer,{ contentType:file.mimetype,upsert:false,cacheControl:'3600' });
  if(error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}
function getImageDimensions(file) { try { const d=imageSize(file.buffer); return { width:Number(d.width||0),height:Number(d.height||0),ratio:(d.width&&d.height)?d.width/d.height:0 }; } catch { return { width:0,height:0,ratio:0 }; } }
function validateAdCreative(file, placement) {
  if(!file) throw new Error('Choose an ad creative first.');
  if(isPdf(file)) { validatePdfSize(file); return { width:null,height:null,ratio:null }; }
  validateImageSize(file);
  if(!isImage(file)) throw new Error('Ad creative must be JPG, PNG, WebP, or PDF.');
  const d=getImageDimensions(file);
  if(!d.width||!d.height) throw new Error('The image dimensions could not be read.');
  if(placement==='side') {
    if(d.width<120||d.width>900||d.height<300||d.height>2400||d.ratio<0.15||d.ratio>0.50) throw new Error(`Side rail creative is ${d.width}×${d.height}. Use a narrow ad: 120-900 px wide, 300-2400 px tall, aspect ratio 0.15-0.50 (160×600 or a higher-resolution equivalent works well).`);
  } else {
    if(d.width<480||d.width>3000||d.height<60||d.height>800||d.ratio<3.5||d.ratio>14) throw new Error(`Bottom creative is ${d.width}×${d.height}. Use a banner: 480-3000 px wide, 60-800 px tall, aspect ratio 3.5-14.0 (728×90 or 970×90 works well).`);
  }
  return d;
}
function validateExistingAdDimensions(row, placement) {
  if((row.asset_type||'').includes('pdf') || !row.width_px || !row.height_px) return;
  const fake={ width:Number(row.width_px), height:Number(row.height_px), ratio:Number(row.width_px)/Number(row.height_px) };
  if(placement==='side' && (fake.ratio<0.15||fake.ratio>0.50)) throw new Error('That existing creative is not narrow enough for a side rail. Upload a new side-rail creative.');
  if(placement==='bottom' && (fake.ratio<3.5||fake.ratio>14)) throw new Error('That existing creative is not a banner shape. Upload a new bottom-banner creative.');
}

app.get(['/admin','/admin/'], (_req,res)=>res.sendFile(path.join(PUBLIC_DIR,'admin.html')));
app.get('/api/health',(_req,res)=>res.json({ok:true,brand:'Liquid Sports'}));
app.post('/api/admin/auth',requireAdmin,(_req,res)=>res.json({ok:true}));

app.get('/api/cms',async(_req,res)=>{ if(!requireDb(res))return; const {data,error}=await supabase.from('site_cms').select('key,value'); if(error)return res.status(500).json({error:error.message}); res.json(Object.fromEntries((data||[]).map(r=>[r.key,r.value]))); });
app.get('/api/posts',async(_req,res)=>{ if(!requireDb(res))return; const {data,error}=await supabase.from('site_posts').select('*').eq('published',true).order('published_at',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}); if(error)return res.status(500).json({error:error.message}); res.json(data||[]); });
app.get('/api/ads',async(_req,res)=>{ if(!requireDb(res))return; const {data,error}=await supabase.from('site_ads').select('*').eq('active',true).order('created_at',{ascending:false}); if(error)return res.status(500).json({error:error.message}); res.json(data||[]); });

// Public sponsor feed consumed by the Football and Basketball games.
// The CMS/database remain private; only active sponsor display fields are exposed.
app.get('/api/game-sponsors',async(req,res)=>{
  res.set('Access-Control-Allow-Origin','*');
  res.set('Cross-Origin-Resource-Policy','cross-origin');
  res.set('Cache-Control','public, max-age=60');
  if(!requireDb(res))return;
  const game=String(req.query.game||'').toLowerCase();
  if(!['football','basketball'].includes(game)) return res.status(400).json({error:'game must be football or basketball'});
  const {data,error}=await supabase.from('game_sponsors')
    .select('id,name,game_target,category,footwear,offer_text,logo_url,youtube_url,image_card_text,video_card_text,active,updated_at')
    .eq('active',true)
    .in('game_target',[game,'both'])
    .order('updated_at',{ascending:false});
  if(error)return res.status(500).json({error:error.message});
  res.json(data||[]);
});
app.get('/api/admin/beta',requireAdmin,async(req,res)=>{
  if(!requireBetaDb(res))return;
  let q=betaSupabase.from('beta_test_submissions').select('*').order('created_at',{ascending:false}).limit(500);
  const game=String(req.query.game||'').toUpperCase(); if(['FBBL','FBFL','BOTH'].includes(game))q=q.eq('game',game);
  const status=String(req.query.status||'').toUpperCase(); if(['NEW','REVIEWED','RESOLVED'].includes(status))q=q.eq('status',status);
  const {data,error}=await q; if(error)return res.status(500).json({error:error.message}); res.json(data||[]);
});
app.put('/api/admin/beta/:id',requireAdmin,async(req,res)=>{
  if(!requireBetaDb(res))return;
  const status=['NEW','REVIEWED','RESOLVED'].includes(String(req.body?.status||'').toUpperCase())?String(req.body.status).toUpperCase():'REVIEWED';
  const admin_notes=clampText(req.body?.admin_notes,5000);
  const patch={status,admin_notes:admin_notes||null,reviewed_at:status==='NEW'?null:new Date().toISOString()};
  const {data,error}=await betaSupabase.from('beta_test_submissions').update(patch).eq('id',req.params.id).select('*').single();
  if(error)return res.status(500).json({error:error.message}); res.json(data);
});

app.get('/api/admin/posts',requireAdmin,async(_req,res)=>{ if(!requireDb(res))return; const {data,error}=await supabase.from('site_posts').select('*').order('updated_at',{ascending:false}); if(error)return res.status(500).json({error:error.message}); res.json(data||[]); });
app.get('/api/admin/ads',requireAdmin,async(_req,res)=>{ if(!requireDb(res))return; const {data,error}=await supabase.from('site_ads').select('*').order('updated_at',{ascending:false}); if(error)return res.status(500).json({error:error.message}); res.json(data||[]); });

app.get('/api/admin/sponsors',requireAdmin,async(_req,res)=>{
  if(!requireDb(res))return;
  const {data,error}=await supabase.from('game_sponsors').select('*').order('updated_at',{ascending:false});
  if(error)return res.status(500).json({error:error.message});
  res.json(data||[]);
});

app.post('/api/admin/cms',requireAdmin,async(req,res)=>{ if(!requireDb(res))return; const allowed=['cms-hero-sub']; const rows=allowed.filter(k=>Object.prototype.hasOwnProperty.call(req.body,k)).map(k=>({key:k,value:clampText(req.body[k],4000),updated_at:new Date().toISOString()})); if(!rows.length)return res.json({ok:true}); const {error}=await supabase.from('site_cms').upsert(rows,{onConflict:'key'}); if(error)return res.status(500).json({error:error.message}); res.json({ok:true}); });

function buildPostRow(body, existing={}) {
  const has=k=>Object.prototype.hasOwnProperty.call(body,k);
  const row={ updated_at:new Date().toISOString() };
  if(has('title')) row.title=clampText(body.title,180);
  if(has('excerpt')) row.excerpt=clampText(body.excerpt,600);
  if(has('content')) row.content=String(body.content??'').slice(0,30000);
  if(has('category')) row.category=clampText(body.category,80)||'News';
  if(has('content_type')) row.content_type=sanitizeType(body.content_type);
  if(has('sport')) row.sport=sanitizeSport(body.sport);
  if(has('featured')) row.featured=bool(body.featured);
  if(has('published')) row.published=bool(body.published);
  if(has('published_at')) row.published_at=isoDate(body.published_at);
  if(has('image_alt')) row.image_alt=clampText(body.image_alt,300);
  if(has('video_url')) row.video_url=safeHttpUrl(body.video_url);
  if(has('file_url')) row.file_url=safeHttpUrl(body.file_url,true);
  if(has('external_url')) row.external_url=safeHttpUrl(body.external_url);
  row.target_page='both';
  return row;
}

app.post('/api/admin/posts',requireAdmin,postUpload,async(req,res)=>{
  if(!requireDb(res))return;
  try{
    const image=req.files?.image?.[0], attachment=req.files?.attachment?.[0];
    if(image&&!isImage(image)) return res.status(400).json({error:'Featured image must be JPG, PNG, or WebP.'});
    if(attachment&&!isPdf(attachment)) return res.status(400).json({error:'Attachment must be a PDF.'});
    validateImageSize(image); validatePdfSize(attachment);
    if(req.body.video_url && !isYouTubeUrl(req.body.video_url)) return res.status(400).json({error:'Video link must be a YouTube URL.'});
    const row=buildPostRow(req.body);
    if(!row.title) return res.status(400).json({error:'Title is required.'});
    row.excerpt=row.excerpt||''; row.content=row.content||''; row.category=row.category||'News'; row.content_type=row.content_type||'news'; row.sport=row.sport||'all'; row.featured=Object.prototype.hasOwnProperty.call(row,'featured')?row.featured:false; row.published=Object.prototype.hasOwnProperty.call(row,'published')?row.published:true; row.published_at=row.published_at||new Date().toISOString();
    if(image) row.image_url=await storeFile(image,'posts');
    if(attachment) row.file_url=await storeFile(attachment,'posts');
    const {data,error}=await supabase.from('site_posts').insert(row).select().single(); if(error)throw error; res.status(201).json(data);
  }catch(err){res.status(500).json({error:err.message||'Content upload failed.'});}
});

app.put('/api/admin/posts/:id',requireAdmin,postUpload,async(req,res)=>{
  if(!requireDb(res))return;
  try{
    const {data:existing,error:readErr}=await supabase.from('site_posts').select('*').eq('id',req.params.id).single(); if(readErr)throw readErr;
    const image=req.files?.image?.[0], attachment=req.files?.attachment?.[0];
    if(image&&!isImage(image)) return res.status(400).json({error:'Featured image must be JPG, PNG, or WebP.'});
    if(attachment&&!isPdf(attachment)) return res.status(400).json({error:'Attachment must be a PDF.'});
    validateImageSize(image); validatePdfSize(attachment);
    if(req.body.video_url && !isYouTubeUrl(req.body.video_url)) return res.status(400).json({error:'Video link must be a YouTube URL.'});
    const row=buildPostRow(req.body,existing);
    if(image) row.image_url=await storeFile(image,'posts');
    if(attachment) row.file_url=await storeFile(attachment,'posts');
    if(Object.prototype.hasOwnProperty.call(row,'title')&&!row.title) return res.status(400).json({error:'Title cannot be blank.'});
    const {data,error}=await supabase.from('site_posts').update(row).eq('id',req.params.id).select().single(); if(error)throw error; res.json(data);
  }catch(err){res.status(500).json({error:err.message||'Content update failed.'});}
});
app.delete('/api/admin/posts/:id',requireAdmin,async(req,res)=>{ if(!requireDb(res))return; const {error}=await supabase.from('site_posts').delete().eq('id',req.params.id); if(error)return res.status(500).json({error:error.message}); res.json({ok:true}); });

app.post('/api/admin/ads',requireAdmin,adUpload,async(req,res)=>{
  if(!requireDb(res))return;
  try{
    const placement=sanitizePlacement(req.body.placement); const dims=validateAdCreative(req.file,placement);
    const title=clampText(req.body.title,140); if(!title)return res.status(400).json({error:'Ad title is required.'});
    const assetUrl=await storeFile(req.file,'ads');
    const row={title,placement,side_position:placement==='side'?sanitizeSide(req.body.side_position):'auto',asset_url:assetUrl,asset_type:req.file.mimetype,link_url:safeHttpUrl(req.body.link_url),alt_text:clampText(req.body.alt_text,300)||title,active:bool(req.body.active,true),width_px:dims.width,height_px:dims.height,aspect_ratio:dims.ratio,updated_at:new Date().toISOString()};
    const {data,error}=await supabase.from('site_ads').insert(row).select().single(); if(error)throw error; res.status(201).json(data);
  }catch(err){res.status(400).json({error:err.message||'Advertisement upload failed.'});}
});
app.put('/api/admin/ads/:id',requireAdmin,adUpload,async(req,res)=>{
  if(!requireDb(res))return;
  try{
    const {data:existing,error:readErr}=await supabase.from('site_ads').select('*').eq('id',req.params.id).single(); if(readErr)throw readErr;
    const placement=Object.prototype.hasOwnProperty.call(req.body,'placement')?sanitizePlacement(req.body.placement):existing.placement;
    const row={updated_at:new Date().toISOString()};
    if(Object.prototype.hasOwnProperty.call(req.body,'title')){row.title=clampText(req.body.title,140);if(!row.title)throw new Error('Ad title cannot be blank.');}
    if(Object.prototype.hasOwnProperty.call(req.body,'placement'))row.placement=placement;
    if(Object.prototype.hasOwnProperty.call(req.body,'side_position'))row.side_position=placement==='side'?sanitizeSide(req.body.side_position):'auto';
    if(Object.prototype.hasOwnProperty.call(req.body,'link_url'))row.link_url=safeHttpUrl(req.body.link_url);
    if(Object.prototype.hasOwnProperty.call(req.body,'alt_text'))row.alt_text=clampText(req.body.alt_text,300);
    if(Object.prototype.hasOwnProperty.call(req.body,'active'))row.active=bool(req.body.active);
    if(req.file){const dims=validateAdCreative(req.file,placement);row.asset_url=await storeFile(req.file,'ads');row.asset_type=req.file.mimetype;row.width_px=dims.width;row.height_px=dims.height;row.aspect_ratio=dims.ratio;} else validateExistingAdDimensions(existing,placement);
    const {data,error}=await supabase.from('site_ads').update(row).eq('id',req.params.id).select().single(); if(error)throw error; res.json(data);
  }catch(err){res.status(400).json({error:err.message||'Advertisement update failed.'});}
});
app.delete('/api/admin/ads/:id',requireAdmin,async(req,res)=>{ if(!requireDb(res))return; const {error}=await supabase.from('site_ads').delete().eq('id',req.params.id); if(error)return res.status(500).json({error:error.message}); res.json({ok:true}); });

function buildSponsorRow(body) {
  const has=k=>Object.prototype.hasOwnProperty.call(body,k);
  const row={updated_at:new Date().toISOString()};
  if(has('name')) row.name=clampText(body.name,160);
  if(has('game_target')) row.game_target=sanitizeSponsorTarget(body.game_target);
  if(has('category')) row.category=clampText(body.category,80)||'General';
  if(has('footwear')) row.footwear=bool(body.footwear);
  if(has('offer_text')) row.offer_text=clampText(body.offer_text,700);
  if(has('youtube_url')) row.youtube_url=safeHttpUrl(body.youtube_url);
  if(has('image_card_text')) row.image_card_text=clampText(body.image_card_text,1200);
  if(has('video_card_text')) row.video_card_text=clampText(body.video_card_text,1200);
  if(has('active')) row.active=bool(body.active);
  return row;
}

app.post('/api/admin/sponsors',requireAdmin,sponsorUpload,async(req,res)=>{
  if(!requireDb(res))return;
  try{
    if(req.file&&!isPng(req.file)) return res.status(400).json({error:'Sponsor logo must be a PNG file.'});
    validateImageSize(req.file);
    if(req.body.youtube_url && !isYouTubeUrl(req.body.youtube_url)) return res.status(400).json({error:'Sponsor video must be a YouTube URL.'});
    const row=buildSponsorRow(req.body);
    if(!row.name) return res.status(400).json({error:'Sponsor name is required.'});
    row.game_target=row.game_target||'both'; row.category=row.category||'General'; row.footwear=!!row.footwear;
    row.offer_text=row.offer_text||''; row.image_card_text=row.image_card_text||''; row.video_card_text=row.video_card_text||''; row.active=Object.prototype.hasOwnProperty.call(row,'active')?row.active:true;
    if(req.file) row.logo_url=await storeFile(req.file,'sponsors');
    const {data,error}=await supabase.from('game_sponsors').insert(row).select().single(); if(error)throw error;
    res.status(201).json(data);
  }catch(err){res.status(400).json({error:err.message||'Sponsor could not be saved.'});}
});

app.put('/api/admin/sponsors/:id',requireAdmin,sponsorUpload,async(req,res)=>{
  if(!requireDb(res))return;
  try{
    const {data:existing,error:readErr}=await supabase.from('game_sponsors').select('*').eq('id',req.params.id).single(); if(readErr)throw readErr;
    if(req.file&&!isPng(req.file)) return res.status(400).json({error:'Sponsor logo must be a PNG file.'});
    validateImageSize(req.file);
    if(req.body.youtube_url && !isYouTubeUrl(req.body.youtube_url)) return res.status(400).json({error:'Sponsor video must be a YouTube URL.'});
    const row=buildSponsorRow(req.body);
    if(Object.prototype.hasOwnProperty.call(row,'name')&&!row.name) return res.status(400).json({error:'Sponsor name cannot be blank.'});
    if(bool(req.body.remove_logo,false)) row.logo_url=null;
    if(req.file) row.logo_url=await storeFile(req.file,'sponsors');
    const {data,error}=await supabase.from('game_sponsors').update(row).eq('id',req.params.id).select().single(); if(error)throw error;
    res.json(data);
  }catch(err){res.status(400).json({error:err.message||'Sponsor could not be updated.'});}
});
app.delete('/api/admin/sponsors/:id',requireAdmin,async(req,res)=>{
  if(!requireDb(res))return;
  const {error}=await supabase.from('game_sponsors').delete().eq('id',req.params.id);
  if(error)return res.status(500).json({error:error.message});
  res.json({ok:true});
});

app.use((err,_req,res,_next)=>{ if(err instanceof multer.MulterError)return res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'File is too large. Images may be up to 5 MB; PDFs may be up to 12 MB.':err.message}); console.error(err);res.status(500).json({error:'Server error.'}); });
app.get('*',(_req,res)=>res.sendFile(path.join(PUBLIC_DIR,'index.html')));
ensureBucket().catch(err=>console.error('Storage bucket setup:',err.message));
app.listen(PORT,()=>console.log(`Liquid Sports website listening on ${PORT}`));
