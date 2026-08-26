'use strict';

const PAGE_IDS = ['home','news','fbbl','fbfl','contact'];

function esc(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function linkify(value='') {
  const safe = esc(value);
  return safe
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n/g,'<br>');
}

function normalizePage(page) {
  return PAGE_IDS.includes(page) ? page : 'home';
}

function openPage(page, updateHash=true) {
  page = normalizePage(page);
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === page));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  if (updateHash && location.hash !== '#' + page) history.pushState(null,'','#' + page);
  if (page === 'fbbl') loadFrame('fbbl-frame');
  if (page === 'fbfl') loadFrame('fbfl-frame');
  window.scrollTo({top:0,behavior:'smooth'});
}

function loadFrame(id) {
  const frame = document.getElementById(id);
  if (frame && !frame.src && frame.dataset.src) frame.src = frame.dataset.src;
}

function getVideoEmbed(url='') {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./,'');
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host.endsWith('youtube.com')) {
      let id = u.searchParams.get('v');
      const parts = u.pathname.split('/').filter(Boolean);
      if (!id && ['embed','shorts'].includes(parts[0])) id = parts[1];
      return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean).find(p => /^\d+$/.test(p));
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch (_) {}
  return null;
}

function prettyDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? esc(raw) : d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
}

function postCard(post) {
  const type = String(post.content_type || post.type || 'news').toLowerCase();
  const category = post.category || (type === 'video' ? 'Video' : type === 'photo' ? 'Photo Story' : 'News');
  const image = post.image_url || post.imageUrl || '';
  const imageAlt = post.image_alt || post.imageAlt || post.title || 'Liquid Sports media image';
  const video = getVideoEmbed(post.video_url || post.videoUrl || '');
  const media = video
    ? `<div class="video-wrapper"><iframe src="${esc(video)}" loading="lazy" title="${esc(post.title || 'Liquid Sports video')}" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`
    : image
      ? `<div class="post-media"><img src="${esc(image)}" loading="lazy" decoding="async" alt="${esc(imageAlt)}"></div>`
      : '';

  return `<article class="post-card">
    ${media}
    <div class="post-body">
      <div class="post-topline"><span class="post-chip">${esc(category)}</span><span class="post-chip">${esc(type.toUpperCase())}</span></div>
      <h3>${esc(post.title || 'Untitled')}</h3>
      <div class="post-date">${prettyDate(post.created_at || post.date)}</div>
      <div class="post-copy">${linkify(post.content || '')}</div>
    </div>
  </article>`;
}

async function loadCMS() {
  try {
    const res = await fetch('/api/cms',{cache:'no-store'});
    if (!res.ok) return;
    const data = await res.json();
    if (data['cms-hero-sub']) document.getElementById('cms-hero-sub').textContent = data['cms-hero-sub'];
    if (data['cms-news-sub']) document.getElementById('cms-news-sub').textContent = data['cms-news-sub'];
    if (data['cms-youtube-url']) document.getElementById('cms-youtube-link').href = data['cms-youtube-url'];
  } catch (err) {
    console.warn('CMS settings unavailable:', err);
  }
}

async function loadPosts() {
  const home = document.getElementById('homePostsContainer');
  const videos = document.getElementById('videoPostsContainer');
  const stories = document.getElementById('storyPostsContainer');
  try {
    const res = await fetch('/api/posts',{cache:'no-store'});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const posts = await res.json();
    const list = Array.isArray(posts) ? posts : [];
    const homePosts = list.filter(p => ['home','both'].includes(String(p.target_page || p.targetPage || 'both').toLowerCase()));
    const newsPosts = list.filter(p => ['news','both'].includes(String(p.target_page || p.targetPage || 'both').toLowerCase()));
    const videoPosts = newsPosts.filter(p => String(p.content_type || p.type || '').toLowerCase() === 'video');
    const storyPosts = newsPosts.filter(p => String(p.content_type || p.type || 'news').toLowerCase() !== 'video');

    home.innerHTML = homePosts.length ? homePosts.slice(0,6).map(postCard).join('') : '<div class="empty-state">No front-page CMS posts are published yet.</div>';
    videos.innerHTML = videoPosts.length ? videoPosts.map(postCard).join('') : '<div class="empty-state">No videos are published yet.</div>';
    stories.innerHTML = storyPosts.length ? storyPosts.map(postCard).join('') : '<div class="empty-state">No news or photo stories are published yet.</div>';
  } catch (err) {
    const msg = '<div class="empty-state">CMS content is temporarily unavailable.</div>';
    home.innerHTML = videos.innerHTML = stories.innerHTML = msg;
    console.warn('Posts unavailable:',err);
  }
}

function adCard(ad, placement) {
  const title = ad.title || 'Sponsored';
  const asset = ad.asset_url || ad.assetUrl || '';
  const mime = String(ad.asset_type || ad.assetType || '').toLowerCase();
  const href = ad.link_url || ad.linkUrl || asset || '#';
  const isPdf = mime.includes('pdf') || /\.pdf(?:$|\?)/i.test(asset);
  const cls = placement === 'bottom' ? 'ad-card bottom' : 'ad-card';
  if (isPdf) {
    return `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><div class="pdf-ad"><div><div class="pdf-icon">PDF</div><strong>${esc(title)}</strong><span>Open sponsor document ↗</span></div></div></a>`;
  }
  return `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><img class="ad-image" src="${esc(asset)}" loading="lazy" decoding="async" alt="${esc(ad.alt_text || ad.altText || title)}"><div class="ad-meta"><strong>${esc(title)}</strong>Sponsored content ↗</div></a>`;
}

async function loadAds() {
  const side = document.getElementById('sideAdRail');
  const bottom = document.getElementById('bottomAdRail');
  try {
    const res = await fetch('/api/ads',{cache:'no-store'});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ads = await res.json();
    const sideAds = (Array.isArray(ads)?ads:[]).filter(a => String(a.placement).toLowerCase()==='side');
    const bottomAds = (Array.isArray(ads)?ads:[]).filter(a => String(a.placement).toLowerCase()==='bottom');
    side.innerHTML = sideAds.length ? sideAds.map(a => adCard(a,'side')).join('') : '<div class="empty-state">Ad space available</div>';
    bottom.innerHTML = bottomAds.length ? bottomAds.map(a => adCard(a,'bottom')).join('') : '<div class="empty-state">Bottom ad rail ready for CMS ads.</div>';
  } catch (err) {
    side.innerHTML = '<div class="empty-state">Ad space available</div>';
    bottom.innerHTML = '<div class="empty-state">Bottom ad rail ready for CMS ads.</div>';
  }
}

document.addEventListener('click', e => {
  const pageButton = e.target.closest('[data-page]');
  if (pageButton) { e.preventDefault(); openPage(pageButton.dataset.page); return; }
  const pageLink = e.target.closest('[data-page-link]');
  if (pageLink) { e.preventDefault(); openPage(pageLink.dataset.pageLink); }
});
window.addEventListener('popstate',() => openPage(location.hash.replace('#',''),false));
window.addEventListener('DOMContentLoaded',() => {
  openPage(location.hash.replace('#','') || 'home',false);
  loadCMS();
  loadPosts();
  loadAds();
});
