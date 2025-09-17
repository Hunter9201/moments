/* ===========================================================
   Moments — GH Pages Social (No call-stack overflow)
   - Uses FileReader->base64 for uploads (no big spreads)
   - Images/videos only; HEIC->JPEG conversion if lib present
   - Self-signup (writes users/users.json) with PAT
   - Only registered users can sign in, post, and view
   - Stories (48h), Moments feed, Chat with unread counts
   - Delete own content; delegated events so buttons work
   =========================================================== */

/* ------------------ Small helpers ------------------ */
const byId = (id)=>document.getElementById(id);
const on = (el,ev,fn)=> el&&el.addEventListener(ev,fn);
const ready = (fn)=> document.readyState!=='loading'?fn():document.addEventListener('DOMContentLoaded',fn);
const rand = ()=> Math.random().toString(36).slice(2,9);
const now = ()=> Date.now();
const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
function toast(msg){
  let t=document.getElementById('mhToast'); if(!t){
    t=document.createElement('div'); t.id='mhToast';
    t.style.cssText='position:fixed;right:12px;bottom:12px;z-index:99999;background:#111;color:#fff;padding:10px 12px;border-radius:10px;font:12px/1.3 system-ui;box-shadow:0 6px 24px rgba(0,0,0,.25)';
    document.body.appendChild(t);
  }
  t.textContent=String(msg); t.style.opacity='1'; setTimeout(()=>{t.style.opacity='0'},4000);
}

/* ------------------ Session storage ------------------ */
const SS = { auth:'mh:ss:auth', gh:'mh:ss:gh' };
const getSS=(k)=>{ try{return JSON.parse(sessionStorage.getItem(k))||null}catch{return null} };
const setSS=(k,v)=>{ try{sessionStorage.setItem(k,JSON.stringify(v))}catch{} };
const clrSS=(k)=>{ try{sessionStorage.removeItem(k)}catch{} };

/* ------------------ GitHub API client ------------------ */
const GH = { owner:'hunter9201', repo:'moments', branch:'main', token:'' };
function setGH(cfg){ Object.assign(GH,cfg||{}); setSS(SS.gh, GH); }
const API_HEADERS_BASE = {
  'Accept':'application/vnd.github+json',
  'User-Agent':'momentshub',
  'X-GitHub-Api-Version':'2022-11-28'
};
function ghHeaders(raw=false){
  const h = { ...API_HEADERS_BASE };
  if (raw) h.Accept = 'application/vnd.github.v3.raw';
  if (GH.token) h.Authorization = 'token '+GH.token;
  return h;
}
const encPath = (path)=> path.split('/').map(encodeURIComponent).join('/');

async function ghFetch(url, opts={}){
  const res = await fetch(url, { ...opts, headers: { ...(opts.headers||{}), ...ghHeaders(false) } });
  if (!res.ok) {
    const detail = await res.text().catch(()=> '');
    throw new Error(`GitHub ${opts.method||'GET'} ${url} ${res.status} ${detail.slice(0,200)}`);
  }
  return res;
}
async function ghGet(path, raw=false){
  const url=`https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${encPath(path)}?ref=${encodeURIComponent(GH.branch)}`;
  const res= await ghFetch(url, { headers: ghHeaders(raw) });
  return raw? res : res.json();
}
async function ghGetJSON(path){
  try{
    const meta=await ghGet(path,false);
    const content = meta.content ? atob(meta.content.replace(/\n/g,'')) : '';
    return JSON.parse(content||'{}');
  }catch(e){
    if(String(e.message||'').includes('404') && path==='users/users.json'){
      await ghPutText('users/users.json', JSON.stringify({users:[]},null,2), 'init users');
      return {users:[]};
    }
    throw e;
  }
}
async function ghGetSha(path){
  try{ const meta=await ghGet(path,false); return meta.sha; }catch{ return null; }
}
async function ghPutText(path, text, message){
  const sha = await ghGetSha(path);
  const body = { message, content: btoa(unescape(encodeURIComponent(text))), branch: GH.branch };
  if(sha) body.sha = sha;
  const url=`https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${encPath(path)}`;
  const res=await ghFetch(url,{ method:'PUT', headers:ghHeaders(false), body: JSON.stringify(body) });
  return res.json();
}

/* ---- SAFE base64 for binary (no call-stack overflow) ---- */
function readFileAsBase64(file){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onload=()=>{ const s=String(fr.result||''); const i=s.indexOf(','); resolve(i>=0? s.slice(i+1): s); };
    fr.onerror=reject;
    fr.readAsDataURL(file);
  });
}
async function ghPutBinary(path, file, message){
  const b64 = await readFileAsBase64(file);
  const sha = await ghGetSha(path);
  const body = { message, content: b64, branch: GH.branch };
  if(sha) body.sha = sha;
  const url=`https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${encPath(path)}`;
  const res=await ghFetch(url,{ method:'PUT', headers:ghHeaders(false), body: JSON.stringify(body) });
  return res.json();
}
async function ghDelete(path, message){
  const sha = await ghGetSha(path);
  if(!sha) return;
  const url=`https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${encPath(path)}`;
  await ghFetch(url,{ method:'DELETE', headers:ghHeaders(false), body: JSON.stringify({message, sha, branch:GH.branch}) });
}
async function ghListDir(path){
  const url=`https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${encPath(path)}?ref=${encodeURIComponent(GH.branch)}`;
  try{
    const res=await ghFetch(url,{ headers:ghHeaders(false) });
    const arr = await res.json();
    return Array.isArray(arr) ? arr : [];
  }catch(e){
    if(String(e.message||'').includes('404')) return [];
    throw e;
  }
}

