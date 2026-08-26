(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const state = { posts: [], ads: [], cms: {} };
  const sportMeta = {
    football:{label:'Football',league:'FBFL',logo:'/assets/fake-ballers-fbfl-logo.webp',fallback:'/assets/liquid-football-logo-card.webp'},
    basketball:{label:'Basketball',league:'FBBL',logo:'/assets/fake-ballers-fbbl-logo.webp',fallback:'/assets/liquid-basketball-logo-card.webp'},
    baseball:{label:'Baseball',league:'FBDL',logo:'/assets/fake-ballers-fbdl-logo.webp',fallback:'/assets/liquid-baseball-logo-card.webp'}
  };
  const sportOrder = ['football','basketball','baseball'];

  function escapeHtml(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function safeUrl(v='') { try { const u=new URL(v,location.origin); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }
  function readableDate(v) { if(!v) return ''; const d=new Date(v); return Number.isNaN(d.valueOf())?'':d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); }
  function excerpt(post){ return post.excerpt || (post.content||'').replace(/\s+/g,' ').slice(0,150) + ((post.content||'').length>150?'…':''); }
  function fallbackImage(post){ return sportMeta[post.sport]?.fallback || '/assets/liquid-sports-logo-card.webp'; }
  function postImage(post){ return post.image_url || fallbackImage(post); }

  function showPage(name, updateHash=true) {
    if(!document.getElementById(name)) name='home';
    $$('.page').forEach(p=>p.classList.toggle('active',p.id===name));
    $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===name || (['fbfl','fbbl','fbdl'].includes(name)&&b.dataset.page==='games')));
    $('.primary-nav')?.classList.remove('open'); $('.mobile-menu')?.setAttribute('aria-expanded','false');
    if(updateHash) history.replaceState(null,'','#'+name);
    if(name==='fbfl'||name==='fbbl') {
      const frame=document.querySelector(`#${name} iframe[data-src]`);
      if(frame && !frame.src) frame.src=frame.dataset.src;
    }
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function wireNavigation(){
    document.addEventListener('click',e=>{
      const target=e.target.closest('[data-page],[data-page-link]');
      if(!target) return;
      const page=target.dataset.page||target.dataset.pageLink;
      if(page){ e.preventDefault(); showPage(page); }
    });
    $('.mobile-menu')?.addEventListener('click',e=>{
      const nav=$('.primary-nav'); const open=nav.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded',String(open));
    });
    const initial=(location.hash||'#home').slice(1); showPage(initial,false);
  }

  function miniItem(post){
    return `<article class="mini-item" data-post-id="${escapeHtml(post.id)}" tabindex="0"><img src="${escapeHtml(postImage(post))}" alt="${escapeHtml(post.image_alt||post.title)}" loading="lazy"><div><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(excerpt(post))}</p></div></article>`;
  }

  function renderHome(){
    const news=state.posts.filter(p=>['news','photo'].includes(p.content_type)&&p.featured).slice(0,3);
    const videos=state.posts.filter(p=>p.content_type==='video'&&p.featured).slice(0,3);
    const media=state.posts.filter(p=>p.content_type==='media'&&p.featured).slice(0,3);
    [['homeNewsPanel','homeNews',news],['homeVideoPanel','homeVideos',videos],['homeMediaPanel','homeMedia',media]].forEach(([panel,container,items])=>{
      const el=document.getElementById(container); if(!el)return; el.innerHTML=items.map(miniItem).join(''); document.getElementById(panel)?.classList.toggle('is-empty',items.length===0);
    });
  }

  function contentCard(post){
    const isVideo=post.content_type==='video';
    const download=post.file_url ? `<span class="download-chip">PDF / DOWNLOAD</span>` : '';
    return `<article class="content-card" data-post-id="${escapeHtml(post.id)}" tabindex="0">
      <div class="${isVideo?'video-thumb':''}"><img src="${escapeHtml(postImage(post))}" alt="${escapeHtml(post.image_alt||post.title)}" loading="lazy"></div>
      <div class="content-card-body"><span class="meta">${escapeHtml(post.category||post.content_type)}${post.published_at||post.created_at?' • '+escapeHtml(readableDate(post.published_at||post.created_at)):''}</span><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(excerpt(post))}</p>${download}</div>
    </article>`;
  }

  function laneMarkup(sport,posts){
    const meta=sportMeta[sport];
    return `<section class="cms-sport-lane ${sport}"><div class="cms-lane-title"><img src="${meta.logo}" alt=""><div><span class="eyebrow">${meta.league}</span><h2>${meta.label}</h2></div></div><div class="cms-card-list">${posts.length?posts.map(contentCard).join(''):'<div class="empty-lane">Nothing published here yet.</div>'}</div></section>`;
  }
  function renderContentPages(){
    const groups={
      news: state.posts.filter(p=>['news'].includes(p.content_type)),
      videos: state.posts.filter(p=>p.content_type==='video'),
      media: state.posts.filter(p=>['media','photo'].includes(p.content_type))
    };
    const targets={news:'#newsLanes',videos:'#videoLanes',media:'#mediaLanes'};
    Object.entries(groups).forEach(([key,items])=>{
      const el=$(targets[key]); if(!el)return;
      el.innerHTML=sportOrder.map(s=>laneMarkup(s,items.filter(p=>p.sport===s||p.sport==='all'))).join('');
    });
  }

  function youtubeEmbed(url){
    try{
      const u=new URL(url);
      if(u.hostname.includes('youtu.be')) return `https://www.youtube.com/embed/${u.pathname.replace('/','').split('/')[0]}`;
      if(u.hostname.includes('youtube.com')){
        if(u.pathname.startsWith('/embed/')) return `https://www.youtube.com${u.pathname}`;
        const id=u.searchParams.get('v'); if(id) return `https://www.youtube.com/embed/${id}`;
        const shorts=u.pathname.match(/\/shorts\/([^/?]+)/); if(shorts) return `https://www.youtube.com/embed/${shorts[1]}`;
      }
    }catch{}
    return '';
  }

  function openPost(post){
    const dialog=$('#contentDialog'), body=$('#dialogBody'); if(!dialog||!body)return;
    const image=post.image_url||fallbackImage(post);
    let media='';
    if(post.video_url){
      const embed=youtubeEmbed(post.video_url);
      if(embed) media=`<div class="embed-wrap"><iframe src="${escapeHtml(embed)}" title="${escapeHtml(post.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
      else media=`<p><a class="button blue" href="${escapeHtml(safeUrl(post.video_url))}" target="_blank" rel="noopener noreferrer">Open YouTube ↗</a></p>`;
    }
    const file=post.file_url ? `<p class="dialog-download"><a class="button green" href="${escapeHtml(post.file_url)}" target="_blank" rel="noopener noreferrer">Open / Download Resource ↗</a></p>` : '';
    const ext=post.external_url ? `<p><a class="button ghost" href="${escapeHtml(safeUrl(post.external_url))}" target="_blank" rel="noopener noreferrer">Visit Link ↗</a></p>` : '';
    body.innerHTML=`<article class="dialog-article"><img src="${escapeHtml(image)}" alt="${escapeHtml(post.image_alt||post.title)}"><div class="dialog-meta">${escapeHtml(sportMeta[post.sport]?.league||'LIQUID SPORTS')} • ${escapeHtml(post.category||post.content_type)} • ${escapeHtml(readableDate(post.published_at||post.created_at))}</div><h2>${escapeHtml(post.title)}</h2>${media}<div class="article-copy">${escapeHtml(post.content||post.excerpt||'')}</div>${file}${ext}</article>`;
    dialog.showModal();
  }
  function wirePostClicks(){
    document.addEventListener('click',e=>{ const card=e.target.closest('[data-post-id]'); if(!card)return; const p=state.posts.find(x=>String(x.id)===String(card.dataset.postId)); if(p)openPost(p); });
    document.addEventListener('keydown',e=>{ if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-post-id]')){e.preventDefault();e.target.click();} });
    $('.dialog-close')?.addEventListener('click',()=>$('#contentDialog')?.close());
    $('#contentDialog')?.addEventListener('click',e=>{ if(e.target.id==='contentDialog') e.currentTarget.close(); });
  }

  function adMarkup(ad,slot){
    const link=safeUrl(ad.link_url||'');
    const title=escapeHtml(ad.alt_text||ad.title||'Advertisement');
    let creative='';
    if((ad.asset_type||'').includes('pdf')) creative=`<div class="pdf-ad"><div><div class="pdf-icon">PDF</div><strong>${escapeHtml(ad.title)}</strong><span class="ad-label">ADVERTISEMENT</span></div></div>`;
    else creative=`<div class="ad-unit"><img src="${escapeHtml(ad.asset_url)}" alt="${title}" loading="lazy"><div class="ad-label">ADVERTISEMENT</div></div>`;
    if((ad.asset_type||'').includes('pdf')){
      const inner=`<div class="ad-unit pdf-ad"><div><div class="pdf-icon">PDF</div><strong>${escapeHtml(ad.title)}</strong><span class="ad-label">ADVERTISEMENT</span></div></div>`;
      return link?`<a href="${escapeHtml(link)}" target="_blank" rel="sponsored noopener noreferrer">${inner}</a>`:`<a href="${escapeHtml(ad.asset_url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
    }
    return link?`<a class="ad-click" href="${escapeHtml(link)}" target="_blank" rel="sponsored noopener noreferrer">${creative}</a>`:creative;
  }

  function renderAds(){
    const active=state.ads.filter(a=>a.active);
    const sides=active.filter(a=>a.placement==='side');
    let left=sides.find(a=>a.side_position==='left')||sides.find(a=>a.side_position==='auto')||null;
    let right=sides.find(a=>a.side_position==='right')||sides.find(a=>a.side_position==='auto'&&a.id!==left?.id)||sides.find(a=>a.id!==left?.id)||null;
    const bottom=active.find(a=>a.placement==='bottom')||null;
    const leftEl=$('#leftAdRail'),rightEl=$('#rightAdRail'),bottomEl=$('#bottomAdRail'),mobile=$('#mobileAdStack');
    [[leftEl,left],[rightEl,right],[bottomEl,bottom]].forEach(([el,ad])=>{ if(!el)return; el.innerHTML=ad?adMarkup(ad):''; el.classList.toggle('is-empty',!ad); });
    const mobileAds=[left,right].filter(Boolean); if(mobile){mobile.innerHTML=mobileAds.map(a=>adMarkup(a)).join('');mobile.classList.toggle('is-empty',mobileAds.length===0);}
  }

  async function fetchJson(url){ const r=await fetch(url,{headers:{'Accept':'application/json'}}); if(!r.ok)throw new Error(`${r.status} ${r.statusText}`); return r.json(); }
  async function loadData(){
    const [cms,posts,ads]=await Promise.allSettled([fetchJson('/api/cms'),fetchJson('/api/posts'),fetchJson('/api/ads')]);
    if(cms.status==='fulfilled'){state.cms=cms.value||{}; if(state.cms['cms-hero-sub']) $('#cms-hero-sub').textContent=state.cms['cms-hero-sub'];}
    if(posts.status==='fulfilled') state.posts=posts.value||[]; else console.warn('Posts unavailable:',posts.reason);
    if(ads.status==='fulfilled') state.ads=ads.value||[]; else console.warn('Ads unavailable:',ads.reason);
    renderHome();renderContentPages();renderAds();
  }

  wireNavigation(); wirePostClicks(); loadData();
})();
