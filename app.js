/* ===========================================================
   Moments — full client app (GitHub Pages friendly)
   - Auth (sessionStorage): display/handle/avatar/bio
   - Stories: image/video only, multi, 48h TTL, viewer, delete own
   - Moments: image/video only, multi (max 4), Studio Pro edit, delete own
   - Feed: scroll+autoplay videos, like/comment
   - Chat: contacts from known users, unread badges, read on open, delete own
   - Defensive bindings (no call stack error)
   =========================================================== */

/* ------------------ Utilities & Storage ------------------ */
const KEYS = {
  auth: 'mh:auth',         // session
  moments: 'mh:moments',   // local posts
  stories: 'mh:stories',   // local stories
  chat: 'mh:chat'          // local chat threads {threadId: [msgs]}
};
const byId = (id)=> document.getElementById(id);
const on = (el, ev, fn)=> el && el.addEventListener(ev, fn);
const ready = (fn)=> document.readyState!=='loading' ? fn() : document.addEventListener('DOMContentLoaded', fn);
const rand = ()=> Math.random().toString(36).slice(2,9);
const now = ()=> Date.now();
const getSS = (k)=> { try{return JSON.parse(sessionStorage.getItem(k))||null}catch{return null} };
const setSS = (k,v)=> { try{sessionStorage.setItem(k,JSON.stringify(v))}catch{} };
const clrSS = (k)=> { try{sessionStorage.removeItem(k)}catch{} };

const getLS = (k,d)=> { try{return JSON.parse(localStorage.getItem(k)) ?? d}catch{return d} };
const setLS = (k,v)=> { try{localStorage.setItem(k,JSON.stringify(v))}catch{} };

function toast(msg){
  let t = document.getElementById('mhToastMain');
  if(!t){
    t = document.createElement('div');
    t.id='mhToastMain';
    t.style.cssText='position:fixed;right:12px;bottom:12px;z-index:99999;background:#111;color:#fff;padding:10px 12px;border-radius:10px;font:12px/1.3 system-ui;box-shadow:0 6px 24px rgba(0,0,0,.25)';
    document.body.appendChild(t);
  }
  t.textContent = String(msg);
  t.style.opacity='1';
  setTimeout(()=>{ t.style.opacity='0'; }, 3200);
}

/* ------------------ Auth (session only) ------------------ */
function getCurrentUser(){ return getSS(KEYS.auth); }
function setCurrentUser(u){ setSS(KEYS.auth, u); applyUserToUI(u); }
function clearCurrentUser(){ clrSS(KEYS.auth); applyUserToUI(null); }