/* ------ Media URL: Pages first, then Git Blob fallback ------ */
function pagesURLFromPath(path){
  return `https://${GH.owner}.github.io/${GH.repo}/${path}`;
}
function guessMime(name=''){
  const ext = name.split('.').pop().toLowerCase();
  if(['jpg','jpeg'].includes(ext)) return 'image/jpeg';
  if(ext==='png') return 'image/png';
  if(ext==='webp') return 'image/webp';
  if(ext==='gif') return 'image/gif';
  if(['mp4','m4v'].includes(ext)) return 'video/mp4';
  if(ext==='webm') return 'video/webm';
  if(ext==='mov') return 'video/quicktime';
  return 'application/octet-stream';
}
async function mediaURLFromPath(path){
  const url = pagesURLFromPath(path);
  try { const ping = await fetch(url, { method:'GET', cache:'no-store' }); if (ping.ok) return url; } catch(_) {}
  const meta = await ghGet(path,false);
  const sha = meta.sha, name = meta.name || '';
  const blobRes = await ghFetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}/git/blobs/${sha}`);
  const blobJson = await blobRes.json();
  const b64data = (blobJson.content || '').replace(/\n/g,'');
  const bin = atob(b64data);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: guessMime(name) });
  return URL.createObjectURL(blob);
}

/* ------------------ App State ------------------ */
const STORY_TTL = 48*60*60*1000; // 48h
let momSelected=[];                      // selected up to 4
let currentThreadWith=null;              // handle
let allowedUsersCache=null;              // {users:[...]}
let momentsCache=[];                     // moments
let storiesCache=[];                     // stories

/* ------------------ UI shell (auth/settings/connect/studio) ------------------ */
function ensureUIChrome(){
  const area = document.querySelector('header .flex.items-center.gap-2');
  if(area && !byId('signInBtn')){
    const si=document.createElement('button'); si.id='signInBtn'; si.type='button'; si.textContent='Sign in';
    si.className='rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-semibold shadow-sm';
    const su=document.createElement('button'); su.id='signUpBtn'; su.type='button'; su.textContent='Sign up';
    su.className='rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-semibold shadow-sm';
    const lo=document.createElement('button'); lo.id='logoutBtn'; lo.type='button'; lo.textContent='Log out';
    lo.className='rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-semibold shadow-sm hidden';
    const pill=document.createElement('div'); pill.id='userPill'; pill.className='flex items-center gap-2 ml-2';
    pill.innerHTML=`<img id="userAvatar" class="hidden h-7 w-7 rounded-full border border-black/10"><span id="userName" class="hidden text-xs font-semibold"></span>`;
    area.appendChild(si); area.appendChild(su); area.appendChild(lo); area.appendChild(pill);
  }
  if(!byId('authModal')){
    const m=document.createElement('div'); m.id='authModal'; m.className='hidden fixed inset-0 z-50 grid place-items-center bg-black/60 p-4';
    m.innerHTML=`
      <div class="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg">
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm font-bold">Sign in</div>
          <button id="authClose" class="rounded bg-black/10 px-2 py-1 text-xs">Close</button>
        </div>
        <div class="grid gap-2 text-sm">
          <input id="auHandle" class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="@handle"/>
          <button id="authSubmit" class="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-semibold shadow-sm">Continue</button>
          <small class="text-black/60">Your handle must exist in users/users.json.</small>
        </div>
      </div>`;
    document.body.appendChild(m);
  }
  if(!byId('regModal')){
    const m=document.createElement('div'); m.id='regModal'; m.className='hidden fixed inset-0 z-50 grid place-items-center bg-black/60 p-4';
    m.innerHTML=`
      <div class="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg">
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm font-bold">Create account</div>
          <button id="regClose" class="rounded bg-black/10 px-2 py-1 text-xs">Close</button>
        </div>
        <div class="grid gap-2 text-sm">
          <input id="rgHandle"  class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="@handle (2–20 chars)"/>
          <input id="rgDisplay" class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="Display name"/>
          <input id="rgAvatar"  class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="Avatar URL (optional)"/>
          <textarea id="rgBio" rows="2" class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="Bio (optional)"></textarea>
          <button id="regSubmit" class="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-semibold shadow-sm">Sign up</button>
          <small class="text-black/60">Requires a PAT connection (Connect).</small>
        </div>
      </div>`;
    document.body.appendChild(m);
  }
  if(!byId('settingsModal')){
    const m=document.createElement('div'); m.id='settingsModal'; m.className='hidden fixed inset-0 z-50 grid place-items-center bg-black/60 p-4';
    m.innerHTML=`
      <div class="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg">
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm font-bold">Profile</div>
          <button id="settingsClose" class="rounded bg-black/10 px-2 py-1 text-xs">Close</button>
        </div>
        <div class="grid gap-2 text-sm">
          <input id="stDisplay" class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="Display name"/>
          <input id="stAvatar"  class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="Avatar URL"/>
          <textarea id="stBio" rows="3" class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="Short bio"></textarea>
          <div class="flex items-center justify-between mt-1">
            <button id="settingsSave" class="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-semibold shadow-sm">Save</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
  }
  if(!byId('connectModal')){
    const m=document.createElement('div'); m.id='connectModal'; m.className='hidden fixed inset-0 z-50 grid place-items-center bg-black/60 p-4';
    m.innerHTML=`
      <div class="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg">
        <div class="flex items-center justify-between mb-2">
          <div class="text-sm font-bold">Connect to GitHub</div>
          <button id="connectClose" class="rounded bg-black/10 px-2 py-1 text-xs">Close</button>
        </div>
        <div class="grid gap-2 text-sm">
          <input id="ghOwner"  class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="owner" value="hunter9201"/>
          <input id="ghRepo"   class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="repo" value="moments"/>
          <input id="ghBranch" class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="branch" value="main"/>
          <input id="ghToken"  class="rounded-xl border border-black/10 bg-white/80 px-3 py-2" placeholder="GitHub PAT (repo scope)"/>
          <button id="connectSave" class="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-semibold shadow-sm">Save & Connect</button>
          <small class="text-black/60">Use a PAT limited to this repo.</small>
        </div>
      </div>`;
    document.body.appendChild(m);
  }
  if(!byId('storyModal')){
    const m=document.createElement('div'); m.id='storyModal'; m.className='hidden fixed inset-0 z-50 grid place-items-center bg-black/60 p-4';
    document.body.appendChild(m);
  }
  if(!byId('studio')){
    const s=document.createElement('div'); s.id='studio'; s.className='hidden fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4';
    s.innerHTML=`<div class="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-lg">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm font-bold">Studio — quick crop/fit</div>
        <button id="studioClose" class="rounded bg-black/10 px-2 py-1 text-xs">Close</button>
      </div>
      <div><input id="studioScale" type="range" min="0.7" max="1.5" step="0.01" value="1"></div>
      <div class="mt-3"><img id="studioImg" class="max-h-[60vh] mx-auto rounded-lg border border-black/10"/></div>
      <div class="mt-3"><button id="studioApply" class="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-semibold shadow-sm">Apply</button></div>
    </div>`;
    document.body.appendChild(s);
  }
}

/* ------------------ Auth ------------------ */
function normHandle(h){ if(!h) return ''; h=h.replace(/^@/,'').trim(); if(!/^[A-Za-z0-9._-]{2,20}$/.test(h)){ toast('Handle must be 2–20 chars'); return ''; } return h; }
function getUser(){ return getSS(SS.auth); }
function setUser(u){ setSS(SS.auth,u); applyUserToUI(u); }
function clearUser(){ clrSS(SS.auth); applyUserToUI(null); }
async function fetchAllowedUsers(){
  allowedUsersCache = await ghGetJSON('users/users.json');
  if(!allowedUsersCache || !Array.isArray(allowedUsersCache.users)) throw new Error('users.json invalid');
  return allowedUsersCache.users;
}
function applyUserToUI(u){
  const si=byId('signInBtn'), su=byId('signUpBtn'), lo=byId('logoutBtn');
  const av=byId('userAvatar'), nm=byId('userName');
  const pfA=byId('pfAvatar'), pfN=byId('pfName'), pfH=byId('pfHandle'), pfB=byId('pfBio');
  if(u){
    si?.classList.add('hidden'); su?.classList.add('hidden'); lo?.classList.remove('hidden');
    const avatar=u.avatar || ('https://ui-avatars.com/api/?name='+encodeURIComponent(u.display||u.handle));
    av&&(av.src=avatar, av.classList.remove('hidden'));
    nm&&(nm.textContent=u.display||u.handle, nm.classList.remove('hidden'));
    pfA&&(pfA.src=avatar); pfN&&(pfN.textContent=u.display||u.handle); pfH&&(pfH.textContent='@'+u.handle); pfB&&(pfB.textContent=u.bio||'');
  }else{
    si?.classList.remove('hidden'); su?.classList.remove('hidden'); lo?.classList.add('hidden');
    av&&av.classList.add('hidden'); nm&&nm.classList.add('hidden');
    pfA&&(pfA.src=''); pfN&&(pfN.textContent='Guest'); pfH&&(pfH.textContent='@guest'); pfB&&(pfB.textContent='');
  }
}

/* ------------------ Tabs / Search ------------------ */
function switchTab(t){ ['home','moments','chat','profile'].forEach(k=> byId('tab-'+k).classList.toggle('hidden',k!==t)); }
function bindTabs(){ document.addEventListener('click',(e)=>{ const b=e.target.closest('[data-tab]'); if(!b) return; switchTab(b.dataset.tab); }); }
function bindSearch(){
  const s=byId('search'); on(s,'input',()=>{ const q=(s.value||'').toLowerCase().trim(); Array.from(document.querySelectorAll('[data-searchable]')).forEach(n=>{ n.style.display=(n.dataset.searchable||'').includes(q)?'':''; }); });
}

/* ------------------ File normalize (HEIC->JPEG if lib present) ------------------ */
async function normalizeFile(file){
  try{
    if ((/^image\/heic$/i.test(file.type)) || /\.heic$/i.test(file.name)) {
      if (typeof heic2any!=='undefined'){
        const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
        return new File([blob], file.name.replace(/\.heic$/i,'.jpg'), { type: 'image/jpeg' });
      }
    }
  }catch{ /* ignore */ }
  return file;
}

/* ------------------ Data model — Moments / Stories ------------------ */
let momentsCache=[], storiesCache=[];
const STORY_TTL = 48*60*60*1000;