function ensureAuthUI(){
  const headerBar = document.querySelector('header .flex.items-center.gap-2') || document.querySelector('header');
  if(!headerBar) return;
  if(!document.getElementById('signInBtn')){
    const b = document.createElement('button');
    b.id='signInBtn'; b.textContent='Sign in';
    b.className='rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-semibold shadow-sm';
    headerBar.appendChild(b);
  }
  if(!document.getElementById('signUpBtn')){
    const b = document.createElement('button');
    b.id='signUpBtn'; b.textContent='Sign up';
    b.className='rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-semibold shadow-sm';
    headerBar.appendChild(b);
  }
  if(!document.getElementById('logoutBtn')){
    const b = document.createElement('button');
    b.id='logoutBtn'; b.textContent='Log out';
    b.className='rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-semibold shadow-sm hidden';
    headerBar.appendChild(b);
  }
  if(!document.getElementById('userPill')){
    const p = document.createElement('div');
    p.id='userPill'; p.className='flex items-center gap-2 ml-2';
    p.innerHTML = `
      <img id="userAvatar" class="hidden h-7 w-7 rounded-full border border-black/10" alt="">
      <span id="userName" class="hidden text-xs font-semibold"></span>
    `;
    headerBar.appendChild(p);
  }
}
function ensureModals(){
  if(!document.getElementById('authModal')){
    const m = document.createElement('div');
    m.id='authModal'; m.className='hidden fixed inset-0 z-50 grid place-items-center bg-black/60 p-4';
    m.innerHTML = `
    <div class="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm font-bold"><span id="authTitle">Sign in</span></div>
        <button id="authClose" class="rounded bg-black/10 px-2 py-1 text-xs">Close</button>
      </div>
      <div class="grid gap-2 text-sm">
        <input id="auDisplay" class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="Display name">
        <input id="auHandle"  class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="@handle (unique)">
        <input id="auAvatar"  class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="Avatar image URL (optional)">
        <button id="authSubmit" class="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-semibold shadow-sm">Continue</button>
        <small class="text-black/60">No email/password (Pages-only). Your session stays in this tab.</small>
      </div>
    </div>`;
    document.body.appendChild(m);
  }
  if(!document.getElementById('settingsModal')){
    const m = document.createElement('div');
    m.id='settingsModal'; m.className='hidden fixed inset-0 z-50 grid place-items-center bg-black/60 p-4';
    m.innerHTML = `
    <div class="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm font-bold">Settings</div>
        <button id="settingsClose" class="rounded bg-black/10 px-2 py-1 text-xs">Close</button>
      </div>
      <div class="grid gap-2 text-sm">
        <input id="stDisplay" class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="Display name">
        <input id="stHandle"  class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="@handle">
        <input id="stAvatar"  class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="Avatar URL">
        <textarea id="stBio" rows="3" class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="Short bio"></textarea>
        <div class="flex items-center justify-between mt-1">
          <button id="settingsSave" class="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-semibold shadow-sm">Save</button>
          <button id="settingsClear" class="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs">Clear session</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(m);
  }
}
function openModal(sel){ const m=document.querySelector(sel); if(m) m.classList.remove('hidden'); }
function closeModal(sel){ const m=document.querySelector(sel); if(m) m.classList.add('hidden'); }

function normHandle(h){
  if(!h) return '';
  h=h.replace(/^@/,'').trim();
  if(!/^[A-Za-z0-9._-]{2,20}$/.test(h)){ toast('Handle uses letters/numbers/._- (2–20)'); return ''; }
  return h;
}
function applyUserToUI(u){
  const ava = byId('userAvatar'), nm = byId('userName');
  const si = byId('signInBtn'), su = byId('signUpBtn'), lo = byId('logoutBtn');
  const pfA = byId('pfAvatar'), pfN = byId('pfName'), pfH=byId('pfHandle'), pfB=byId('pfBio');

  if(u){
    const avatar = u.avatar || ('https://ui-avatars.com/api/?name='+encodeURIComponent(u.display||u.handle||'U'));
    if(ava){ ava.src=avatar; ava.classList.remove('hidden'); }
    if(nm){ nm.textContent = u.display||u.handle||'User'; nm.classList.remove('hidden'); }
    if(si) si.classList.add('hidden'); if(su) su.classList.add('hidden'); if(lo) lo.classList.remove('hidden');

    if(pfA) pfA.src = avatar;
    if(pfN) pfN.textContent = u.display||'User';
    if(pfH) pfH.textContent = '@'+(u.handle||'user');
    if(pfB) pfB.textContent = u.bio||'';
  }else{
    if(ava){ ava.classList.add('hidden'); }
    if(nm){ nm.classList.add('hidden'); nm.textContent=''; }
    if(si) si.classList.remove('hidden'); if(su) su.classList.remove('hidden'); if(lo) lo.classList.add('hidden');

    if(pfA) pfA.src = '';
    if(pfN) pfN.textContent = 'Guest';
    if(pfH) pfH.textContent = '@guest';
    if(pfB) pfB.textContent = '';
  }
}

/* ------------------ Tabs & Search ------------------ */
function switchTab(t){
  ['home','moments','chat','profile'].forEach(k=>{
    const el = byId('tab-'+k);
    if(el) el.classList.toggle('hidden', k!==t);
  });
}
function bindTabClicks(){
  document.addEventListener('click', (e)=>{
    const b = e.target.closest('[data-tab]'); if(!b) return;
    switchTab(b.dataset.tab);
  });
}
function bindSearch(){
  const search = byId('search');
  on(search,'input', ()=>{
    const q = (search.value||'').toLowerCase().trim();
    // filter moments cards
    Array.from(document.querySelectorAll('[data-searchable]')).forEach(n=>{
      const ok = (n.dataset.searchable||'').includes(q);
      n.style.display = ok ? '' : 'none';
    });
  });
}

/* ------------------ Stories Logic ------------------ */
const STORY_TTL = 48*60*60*1000; // 48h

function allowed(file){ const t=(file.type||'').toLowerCase(); return t.startsWith('image/')||t.startsWith('video/'); }

function purgeExpiredStories(){
  const list = getLS(KEYS.stories,[]);
  const kept = list.filter(s => (now()-(s.created||0)) < STORY_TTL);
  if(kept.length!==list.length) setLS(KEYS.stories, kept);
}

function addStoryFromFile(file){
  const u = getCurrentUser();
  const blob = URL.createObjectURL(file);
  const kind = file.type.startsWith('video') ? 'video':'image';
  const list = getLS(KEYS.stories,[]);
  list.unshift({
    id: rand(), kind, src: blob, thumb: blob,
    caption: '', author: u ? (u.display||u.handle) : 'Guest',
    handle: u ? u.handle : 'guest', avatar: u ? u.avatar : '',
    created: now()
  });
  setLS(KEYS.stories, list);
}

function renderStoriesStrip(){
  const host = byId('storiesStrip'); if(!host) return;
  purgeExpiredStories();
  const list = getLS(KEYS.stories,[]);
  host.innerHTML = '';
  list.forEach((s, idx)=>{
    const b = document.createElement('button');
    b.className='flex flex-col items-center gap-1';
    const media = s.kind==='image'
      ? `<img src="${s.thumb}" class="h-full w-full object-cover"/>`
      : `<video src="${s.thumb}" class="h-full w-full object-cover" muted></video>`;
    b.innerHTML = `
      <span class='block h-16 w-16 rounded-full border-2 border-fuchsia-400 overflow-hidden'>${media}</span>
      <span class='text-[11px] max-w-20 truncate'>${s.author||'Story'}</span>
    `;
    b.addEventListener('click', ()=> openStoryViewer(idx));
    host.appendChild(b);
  });
}

function openStoryViewer(startIndex){
  const stories = getLS(KEYS.stories,[]);
  if(!stories.length) return;
  let i = Math.max(0, Math.min(startIndex, stories.length-1));
  const modal = byId('storyModal');
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class='w-full max-w-sm rounded-2xl bg-black text-white overflow-hidden'>
      <div class='h-1.5 w-full bg-white/20'><div id='storyBar' class='h-full w-0 bg-white'></div></div>
      <div id='storyWrap' class='aspect-[9/16] w-full bg-black grid place-items-center'></div>
      <div class='p-3 flex items-center justify-between text-sm'>
        <div id='storyMeta'></div>
        <div class='flex gap-2'>
          <button id='st-del' class='chip bg-white/10'>Delete</button>
          <button id='st-prev' class='chip bg-white/10'>Prev</button>
          <button id='st-next' class='chip bg-white/10'>Next</button>
          <button id='st-close' class='chip bg-white/10'>Close</button>
        </div>
      </div>
    </div>`;
  const bar = byId('storyBar'), wrap = byId('storyWrap'), meta = byId('storyMeta');
  let timer=null, t0=0, dur=7000;

  function render(){
    purgeExpiredStories();
    const arr = getLS(KEYS.stories,[]);
    if(!arr.length){ modal.classList.add('hidden'); return; }
    i = Math.max(0, Math.min(i, arr.length-1));
    const s = arr[i];
    wrap.innerHTML='';
    if(s.kind==='video'){
      const v=document.createElement('video'); v.src=s.src; v.autoplay=true; v.muted=true; v.playsInline=true; v.className='h-full w-full object-cover'; wrap.appendChild(v);
    }else{
      const img=document.createElement('img'); img.src=s.src; img.className='h-full w-full object-cover'; wrap.appendChild(img);
    }
    meta.textContent = `${s.author||''}${s.caption? ' — '+s.caption:''}`;
    bar.style.width='0%'; t0=now(); clearInterval(timer);
    timer=setInterval(()=>{
      const p=Math.min(1,(now()-t0)/dur); bar.style.width=(p*100)+'%'; if(p>=1){ next(); }
    },50);

    // bind delete (owner-only)
    byId('st-del').onclick = ()=>{
      const me=getCurrentUser();
      if(!me || me.handle!==s.handle){ toast('Only the author can delete this story'); return; }
      setLS(KEYS.stories, getLS(KEYS.stories,[]).filter(x=>x.id!==s.id));
      renderStoriesStrip(); render();
    };
  }
  function next(){ i++; render(); }
  function prev(){ i--; render(); }
  byId('st-next').onclick = next;
  byId('st-prev').onclick = prev;
  byId('st-close').onclick = ()=> modal.classList.add('hidden');
  render();
}

function bindStoryInput(){
  const input = byId('storyFile'); if(!input || input.__bound__) return; input.__bound__=true;
  on(input,'change',(e)=>{
    const files = Array.from(e.target.files||[]);
    if(!files.length) return;
    let ok=0, bad=0;
    files.forEach(f=> allowed(f) ? (addStoryFromFile(f), ok++) : bad++);
    renderStoriesStrip();
    input.value='';
    if(ok) toast(`Added ${ok} stor${ok>1?'ies':'y'} ✓ (48h)`);
    if(bad) toast(`${bad} file${bad>1?'s':''} rejected (images/videos only)`);
  });
}

/* ------------------ Moments Logic ------------------ */
let momSelected = []; // [{file, kind, name, edited?}]
window.momSelected = momSelected; // used by Studio

function drawThumbs(){
  const host = byId('momThumbs'); if(!host) return; host.innerHTML='';
  momSelected.forEach((it, idx)=>{
    const url = URL.createObjectURL(it.file);
    const cell = document.createElement('div');
    cell.className='relative';
    const media = it.kind==='image'
      ? `<img src="${url}" class="h-16 w-16 object-cover rounded-lg border border-black/10"/>`
      : `<video src="${url}" class="h-16 w-16 object-cover rounded-lg border border-black/10" muted></video>`;
    cell.innerHTML = `
      ${media}
      <button data-edit="${idx}" title="Edit" class="absolute right-1 top-1 rounded bg-white/80 text-xs px-1">✎</button>
      <button data-del="${idx}" title="Remove" class="absolute left-1 top-1 rounded bg-white/80 text-xs px-1">🗑</button>
    `;
    host.appendChild(cell);
  });
  // bind edit/remove
  host.querySelectorAll('[data-edit]').forEach(b=>{
    b.onclick = ()=> openStudioWithFile(parseInt(b.dataset.edit,10));
  });
  host.querySelectorAll('[data-del]').forEach(b=>{
    b.onclick = ()=>{
      const i=parseInt(b.dataset.del,10);
      momSelected.splice(i,1);
      drawThumbs();
    };
  });
}

function bindMomInput(){
  const input = byId('momFile'); if(!input || input.__bound__) return; input.__bound__=true;
  on(input,'change',(e)=>{
    const files = Array.from(e.target.files||[]);
    if(!files.length) return;
    const existing = momSelected.length;
    const room = Math.max(0, 4-existing);
    const slice = files.filter(allowed).slice(0, room);
    if(!slice.length){ toast('Only images/videos allowed (max 4)'); input.value=''; return; }
    slice.forEach(f=> momSelected.push({file:f, kind: f.type.startsWith('video')?'video':'image', name:f.name}));
    input.value='';
    drawThumbs();
  });
}

function addMomentToStore(m){
  const list = getLS(KEYS.moments,[]);
  list.unshift(m); setLS(KEYS.moments, list);
}

function renderMomentsFeed(){
  const host = byId('momentsFeed'); if(!host) return; host.innerHTML='';
  const list = getLS(KEYS.moments,[]);
  list.forEach(m=>{
    const wrap = document.createElement('div');
    wrap.className='mom-item rounded-2xl border border-black/10 bg-black/90 text-white overflow-hidden relative';
    wrap.dataset.searchable = `${(m.caption||'')+' '+(m.tags||[]).join(' ')+' '+(m.author||'')}`.toLowerCase();
    const media = m.kind==='video'
      ? `<video class="mom-video absolute inset-0 h-full w-full object-cover" src="${m.src}" playsinline muted loop></video>`
      : `<img class="absolute inset-0 h-full w-full object-cover" src="${m.src}" alt="">`;
    wrap.innerHTML = `
      <div class='aspect-[9/16] w-full relative'>
        ${media}
        <div class='absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-black/0'>
          <div class='flex items-center gap-2'>
            <img src="${m.avatar||''}" class="h-6 w-6 rounded-full border border-white/30 ${m.avatar?'':'hidden'}">
            <div class='text-sm font-semibold'>${m.author||'You'} <span class='text-white/70 text-xs'>@${m.handle||'user'}</span></div>
          </div>
          <div class='text-sm opacity-90'>${m.caption||''}</div>
          <div class='text-xs opacity-70'>${(m.tags||[]).map(t=>'#'+t).join(' ')}</div>
        </div>
        <div class='absolute right-2 top-2 flex flex-col gap-2'>
          <button class='like-btn rounded-full bg-white/10 px-3 py-1 text-xs' data-like='${m.id}'>❤ ${m.likes||0}</button>
          <button class='comment-btn rounded-full bg-white/10 px-3 py-1 text-xs' data-cmt='${m.id}'>💬 ${m.comments?.length||0}</button>
          <button class='rounded-full bg-white/10 px-3 py-1 text-xs' data-del-mom='${m.id}'>🗑 Delete</button>
        </div>
      </div>
      <div class='p-3 bg-white text-slate-900'>
        <div class='flex items-center gap-2'>
          <input class='grow rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm' placeholder='Add a comment…'>
          <button class='send-cmt rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-sm font-semibold shadow-sm' data-send='${m.id}'>Send</button>
        </div>
        <div class='mt-2 space-y-1 text-sm max-h-32 overflow-y-auto' id='cmt-${m.id}'></div>
      </div>`;
    host.appendChild(wrap);
    // existing comments
    const cwrap = wrap.querySelector(`#cmt-${m.id}`);
    (m.comments||[]).forEach(c=>{
      const p=document.createElement('div');
      p.innerHTML = `<span class='font-semibold'>${c.author||'User'}:</span> ${c.text}`;
      cwrap.appendChild(p);
    });
  });
  wireMomentCardEvents(host);
  autoPlayVisible();
}

function wireMomentCardEvents(scope){
  scope.querySelectorAll('[data-like]').forEach(b=> b.onclick = ()=>{
    const id=b.dataset.like; const list=getLS(KEYS.moments,[]); const m=list.find(x=>x.id===id); if(!m) return;
    m.liked=!m.liked; m.likes = (m.likes||0) + (m.liked?1:-1); setLS(KEYS.moments,list); b.textContent=`❤ ${m.likes}`;
  });
  scope.querySelectorAll('[data-send]').forEach(b=> b.onclick = ()=>{
    const id=b.dataset.send; const list=getLS(KEYS.moments,[]); const m=list.find(x=>x.id===id); if(!m) return;
    const input = b.parentElement.querySelector('input'); const text=input.value.trim(); if(!text) return;
    const u=getCurrentUser();
    m.comments = m.comments||[]; m.comments.push({id:rand(), text, ts:now(), author: u ? (u.display||u.handle) : 'You'});
    setLS(KEYS.moments,list); input.value='';
    const cwrap = byId(`cmt-${id}`); const p=document.createElement('div'); p.innerHTML = `<span class='font-semibold'>${u?(u.display||u.handle):'You'}:</span> ${text}`; cwrap.appendChild(p);
  });
  scope.querySelectorAll('[data-del-mom]').forEach(b=> b.onclick = ()=>{
    const id=b.dataset.delMom; const list=getLS(KEYS.moments,[]); const m=list.find(x=>x.id===id); if(!m) return;
    const me=getCurrentUser();
    if(!me || me.handle!==m.handle){ toast('Only the author can delete this moment'); return; }
    setLS(KEYS.moments, list.filter(x=>x.id!==id)); renderMomentsFeed(); renderHomeFeed();
  });
}

function autoPlayVisible(){
  const vids = Array.from(document.querySelectorAll('.mom-video'));
  if(!('IntersectionObserver' in window)){ vids.forEach(v=>{try{v.play()}catch{}}); return; }
  const obs = new IntersectionObserver((ents)=>{
    ents.forEach(en=>{
      const v=en.target; if(en.isIntersecting && en.intersectionRatio>0.6){ try{v.play()}catch{} } else { try{v.pause()}catch{} }
    });
  }, {threshold:[0,0.25,0.5,0.75,1]});
  vids.forEach(v=> obs.observe(v));
}

/* ------------------ Home Feed (same as Moments list) ------------------ */
function renderHomeFeed(){
  const host = byId('homeFeed'); if(!host) return; host.innerHTML='';
  const list = getLS(KEYS.moments,[]);
  list.forEach(m=>{
    const wrap = document.createElement('div');
    wrap.className='mom-item rounded-2xl border border-black/10 bg-black/90 text-white overflow-hidden relative';
    wrap.dataset.searchable = `${(m.caption||'')+' '+(m.tags||[]).join(' ')+' '+(m.author||'')}`.toLowerCase();
    const media = m.kind==='video'
      ? `<video class="mom-video absolute inset-0 h-full w-full object-cover" src="${m.src}" playsinline muted loop></video>`
      : `<img class="absolute inset-0 h-full w-full object-cover" src="${m.src}" alt="">`;
    wrap.innerHTML = `
      <div class='aspect-[9/16] w-full relative'>
        ${media}
        <div class='absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-black/0'>
          <div class='flex items-center gap-2'>
            <img src="${m.avatar||''}" class="h-6 w-6 rounded-full border border-white/30 ${m.avatar?'':'hidden'}">
            <div class='text-sm font-semibold'>${m.author||'You'} <span class='text-white/70 text-xs'>@${m.handle||'user'}</span></div>
          </div>
          <div class='text-sm opacity-90'>${m.caption||''}</div>
          <div class='text-xs opacity-70'>${(m.tags||[]).map(t=>'#'+t).join(' ')}</div>
        </div>
      </div>`;
    host.appendChild(wrap);
  });
  autoPlayVisible();
}

/* ------------------ Post Moment ------------------ */
function postMoment(){
  if(!momSelected.length){ toast('Add up to 4 images/videos first'); return; }
  const u=getCurrentUser();
  const caption = (byId('momCaption').value||'').trim();
  const tags = (byId('momTags').value||'').split(',').map(s=>s.trim().replace(/^#/,'')).filter(Boolean);

  // For now, make one moment per selected file (simpler vertical feed)
  momSelected.forEach(it=>{
    const src = URL.createObjectURL(it.file);
    addMomentToStore({
      id: rand(),
      kind: it.kind,
      src, thumb: it.kind==='image'? src : '',
      caption, tags,
      author: u ? (u.display||u.handle) : 'Guest',
      handle: u ? u.handle : 'guest',
      avatar: u ? u.avatar : '',
      created: now(),
      likes: 0, liked: false, comments: []
    });
  });

  // reset composer
  momSelected = []; window.momSelected = momSelected;
  byId('momCaption').value=''; byId('momTags').value='';
  drawThumbs(); renderMomentsFeed(); renderHomeFeed();
  toast('Posted to Moments ✓');
}

/* ------------------ Studio Pro ------------------ */
(function StudioPro(){
  const studio   = byId('studio');
  const cvs      = byId('studioCanvas');
  const ctx      = cvs?.getContext('2d');
  const z = byId('stZoom');
  const r = byId('stRotate');
  const px= byId('stPanX');
  const py= byId('stPanY');
  const br= byId('stBright');
  const ct= byId('stContrast');
  const st= byId('stSat');
  const hu= byId('stHue');
  const bl= byId('stBlur');

  const BTN_OPEN = byId('openStudio');
  const BTN_CLOSE= byId('studioClose');
  const BTN_EXPORT= byId('studioExport');
  const BTN_TXT  = byId('stAddText');
  const BTN_EMOJI= byId('stAddEmoji');
  const BTN_STICK= byId('stAddSticker');

  const S = { idx:-1, img:null,w:0,h:0, zoom:1, rot:0, panX:0, panY:0,
              bright:1, contrast:1, saturate:1, hue:0, blur:0,
              overlays:[], dragging:-1, dragOff:{x:0,y:0} };

  function setCanvasSize(){
    const box = cvs.parentElement.getBoundingClientRect();
    cvs.width  = Math.min(1280, Math.round(box.width));
    cvs.height = Math.round(cvs.width*9/16);
  }
  function loadImageFromFile(file){
    return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=rej; img.src=URL.createObjectURL(file); });
  }
  function draw(){
    if(!ctx || !S.img) return;
    ctx.save();
    ctx.clearRect(0,0,cvs.width,cvs.height);
    ctx.filter = `brightness(${S.bright}) contrast(${S.contrast}) saturate(${S.saturate}) hue-rotate(${S.hue}deg) blur(${S.blur}px)`;
    const cx=cvs.width/2, cy=cvs.height/2;
    ctx.translate(cx+S.panX, cy+S.panY);
    ctx.rotate(S.rot*Math.PI/180);
    ctx.scale(S.zoom,S.zoom);
    const scale = Math.min(cvs.width/S.w, cvs.height/S.h);
    const dw=S.w*scale, dh=S.h*scale;
    ctx.drawImage(S.img, -dw/2, -dh/2, dw, dh);
    ctx.restore();

    // overlays (no filters)
    S.overlays.forEach((o,i)=>{
      if(o.type==='text' || o.type==='emoji'){
        ctx.save();
        ctx.font=`bold ${o.s}px system-ui,Segoe UI Emoji,Apple Color Emoji`;
        ctx.textBaseline='top';
        ctx.fillStyle='rgba(0,0,0,.14)'; ctx.fillText(o.text, o.x+1, o.y+1);
        ctx.fillStyle='#fff'; ctx.fillText(o.text, o.x, o.y);
        ctx.restore();
      }else if(o.type==='sticker' && o.img){ ctx.drawImage(o.img,o.x,o.y,o.s,o.s); }
      if(i===S.dragging){
        ctx.save(); ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.setLineDash([5,4]);
        const w=(o.type==='sticker')? o.s : ctx.measureText(o.text).width; const h=(o.type==='sticker')? o.s : o.s*1.2;
        ctx.strokeRect(o.x-3,o.y-3,w+6,h+6); ctx.restore();
      }
    });
  }
  function hitOverlay(x,y){
    for(let i=S.overlays.length-1;i>=0;i--){
      const o=S.overlays[i];
      if(o.type==='sticker'){ if(x>=o.x && y>=o.y && x<=o.x+o.s && y<=o.y+o.s) return i; }
      else { ctx.save(); ctx.font=`bold ${o.s}px system-ui,Segoe UI Emoji,Apple Color Emoji`; const w=ctx.measureText(o.text).width,h=o.s*1.2; ctx.restore();
             if(x>=o.x && y>=o.y && x<=o.x+w && y<=o.y+h) return i; }
    }
    return -1;
  }
  let isDown=false;
  on(cvs,'mousedown',(e)=>{
    if(!S.img) return;
    const rect=cvs.getBoundingClientRect(); const x=e.clientX-rect.left,y=e.clientY-rect.top;
    const i=hitOverlay(x,y); if(i>-1){ S.dragging=i; isDown=true; const o=S.overlays[i]; S.dragOff.x=x-o.x; S.dragOff.y=y-o.y; draw(); }
  });
  on(window,'mousemove',(e)=>{
    if(!isDown || S.dragging<0) return;
    const rect=cvs.getBoundingClientRect(); const x=e.clientX-rect.left,y=e.clientY-rect.top;
    const o=S.overlays[S.dragging]; o.x=x-S.dragOff.x; o.y=y-S.dragOff.y; draw();
  });
  on(window,'mouseup',()=>{ isDown=false; });
  on(cvs,'dblclick',(e)=>{
    const rect=cvs.getBoundingClientRect(); const x=e.clientX-rect.left,y=e.clientY-rect.top;
    const i=hitOverlay(x,y); if(i<0) return; const o=S.overlays[i];
    if(o.type==='text' || o.type==='emoji'){ const nv=prompt('Edit',o.text); if(nv!==null){ o.text=nv; draw(); } }
  });

  ;[z,r,px,py,br,ct,st,hu,bl].forEach(inp=> on(inp,'input', ()=>{
    S.zoom=parseFloat(z.value||'1'); S.rot=parseFloat(r.value||'0');
    S.panX=parseFloat(px.value||'0'); S.panY=parseFloat(py.value||'0');
    S.bright=parseFloat(br.value||'1'); S.contrast=parseFloat(ct.value||'1');
    S.saturate=parseFloat(st.value||'1'); S.hue=parseFloat(hu.value||'0');
    S.blur=parseFloat(bl.value||'0'); draw();
  }));

  on(BTN_TXT,'click', ()=>{ if(!S.img) return toast('Open an image first'); S.overlays.push({type:'text',text:'Your text',x:24,y:24,s:32}); draw(); });
  on(BTN_EMOJI,'click', ()=>{ if(!S.img) return toast('Open an image first'); const e=prompt('Emoji','😎'); if(!e) return; S.overlays.push({type:'emoji',text:e,x:24,y:24,s:48}); draw(); });
  on(BTN_STICK,'click', ()=>{
    if(!S.img) return toast('Open an image first');
    const u=prompt('Sticker URL (PNG/WebP with transparency)'); if(!u) return;
    const img=new Image(); img.crossOrigin='anonymous'; img.onload=()=>{ S.overlays.push({type:'sticker',img,x:40,y:40,s:120}); draw(); }; img.onerror=()=>toast('Sticker failed'); img.src=u;
  });

  on(BTN_EXPORT,'click', ()=>{
    if(!S.img || S.idx<0 || !window.momSelected || !window.momSelected[S.idx]) return toast('No image selected');
    cvs.toBlob((blob)=>{
      if(!blob) return toast('Export failed');
      const f = new File([blob], 'edited-'+(window.momSelected[S.idx].name||'moment.jpg'), {type:'image/jpeg'});
      window.momSelected[S.idx].file=f; window.momSelected[S.idx].edited=true; drawThumbs(); studio.classList.add('hidden'); toast('Exported ✓');
    }, 'image/jpeg', 0.92);
  });

  on(BTN_CLOSE,'click', ()=> studio.classList.add('hidden'));
  window.openStudioWithFile = async function(idx){
    try{
      if(!cvs) return toast('Studio not available');
      if(!window.momSelected || !window.momSelected.length) return toast('Select an image first');
      if(idx==null) idx=0;
      const item = window.momSelected[idx];
      if(!item || item.kind!=='image') return toast('Studio edits images only');
      S.idx=idx;
      // reset
      z.value='1'; r.value='0'; px.value='0'; py.value='0'; br.value='1'; ct.value='1'; st.value='1'; hu.value='0'; bl.value='0';
      S.zoom=1; S.rot=0; S.panX=0; S.panY=0; S.bright=1; S.contrast=1; S.saturate=1; S.hue=0; S.blur=0; S.overlays=[]; S.dragging=-1;
      studio.classList.remove('hidden'); setCanvasSize();
      S.img = await loadImageFromFile(item.file); S.w=S.img.naturalWidth||S.img.width; S.h=S.img.naturalHeight||S.img.height; draw();
    }catch(err){ toast(err.message||String(err)); }
  };
  on(BTN_OPEN,'click', ()=> window.openStudioWithFile(0));
})();

/* ------------------ Chat ------------------ */
let currentThreadWith = null; // handle
function threadIdFor(a,b){ return [a,b].sort().join('__'); }
function allKnownUsers(){
  // from moments & stories authors + me
  const set = new Map();
  const u = getCurrentUser(); if(u) set.set(u.handle||'guest', {handle:u.handle||'guest', display:u.display||'You', avatar:u.avatar||''});
  getLS(KEYS.moments,[]).forEach(m=> set.set(m.handle, {handle:m.handle, display:m.author, avatar:m.avatar||''}));
  getLS(KEYS.stories,[]).forEach(s=> set.set(s.handle, {handle:s.handle, display:s.author, avatar:s.avatar||''}));
  // also from chat keys
  const chat = getLS(KEYS.chat,{}); Object.keys(chat).forEach(tid=>{
    const [h1,h2] = tid.split('__'); const me=getCurrentUser()?.handle||'guest'; const other = (h1===me? h2 : h1);
    if(other) { const anyMsg=chat[tid]?.find(Boolean); set.set(other,{handle:other, display:other, avatar:''}); }
  });
  // remove guest-only if nothing
  return Array.from(set.values()).filter(x=>x.handle);
}
function unreadCount(handle){
  const me=getCurrentUser()?.handle||'guest'; const tid=threadIdFor(me, handle);
  const msgs = getLS(KEYS.chat,{})[tid]||[];
  return msgs.filter(m=> !m.read && m.to===me).length;
}
function renderContacts(){
  const host = byId('contacts'); if(!host) return; host.innerHTML='';
  const users = allKnownUsers().filter(u=> u.handle !== (getCurrentUser()?.handle||'guest'));
  if(!users.length){ host.innerHTML='<div class="text-xs text-black/60">No contacts yet. Post moments or stories to discover users here.</div>'; return; }
  users.forEach(u=>{
    const row = document.createElement('button');
    row.className='w-full flex items-center justify-between rounded-xl border border-black/10 bg-white/80 px-3 py-2 shadow-sm';
    const uc = unreadCount(u.handle);
    row.innerHTML = `
      <div class="flex items-center gap-2">
        <img src="${u.avatar||''}" class="h-7 w-7 rounded-full border border-black/10 ${u.avatar?'':'hidden'}">
        <div class="text-sm font-semibold">${u.display||u.handle}</div>
        <div class="text-xs text-black/50">@${u.handle}</div>
      </div>
      <span class="rounded-full text-xs px-2 py-0.5 ${uc?'bg-fuchsia-600 text-white':'bg-black/10 text-black/60'}">${uc}</span>
    `;
    row.onclick = ()=> openThread(u.handle, u.display, u.avatar);
    host.appendChild(row);
  });
}
function openThread(handle, display, avatar){
  currentThreadWith = handle;
  byId('chatWith').innerHTML = `Chatting with <b>${display||handle}</b> <span class="text-black/50">@${handle}</span>`;
  renderChat();
  // mark as read
  const me=getCurrentUser()?.handle||'guest'; const tid=threadIdFor(me, handle);
  const store = getLS(KEYS.chat,{}); (store[tid]||[]).forEach(m=>{ if(m.to===me) m.read=true; }); setLS(KEYS.chat, store);
  renderContacts();
}
function renderChat(){
  const host = byId('chatLog'); if(!host) return; host.innerHTML='';
  const me=getCurrentUser()?.handle||'guest';
  const other=currentThreadWith; if(!other){ host.innerHTML='<div class="text-xs text-black/60">Pick a contact to start chatting.</div>'; return; }
  const tid=threadIdFor(me,other);
  const list = getLS(KEYS.chat,{})[tid]||[];
  list.forEach(m=>{
    const row = document.createElement('div');
    row.className = 'mb-2 '+ (m.from===me? 'text-right':'');
    row.innerHTML = `
      <div class='inline-block rounded-xl px-3 py-2 text-sm ${m.from===me?'bg-sky-100':'bg-white/70'}'>
        ${m.text}
      </div>
      <div class='text-[10px] text-black/50'>${new Date(m.ts).toLocaleTimeString()} ${m.read? '✓✓':''}</div>
      ${m.from===me? `<button data-del-msg="${m.id}" class="text-[10px] text-black/50">delete</button>`:''}
    `;
    host.appendChild(row);
  });
  host.scrollTop = host.scrollHeight;
  // deletions
  host.querySelectorAll('[data-del-msg]').forEach(b=>{
    b.onclick = ()=>{
      const id=b.dataset.delMsg;
      const store=getLS(KEYS.chat,{});
      store[tid] = (store[tid]||[]).filter(x=> x.id!==id);
      setLS(KEYS.chat, store);
      renderChat();
    };
  });
}
function sendChatMessage(){
  const input = byId('chatMsg'); const text=(input.value||'').trim(); if(!text) return;
  const meU = getCurrentUser(); const me = meU?.handle||'guest';
  if(!currentThreadWith){ toast('Pick a contact first'); return; }
  const other=currentThreadWith;
  const tid=threadIdFor(me,other);
  const store = getLS(KEYS.chat,{});
  const msg = { id: rand(), from: me, to: other, text, ts: now(), read:false };
  store[tid] = store[tid]||[]; store[tid].push(msg);
  setLS(KEYS.chat, store);
  input.value='';
  renderChat(); renderContacts();
}

/* ------------------ Home & Moments autoplay ------------------ */
function bindKeyboardNav(){
  document.addEventListener('keydown',(e)=>{
    const active = !byId('tab-home').classList.contains('hidden') ? byId('homeFeed') :
                   !byId('tab-moments').classList.contains('hidden') ? byId('momentsFeed') : null;
    if(!active) return;
    if(e.key.toLowerCase()==='j'){ active.scrollBy({top:active.clientHeight*0.9, behavior:'smooth'}); }
    if(e.key.toLowerCase()==='k'){ active.scrollBy({top:-active.clientHeight*0.9, behavior:'smooth'}); }
  });
}

/* ------------------ Global bindings ------------------ */
function bindGlobal(){
  // tabs
  bindTabClicks();
  // search
  bindSearch();
  // stories/moments inputs
  bindStoryInput();
  bindMomInput();

  // buttons
  on(byId('momPost'),'click', postMoment);
  on(byId('openSettings'),'click', ()=>{ loadSettings(); openModal('#settingsModal'); });
  on(byId('openSettings2'),'click', ()=>{ loadSettings(); openModal('#settingsModal'); });

  // auth buttons (delegated)
  document.addEventListener('click',(e)=>{
    const t = e.target;
    if(t.id==='signInBtn'){ document.getElementById('authTitle').textContent='Sign in'; openModal('#authModal'); }
    if(t.id==='signUpBtn'){ document.getElementById('authTitle').textContent='Sign up'; openModal('#authModal'); }
    if(t.id==='logoutBtn'){ clearCurrentUser(); }
    if(t.id==='authClose'){ closeModal('#authModal'); }
    if(t.id==='authSubmit'){
      const display=(byId('auDisplay').value||'').trim();
      const handle=normHandle((byId('auHandle').value||'').trim());
      const avatar=(byId('auAvatar').value||'').trim();
      if(!display){ toast('Enter a display name'); return; }
      if(!handle){ return; }
      setCurrentUser({display,handle,avatar,since:now()});
      closeModal('#authModal'); toast('Welcome, '+display+'!');
      // refresh profile header
      applyUserToUI(getCurrentUser());
    }
    if(t.id==='settingsClose'){ closeModal('#settingsModal'); }
    if(t.id==='settingsSave'){
      const u=getCurrentUser()||{};
      const next={
        ...u,
        display:(byId('stDisplay').value||'').trim(),
        handle:normHandle((byId('stHandle').value||'').trim()) || (u.handle||''),
        avatar:(byId('stAvatar').value||'').trim(),
        bio:(byId('stBio').value||'').trim()
      };
      setCurrentUser(next); closeModal('#settingsModal'); toast('Settings saved');
    }
    if(t.id==='settingsClear'){ clearCurrentUser(); toast('Session cleared'); closeModal('#settingsModal'); }
  });

  // chat
  on(byId('chatSend'),'click', sendChatMessage);
}
function loadSettings(){
  const u=getCurrentUser()||{};
  byId('stDisplay').value = u.display||'';
  byId('stHandle').value  = u.handle||'';
  byId('stAvatar').value  = u.avatar||'';
  byId('stBio').value     = u.bio||'';
}

/* ------------------ Initial paint ------------------ */
ready(()=>{
  ensureAuthUI(); ensureModals(); applyUserToUI(getCurrentUser());
  bindGlobal(); bindKeyboardNav();

  // first paints
  renderStoriesStrip();
  renderMomentsFeed();
  renderHomeFeed();
  renderContacts();
  renderChat();

  // default tab
  switchTab('home');
});