async function ghLoadMoments(){
  const me=getUser(); if(!me){ momentsCache=[]; return []; }
  const folders = await ghListDir('moments');
  const files = [];
  for(const f of folders){ if(f.type==='dir'){ const inside=await ghListDir(f.path); inside.forEach(x=> x.type==='file' && x.name.endsWith('.json') && files.push(x)); } }
  const metas = [];
  for(const f of files){ try{ metas.push(await ghGetJSON(f.path)); }catch{} }
  metas.sort((a,b)=> (b.created||0)-(a.created||0));
  momentsCache = metas;
}
async function ghLoadStories(){
  const me=getUser(); if(!me){ storiesCache=[]; return []; }
  const folders = await ghListDir('stories');
  const files = [];
  for(const f of folders){ if(f.type==='dir'){ const inside=await ghListDir(f.path); inside.forEach(x=> x.type==='file' && x.name.endsWith('.json') && files.push(x)); } }
  const metas = [];
  for(const f of files){ try{ metas.push(await ghGetJSON(f.path)); }catch{} }
  const nowTs=now();
  storiesCache = metas.filter(s=> (nowTs-(s.created||0))<STORY_TTL).sort((a,b)=> (b.created||0)-(a.created||0));
}
async function ghUploadMediaFile(handle, file){
  file = await normalizeFile(file);
  const ts = Date.now();
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g,'_');
  const path = `media/${handle}/${ts}_${safeName}`;
  await ghPutBinary(path, file, `media: ${handle}/${safeName}`);
  return path;
}
async function ghCreateMoment(handle, user, file, caption, tags){
  const mediaPath = await ghUploadMediaFile(handle, file);
  const id = rand();
  const meta = {
    id, kind: file.type.startsWith('video')?'video':'image',
    mediaPath, caption, tags, author: user.display||user.handle,
    handle, avatar: user.avatar||'', created: now(), likes:0, liked: false, comments:[]
  };
  const path = `moments/${handle}/${meta.created}_${id}.json`;
  await ghPutText(path, JSON.stringify(meta,null,0), `moment: ${handle}/${id}`);
  return meta;
}
async function ghCreateStory(handle, user, file){
  const mediaPath = await ghUploadMediaFile(handle, file);
  const id = rand();
  const meta = {
    id, kind: file.type.startsWith('video')?'video':'image',
    mediaPath, caption:'', author: user.display||user.handle, handle,
    avatar: user.avatar||'', created: now()
  };
  const path = `stories/${handle}/${meta.created}_${id}.json`;
  await ghPutText(path, JSON.stringify(meta,null,0), `story: ${handle}/${id}`);
  return meta;
}
async function ghDeleteMoment(meta){
  const path = `moments/${meta.handle}/${meta.created}_${meta.id}.json`;
  await ghDelete(path, `delete moment ${meta.id}`);
  if(meta.mediaPath) await ghDelete(meta.mediaPath, `delete media ${meta.id}`);
}
async function ghDeleteStory(meta){
  const path = `stories/${meta.handle}/${meta.created}_${meta.id}.json`;
  await ghDelete(path, `delete story ${meta.id}`);
  if(meta.mediaPath) await ghDelete(meta.mediaPath, `delete story media ${meta.id}`);
}

/* ------------------ Rendering ------------------ */
function autoPlayVisible(){
  const vids = Array.from(document.querySelectorAll('.mom-video'));
  if(!('IntersectionObserver' in window)){ vids.forEach(v=>{try{v.play()}catch{}}); return; }
  const obs = new IntersectionObserver((ents)=> ents.forEach(en=>{
    const v=en.target; if(en.isIntersecting && en.intersectionRatio>0.6){ try{v.play()}catch{} } else { try{v.pause()}catch{} }
  }), {threshold:[0,0.25,0.5,0.75,1]});
  vids.forEach(v=> obs.observe(v));
}
async function renderHomeFeed(){
  const host=byId('homeFeed'); const me=getUser();
  if(!me){ host.innerHTML = `<div class="p-4 text-sm text-black/60">Sign in to view the feed.</div>`; return; }
  host.innerHTML='';
  for(const m of momentsCache){
    const wrap=document.createElement('div');
    wrap.className='mom-item rounded-2xl border border-black/10 bg-black/90 text-white overflow-hidden relative';
    wrap.dataset.searchable = `${(m.caption||'')+' '+(m.tags||[]).join(' ')+' '+(m.author||'')}`.toLowerCase();
    const mediaURL = await mediaURLFromPath(m.mediaPath);
    const mediaHTML = m.kind==='video'
      ? `<video class="mom-video absolute inset-0 h-full w-full object-cover" src="${mediaURL}" playsinline muted loop></video>`
      : `<img class="absolute inset-0 h-full w-full object-cover" src="${mediaURL}" alt="">`;
    wrap.innerHTML=`
      <div class='aspect-[9/16] w-full relative'>
        ${mediaHTML}
        <div class='absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-black/0'>
          <div class='flex items-center gap-2'>
            <img src="${m.avatar||''}" class="h-6 w-6 rounded-full border border-white/30 ${m.avatar?'':'hidden'}">
            <div class='text-sm font-semibold'>${m.author||'User'} <span class='text-white/70 text-xs'>@${m.handle||'user'}</span></div>
          </div>
          <div class='text-sm opacity-90'>${m.caption||''}</div>
          <div class='text-xs opacity-70'>${(m.tags||[]).map(t=>'#'+t).join(' ')}</div>
        </div>
        <div class='absolute right-2 top-2 flex flex-col gap-2'>
          <button class='rounded-full bg-white/10 px-3 py-1 text-xs' data-del-home='${m.id}|${m.handle}|${m.created}'>🗑 Delete</button>
        </div>
      </div>`;
    host.appendChild(wrap);
  }
  host.querySelectorAll('[data-del-home]').forEach(b=>{
    b.onclick = async ()=>{
      const [id,handle,created]=b.dataset.delHome.split('|');
      const me=getUser(); if(!me || me.handle!==handle){ toast('Only author can delete'); return; }
      const meta = momentsCache.find(x=> x.id===id && x.handle===handle && String(x.created)===created);
      try{ await ghDeleteMoment(meta); toast('Deleted'); await refreshAll(); }catch(e){ toast(e.message); }
    };
  });
  autoPlayVisible();
}
async function renderMomentsFeed(){
  const host=byId('momentsFeed'); const me=getUser();
  if(!me){ host.innerHTML = `<div class="p-4 text-sm text-black/60">Sign in to view moments.</div>`; return; }
  host.innerHTML='';
  for(const m of momentsCache){
    const wrap=document.createElement('div');
    wrap.className='mom-item rounded-2xl border border-black/10 bg-black/90 text-white overflow-hidden relative';
    wrap.dataset.searchable = `${(m.caption||'')+' '+(m.tags||[]).join(' ')+' '+(m.author||'')}`.toLowerCase();
    const mediaURL = await mediaURLFromPath(m.mediaPath);
    const media = m.kind==='video'
      ? `<video class="mom-video absolute inset-0 h-full w-full object-cover" src="${mediaURL}" playsinline muted loop></video>`
      : `<img class="absolute inset-0 h-full w-full object-cover" src="${mediaURL}" alt="">`;
    wrap.innerHTML=`
      <div class='aspect-[9/16] w-full relative'>
        ${media}
        <div class='absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-black/0'>
          <div class='flex items-center gap-2'>
            <img src="${m.avatar||''}" class="h-6 w-6 rounded-full border border-white/30 ${m.avatar?'':'hidden'}">
            <div class='text-sm font-semibold'>${m.author||'User'} <span class='text-white/70 text-xs'>@${m.handle||'user'}</span></div>
          </div>
          <div class='text-sm opacity-90'>${m.caption||''}</div>
          <div class='text-xs opacity-70'>${(m.tags||[]).map(t=>'#'+t).join(' ')}</div>
        </div>
        <div class='absolute right-2 top-2 flex flex-col gap-2'>
          <button class='rounded-full bg-white/10 px-3 py-1 text-xs' data-del-mom='${m.id}|${m.handle}|${m.created}'>🗑 Delete</button>
        </div>
      </div>`;
    host.appendChild(wrap);
  }
  host.querySelectorAll('[data-del-mom]').forEach(b=>{
    b.onclick = async ()=>{
      const [id,handle,created]=b.dataset.delMom.split('|');
      const me=getUser(); if(!me || me.handle!==handle){ toast('Only author can delete'); return; }
      const meta = momentsCache.find(x=> x.id===id && x.handle===handle && String(x.created)===created);
      try{ await ghDeleteMoment(meta); toast('Deleted'); await refreshAll(); }catch(e){ toast(e.message); }
    };
  });
  autoPlayVisible();
}
async function renderStoriesStrip(){
  const host=byId('storiesStrip'); const me=getUser();
  if(!me){ host.innerHTML = `<div class="p-2 text-xs text-black/60">Sign in to view stories.</div>`; return; }
  host.innerHTML='';
  const nowTs=now();
  const valid = storiesCache.filter(s=> (nowTs-(s.created||0))<STORY_TTL);
  for(let i=0;i<valid.length;i++){
    const s=valid[i];
    const btn=document.createElement('button'); btn.className='flex flex-col items-center gap-1';
    const blobURL = await mediaURLFromPath(s.mediaPath);
    const media = s.kind==='image'
      ? `<img src="${blobURL}" class="h-16 w-16 object-cover rounded-full border-2 border-fuchsia-400"/>`
      : `<video src="${blobURL}" class="h-16 w-16 object-cover rounded-full border-2 border-fuchsia-400" muted></video>`;
    btn.innerHTML=`${media}<span class='text-[11px] max-w-20 truncate'>${s.author||'Story'}</span>`;
    btn.onclick = ()=> openStoryViewer(valid, i);
    host.appendChild(btn);
  }
}
function openStoryViewer(list, startIndex){
  const modal=byId('storyModal'); modal.classList.remove('hidden');
  modal.innerHTML=`
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
  const bar=byId('storyBar'), wrap=byId('storyWrap'), meta=byId('storyMeta');
  let i=startIndex, timer=null, t0=0, dur=7000;
  async function render(){
    const s = list[i]; if(!s){ modal.classList.add('hidden'); return; }
    wrap.innerHTML=''; const url=await mediaURLFromPath(s.mediaPath);
    if(s.kind==='video'){ const v=document.createElement('video'); v.src=url; v.autoplay=true; v.muted=true; v.playsInline=true; v.className='h-full w-full object-cover'; wrap.appendChild(v); }
    else { const img=document.createElement('img'); img.src=url; img.className='h-full w-full object-cover'; wrap.appendChild(img); }
    meta.textContent = `${s.author||''}`;
    bar.style.width='0%'; t0=now(); clearInterval(timer);
    timer=setInterval(()=>{ const p=Math.min(1,(now()-t0)/dur); bar.style.width=(p*100)+'%'; if(p>=1){ i=Math.min(i+1, list.length-1); render(); } },50);
    byId('st-del').onclick = async ()=>{
      const me=getUser(); if(!me || me.handle!==s.handle){ toast('Only author can delete'); return; }
      try{ await ghDeleteStory(s); toast('Deleted'); await refreshAll(); modal.classList.add('hidden'); }catch(e){ toast(e.message); }
    };
  }
  byId('st-next').onclick=()=>{ i=Math.min(i+1, list.length-1); render(); };
  byId('st-prev').onclick=()=>{ i=Math.max(i-1, 0); render(); };
  byId('st-close').onclick=()=> modal.classList.add('hidden');
  render();
}

/* ------------------ Composer ------------------ */
function bindComposer(){
  const momInput=byId('momFile'); if(momInput && !momInput.__bound__){
    momInput.__bound__=true;
    on(momInput,'change', async (e)=>{
      const raw=Array.from(e.target.files||[]);
      const norm=[]; for(const f of raw){ const ff=await normalizeFile(f); norm.push(ff); }
      const files=norm.filter(f=> /^image\/|^video\//.test(f.type));
      if(!files.length){ toast('Images/videos only'); momInput.value=''; return; }
      const room = Math.max(0, 4 - momSelected.length);
      files.slice(0,room).forEach(f=> momSelected.push({file:f, kind: f.type.startsWith('video')?'video':'image', name:f.name}));
      momInput.value='';
      drawThumbs();
    });
  }
  const stoInput=byId('storyFile'); if(stoInput && !stoInput.__bound__){
    stoInput.__bound__=true;
    on(stoInput,'change', async (e)=>{
      const me=getUser(); if(!me){ toast('Sign in first'); return; }
      const raw=Array.from(e.target.files||[]).slice(0,4);
      const norm=[]; for(const f of raw){ const ff=await normalizeFile(f); norm.push(ff); }
      const files=norm.filter(f=> /^image\/|^video\//.test(f.type));
      let ok=0, bad=0;
      for(const f of files){ try{ await ghCreateStory(me.handle, me, f); ok++; }catch(err){ bad++; toast(err.message);} await sleep(50); }
      stoInput.value='';
      if(ok) toast(`Added ${ok} stor${ok>1?'ies':'y'} ✓`);
      if(bad) toast(`${bad} failed`);
      await refreshStories();
    });
  }
  on(byId('momPost'),'click', async ()=>{
    const me=getUser(); if(!me){ toast('Sign in first'); return; }
    if(!momSelected.length){ toast('Pick up to 4 files'); return; }
    const caption=(byId('momCaption').value||'').trim();
    const tags=(byId('momTags').value||'').split(',').map(s=>s.trim().replace(/^#/,'')).filter(Boolean);
    let ok=0, fail=0;
    for(const it of momSelected){
      try{ await ghCreateMoment(me.handle, me, it.file, caption, tags); ok++; }catch(err){ fail++; toast(err.message); }
      await sleep(50);
    }
    momSelected=[]; drawThumbs();
    byId('momCaption').value=''; byId('momTags').value='';
    if(ok) toast(`Posted ${ok} moment${ok>1?'s':''} ✓`); if(fail) toast(`${fail} failed`);
    await refreshMoments();
  });
  on(byId('openStudio'),'click', ()=> openStudio(0));
}
function drawThumbs(){
  const host=byId('momThumbs'); host.innerHTML='';
  momSelected.forEach((it,idx)=>{
    const url=URL.createObjectURL(it.file);
    const cell=document.createElement('div'); cell.className='relative';
    const media= it.kind==='image'
      ? `<img src="${url}" class="h-16 w-16 object-cover rounded-lg border border-black/10">`
      : `<video src="${url}" class="h-16 w-16 object-cover rounded-lg border border-black/10" muted></video>`;
    cell.innerHTML = `${media}
      <button data-edit="${idx}" class="absolute right-1 top-1 rounded bg-white/80 text-xs px-1">✎</button>
      <button data-del="${idx}" class="absolute left-1 top-1 rounded bg-white/80 text-xs px-1">🗑</button>`;
    host.appendChild(cell);
  });
  host.querySelectorAll('[data-del]').forEach(b=> b.onclick=()=>{ momSelected.splice(parseInt(b.dataset.del,10),1); drawThumbs(); });
  host.querySelectorAll('[data-edit]').forEach(b=> b.onclick=()=> openStudio(parseInt(b.dataset.edit,10)));
}

/* ------------------ Simple Studio (scale only) ------------------ */
function openStudio(idx){
  const it=momSelected[idx]; if(!it || it.kind!=='image'){ toast('Studio edits images only'); return; }
  const s=byId('studio'); const img=byId('studioImg'); const scale=byId('studioScale');
  img.src=URL.createObjectURL(it.file); s.classList.remove('hidden');
  byId('studioClose').onclick=()=> s.classList.add('hidden');
  byId('studioApply').onclick=async ()=>{
    const canvas=document.createElement('canvas'); const imgel=new Image();
    imgel.onload=()=>{
      const w=imgel.width, h=imgel.height; canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext('2d'); const sc=parseFloat(scale.value||'1');
      const nx=w*sc, ny=h*sc; const ox=(nx-w)/2, oy=(ny-h)/2;
      ctx.drawImage(imgel, -ox, -oy, nx, ny);
      canvas.toBlob((blob)=>{
        if(!blob) return; momSelected[idx].file=new File([blob], 'edited-'+it.name, {type:'image/jpeg'}); s.classList.add('hidden'); drawThumbs(); toast('Applied ✓');
      }, 'image/jpeg', 0.92);
    };
    imgel.src=img.src;
  };
}

/* ------------------ Chat (GH-backed) ------------------ */
function threadIdFor(a,b){ return [a,b].sort().join('__'); }
async function ghLoadThread(a,b){
  const tid=threadIdFor(a,b);
  try{ return await ghGetJSON(`chat/${tid}.json`); }catch{ return {messages:[]} }
}
async function ghSaveThread(a,b,doc){
  const tid=threadIdFor(a,b);
  await ghPutText(`chat/${tid}.json`, JSON.stringify(doc,null,0), `chat: ${tid}`);
}
async function sendChatMessage(){
  const me=getUser(); if(!me){ toast('Sign in first'); return; }
  if(!currentThreadWith){ toast('Pick a contact'); return; }
  const input=byId('chatMsg'); const text=(input.value||'').trim(); if(!text) return;
  const doc=await ghLoadThread(me.handle,currentThreadWith);
  doc.messages.push({id:rand(), from:me.handle, to:currentThreadWith, text, ts:now(), readBy:[me.handle]});
  await ghSaveThread(me.handle,currentThreadWith,doc);
  input.value=''; await renderChat(); await renderContacts(); toast('Sent');
}
async function openThread(handle, display, avatar){
  currentThreadWith=handle; byId('chatWith').innerHTML=`Chatting with <b>${display||handle}</b> <span class="text-black/50">@${handle}</span>`;
  await renderChat();
  const me=getUser(); if(!me) return;
  const doc=await ghLoadThread(me.handle,currentThreadWith);
  let changed=false;
  doc.messages.forEach(m=>{ if(m.to===me.handle && !(m.readBy||[]).includes(me.handle)){ m.readBy=m.readBy||[]; m.readBy.push(me.handle); changed=true; }});
  if(changed) await ghSaveThread(me.handle,currentThreadWith,doc);
  await renderContacts();
}
async function unreadCountFor(meHandle, other){
  const doc=await ghLoadThread(meHandle, other);
  return (doc.messages||[]).filter(m=> m.to===meHandle && !(m.readBy||[]).includes(meHandle)).length;
}
async function renderContacts(){
  const me=getUser(); const host=byId('contacts'); host.innerHTML='';
  if(!me){ host.innerHTML='<div class="text-xs text-black/60">Sign in to see contacts.</div>'; return; }
  const users=(allowedUsersCache?.users||[]).filter(u=> u.handle !== me.handle);
  if(!users.length){ host.innerHTML='<div class="text-xs text-black/60">No contacts</div>'; return; }
  for(const u of users){
    const row=document.createElement('button');
    row.className='w-full flex items-center justify-between rounded-xl border border-black/10 bg-white/80 px-3 py-2 shadow-sm';
    const uc = await unreadCountFor(me.handle, u.handle);
    row.innerHTML=`
      <div class="flex items-center gap-2">
        <img src="${u.avatar||''}" class="h-7 w-7 rounded-full border border-black/10 ${u.avatar?'':'hidden'}">
        <div class="text-sm font-semibold">${u.display||u.handle}</div>
        <div class="text-xs text-black/50">@${u.handle}</div>
      </div>
      <span class="rounded-full text-xs px-2 py-0.5 ${uc?'bg-fuchsia-600 text-white':'bg-black/10 text-black/60'}">${uc}</span>`;
    row.onclick=()=> openThread(u.handle, u.display, u.avatar);
    host.appendChild(row);
  }
}
async function renderChat(){
  const host=byId('chatLog'); host.innerHTML='';
  const me=getUser(); if(!me || !currentThreadWith){ host.innerHTML='<div class="text-xs text-black/60">Pick a contact</div>'; return; }
  const doc=await ghLoadThread(me.handle,currentThreadWith);
  for(const m of (doc.messages||[])){
    const row=document.createElement('div'); row.className='mb-2 '+ (m.from===me.handle?'text-right':'');
    row.innerHTML=`
      <div class='inline-block rounded-xl px-3 py-2 text-sm ${m.from===me.handle?'bg-sky-100':'bg-white/70'}'>${m.text}</div>
      <div class='text-[10px] text-black/50'>${new Date(m.ts).toLocaleTimeString()} ${(m.readBy||[]).includes(currentThreadWith)? '✓✓':''}</div>
      ${m.from===me.handle? `<button data-del-msg="${m.id}" class="text-[10px] text-black/50">delete</button>`:''}
    `;
    host.appendChild(row);
  }
  host.querySelectorAll('[data-del-msg]').forEach(b=>{
    b.onclick = async ()=>{
      const id=b.dataset.delMsg;
      const doc=await ghLoadThread(me.handle,currentThreadWith);
      doc.messages = (doc.messages||[]).filter(x=> x.id!==id);
      await ghSaveThread(me.handle,currentThreadWith,doc);
      await renderChat();
    };
  });
  host.scrollTop=host.scrollHeight;
}

/* ------------------ Keyboard nav ------------------ */
function bindKeyboardNav(){
  document.addEventListener('keydown',(e)=>{
    const active = !byId('tab-home').classList.contains('hidden') ? byId('homeFeed') :
                   !byId('tab-moments').classList.contains('hidden') ? byId('momentsFeed') : null;
    if(!active) return;
    if(e.key.toLowerCase()==='j'){ active.scrollBy({top:active.clientHeight*0.9, behavior:'smooth'}); }
    if(e.key.toLowerCase()==='k'){ active.scrollBy({top:-active.clientHeight*0.9, behavior:'smooth'}); }
  });
}

/* ------------------ Connect & Settings ------------------ */
function openConnect(){
  ensureUIChrome();
  const m = byId('connectModal');
  const gh = getSS(SS.gh) || GH;
  byId('ghOwner').value  = gh.owner;
  byId('ghRepo').value   = gh.repo;
  byId('ghBranch').value = gh.branch;
  byId('ghToken').value  = gh.token || '';
  m.classList.remove('hidden');
}
function closeConnect(){ byId('connectModal').classList.add('hidden'); }
function openSettings(){ const u=getUser()||{}; byId('stDisplay').value=u.display||''; byId('stAvatar').value=u.avatar||''; byId('stBio').value=u.bio||''; byId('settingsModal').classList.remove('hidden'); }
function closeSettings(){ byId('settingsModal').classList.add('hidden'); }

/* ------------------ Self-Registration ------------------ */
function normHandleStrict(h){ return normHandle(h); }
async function registerUser(handle, display, avatar, bio){
  handle = normHandleStrict(handle); if(!handle) throw new Error('Invalid handle');
  display = (display||handle).trim(); avatar=(avatar||'').trim(); bio=(bio||'').trim();
  for(let attempt=0; attempt<3; attempt++){
    const usersDoc = await ghGetJSON('users/users.json');
    const arr = Array.isArray(usersDoc.users)? usersDoc.users : (usersDoc.users=[]);
    if(arr.find(u=> (u.handle||'').toLowerCase()===handle.toLowerCase())) throw new Error('Handle already exists');
    const next = {users: [...arr, {handle, display, avatar, bio}]};
    try{
      await ghPutText('users/users.json', JSON.stringify(next,null,2), `register user ${handle}`);
      allowedUsersCache = next;
      return {handle, display, avatar, bio};
    }catch(e){
      if(attempt===2) throw e;
      await sleep(300);
    }
  }
}

/* ------------------ Refresh pipeline ------------------ */
async function refreshMoments(){ await ghLoadMoments(); await renderMomentsFeed(); await renderHomeFeed(); }
async function refreshStories(){ await ghLoadStories(); await renderStoriesStrip(); }
async function refreshAll(){
  const me=getUser();
  if(!me){
    byId('homeFeed').innerHTML = `<div class="p-4 text-sm text-black/60">Sign in to view the feed.</div>`;
    byId('momentsFeed').innerHTML = `<div class="p-4 text-sm text-black/60">Sign in to view moments.</div>`;
    byId('storiesStrip').innerHTML = `<div class="p-2 text-xs text-black/60">Sign in to view stories.</div>`;
    await renderContacts();
    return;
  }
  await refreshMoments(); await refreshStories(); await renderContacts();
}

/* ------------------ BOOT ------------------ */
ready(async ()=>{
  ensureUIChrome();

  // Delegated clicks
  document.addEventListener('click', (e)=>{
    const sel = (s)=> e.target.closest(s);
    if (sel('#connectGitHub')) { e.preventDefault(); openConnect(); return; }
    if (sel('#openSettings') || sel('#openSettings2')) { e.preventDefault(); openSettings(); return; }
    if (sel('#signInBtn')) { e.preventDefault(); ensureUIChrome(); byId('authModal').classList.remove('hidden'); return; }
    if (sel('#signUpBtn')) { e.preventDefault(); ensureUIChrome(); byId('regModal').classList.remove('hidden'); return; }
    if (sel('#logoutBtn')) { e.preventDefault(); clearUser(); toast('Logged out'); refreshAll(); return; }
    if (sel('#authClose')) { e.preventDefault(); byId('authModal').classList.add('hidden'); return; }
    if (sel('#regClose')) { e.preventDefault(); byId('regModal').classList.add('hidden'); return; }
    if (sel('#settingsClose')) { e.preventDefault(); closeSettings(); return; }
    if (sel('#connectClose')) { e.preventDefault(); closeConnect(); return; }
  });

  bindTabs(); bindSearch(); bindKeyboardNav(); bindComposer();
  on(byId('chatSend'),'click', sendChatMessage);

  on(byId('settingsSave'),'click', ()=>{
    const u=getUser()||{}; const next={...u, display:(byId('stDisplay').value||'').trim(), avatar:(byId('stAvatar').value||'').trim(), bio:(byId('stBio').value||'').trim()};
    setUser(next); toast('Saved');
  });

  on(byId('connectSave'),'click', async ()=>{
    const owner=(byId('ghOwner').value||'').trim();
    const repo=(byId('ghRepo').value||'').trim();
    const branch=(byId('ghBranch').value||'main').trim();
    const token=(byId('ghToken').value||'').trim();
    if(!owner||!repo||!token){ toast('Fill owner, repo, token'); return; }
    setGH({owner,repo,branch,token});
    try{
      await fetchAllowedUsers(); toast('Connected ✓');
      closeConnect();
      await refreshAll();
    }catch(e){ toast(e.message||'Connect failed'); }
  });

  on(byId('authSubmit'),'click', async ()=>{
    try{
      const h = normHandle((byId('auHandle').value||'').trim()); if(!h) return;
      const users = await fetchAllowedUsers();
      const u = users.find(x=> (x.handle||'').toLowerCase()===h.toLowerCase());
      if(!u){ toast('Handle not found. Try Sign up.'); return; }
      setUser({handle:u.handle, display:u.display||u.handle, avatar:u.avatar||'', bio:u.bio||''});
      byId('authModal').classList.add('hidden');
      toast('Signed in as @'+u.handle);
      await refreshAll();
    }catch(e){ toast(e.message||'Auth failed'); }
  });

  on(byId('regSubmit'),'click', async ()=>{
    try{
      if(!GH.token){ openConnect(); toast('Connect with PAT first'); return; }
      const handle=(byId('rgHandle').value||'').trim();
      const display=(byId('rgDisplay').value||'').trim();
      const avatar=(byId('rgAvatar').value||'').trim();
      const bio=(byId('rgBio').value||'').trim();
      const u = await registerUser(handle, display, avatar, bio);
      setUser(u);
      byId('regModal').classList.add('hidden');
      toast('Account created ✓');
      await refreshAll();
    }catch(e){ toast(e.message||'Sign up failed'); }
  });

  // Load saved GH config or ask to connect
  const ghCfg=getSS(SS.gh);
  if (!ghCfg || !ghCfg.token) {
    setTimeout(() => openConnect(), 0);
  } else {
    setGH(ghCfg);
    try { await fetchAllowedUsers(); }
    catch (e) { toast(e.message || 'Connect failed'); openConnect(); return; }
    await refreshAll();
  }

  switchTab('home');
});
