/* groovesmaxxing account (shell v2, 2026-10-12). vanilla, no dependencies. the sign-in calls that lived in
   scan.html, shared so every page can use them: the recognizer address and app key from /gmx-config.json,
   the device id (minted once, kept on the phone), the session token (this phone only, rides every call as
   X-GMX-Session), the email link and six-digit code flow, /me and the handle, push. nothing works worse
   signed out. paints the "sign in" or "@handle" chip into the header of every page: into .top where a page
   has one, beside a bare back link, over the hero on the home page. scan.html and more.html call the api;
   gmx-nav.js loads this file everywhere else.
   api: gmxAccount.token() set(t) device() config() headers(extra) call(path,opts,ms) start(email)
        code(email,code) finish(token) poll(ticket) waitForLink(ticket,minutes,cb) resumeWait(cb) signout()
        me(force) snapshot() setHandle(h) ensurePush() pushState() on(fn) paint() */
(function(){
'use strict';
if(window.gmxAccount)return;
var SESSION='gmx_session',ME='gmx_me',ME_AT='gmx_me_at',CFG='gmx_cfg',DEVICE='gmx_device',PENDING='gmx_pending';
var GET_MS=8000,POST_MS=25000,ME_FRESH=10*60000;
var cfg=null,cfgP=null,me=null,meP=null,subs=[],chip=null,pollTimer=null;
var path=location.pathname.replace(/\.html$/,'');
/* the logo mark from favicon.svg, for the header on a wide screen (the same drawing gmx-nav.js puts on the scan disc) */
var WAVE='6,120 30,120 48,84 68,150 88,96 108,138 120,114 132,138 152,96 172,150 192,84 210,120 234,120';
var MARK='<svg viewBox="0 0 240 240" aria-hidden="true"><g fill="none" stroke="#F2F2EF" stroke-linecap="round" stroke-linejoin="round" stroke-width="11"><circle cx="120" cy="120" r="104"/><circle cx="120" cy="120" r="76"/><circle cx="120" cy="120" r="48"/></g><circle cx="120" cy="120" r="20" fill="#0B0B0D"/><polyline points="'+WAVE+'" fill="none" stroke="#0B0B0D" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><polyline points="'+WAVE+'" fill="none" stroke="#F2F2EF" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fire(what){subs.forEach(function(f){try{f(what)}catch(e){}})}
function fx(url,opts,ms){
  opts=opts||{};
  if(!('AbortController' in window))return fetch(url,opts);
  var ac=new AbortController(),t=setTimeout(function(){ac.abort()},ms||GET_MS);
  opts.signal=ac.signal;
  return fetch(url,opts).then(function(r){clearTimeout(t);return r},function(e){clearTimeout(t);throw (e&&e.name==='AbortError')?new Error('timeout'):e});
}
/* config: the api base and the app key, never from this file. the last good copy stays on the phone so a flaky load still works. */
function config(){
  if(cfg)return Promise.resolve(cfg);
  if(cfgP)return cfgP;
  cfgP=fx('/gmx-config.json',{cache:'no-store'},GET_MS).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()}).then(function(j){
    if(!j||!j.api_base||!j.app_key)throw new Error('incomplete');
    cfg=j;lsSet(CFG,JSON.stringify(j));return j;
  }).catch(function(e){
    var c=null;try{c=JSON.parse(lsGet(CFG)||'null')}catch(x){}
    if(c&&c.api_base&&c.app_key){cfg=c;return c}
    cfgP=null;throw e;
  });
  return cfgP;
}
function device(){
  var v=lsGet(DEVICE);
  if(v&&/^[A-Za-z0-9_-]{8,64}$/.test(v))return v;
  var b=new Uint8Array(16);(window.crypto||window.msCrypto).getRandomValues(b);
  v=Array.prototype.map.call(b,function(x){return ('0'+x.toString(16)).slice(-2)}).join('');
  lsSet(DEVICE,v);return v;
}
function token(){return lsGet(SESSION)||''}
function headers(extra){
  var h={'X-GMX-App-Key':cfg?cfg.app_key:'','X-GMX-Device':device()};
  var ss=token();if(ss)h['X-GMX-Session']=ss;
  if(extra)for(var k in extra)h[k]=extra[k];
  return h;
}
/* one call to the recognizer: the headers, a json body when given, a deadline. resolves to the response. */
function call(p,opts,ms){
  opts=opts||{};
  return config().then(function(c){
    var init={method:opts.method||'GET',headers:headers(opts.headers)};
    if(opts.body!=null){init.headers['Content-Type']='application/json';init.body=typeof opts.body==='string'?opts.body:JSON.stringify(opts.body)}
    return fx(c.api_base+p,init,ms||(init.method==='GET'?GET_MS:POST_MS));
  });
}
function remember(j){me=j||null;lsSet(ME,j?JSON.stringify(j):null);lsSet(ME_AT,j?String(Date.now()):null);paint();fire('me')}
function snapshot(){if(me)return me;try{var j=JSON.parse(lsGet(ME)||'null');if(j&&typeof j==='object')me=j}catch(e){}return me}
function set(t){
  var had=token();
  lsSet(SESSION,t||null);
  if(pollTimer){clearInterval(pollTimer);pollTimer=null}
  if(t)lsSet(PENDING,null);else remember(null);
  paint();fire('session');
  if(t&&t!==had)getMe(true).catch(function(){});
}
/* who this is. resolves to the profile, or null when signed out (a 401 clears the session). rejects when the recognizer did not answer. */
function getMe(force){
  if(!token())return Promise.resolve(null);
  var at=Number(lsGet(ME_AT)||0);
  if(!force&&snapshot()&&Date.now()-at<ME_FRESH)return Promise.resolve(me);
  if(meP)return meP;
  meP=call('/me',{},GET_MS).then(function(r){
    if(r.status===401){set('');return null}
    if(!r.ok)throw new Error(r.status);
    return r.json().then(function(j){remember(j);return j});
  });
  meP.then(function(){meP=null},function(){meP=null});
  return meP;
}
function start(email){return call('/auth/start',{method:'POST',body:{email:email}},POST_MS)}
function code(email,c){return call('/auth/code',{method:'POST',body:{email:email,code:c}},POST_MS)}
function finish(t){return call('/auth/finish',{method:'POST',body:{token:t}},POST_MS)}
function poll(ticket){return call('/auth/poll',{method:'POST',body:{pending:ticket}},POST_MS)}
function signout(){
  var h={};if(token())h['X-GMX-Session']=token();
  var p=token()?call('/auth/signout',{method:'POST',headers:h},POST_MS).catch(function(){}):Promise.resolve();
  set('');return p;
}
function setHandle(h){
  return call('/me',{method:'POST',body:{handle:h||null}},POST_MS).then(function(r){
    if(r.ok)r.clone().json().then(remember).catch(function(){});
    return r;
  });
}
/* the page that asked for the link keeps a ticket and asks every few seconds whether the link was tapped, in
   any browser. the first ready answer carries this browser's own session, so the person is signed in where
   they started. the ticket is remembered across a reload for the link's window. cb runs once, signed in. */
function waitForLink(ticket,minutes,cb){
  lsSet(PENDING,JSON.stringify({t:ticket,until:Date.now()+minutes*60000}));
  if(pollTimer)clearInterval(pollTimer);
  var ask=function(){
    if(token()){clearInterval(pollTimer);pollTimer=null;return}
    poll(ticket).then(function(r){return r.ok?r.json():null}).then(function(j){
      if(!j)return;
      if(j.state==='ready'){clearInterval(pollTimer);pollTimer=null;lsSet(PENDING,null);set(j.session);if(cb)cb()}
      else if(j.state==='gone'){clearInterval(pollTimer);pollTimer=null;lsSet(PENDING,null)}
    }).catch(function(){});
  };
  pollTimer=setInterval(ask,4000);ask();
}
function resumeWait(cb){
  if(token())return;
  var p=null;try{p=JSON.parse(lsGet(PENDING)||'null')}catch(e){}
  if(p&&p.t&&p.until>Date.now())waitForLink(p.t,Math.ceil((p.until-Date.now())/60000),cb);
  else lsSet(PENDING,null);
}
/* a push subscription for this phone: the browser's permission prompt, the recognizer's public key, the
   subscription posted back. resolves true when the phone can be pushed, false when it cannot. never throws. */
function urlB64ToU8(b){var pad='='.repeat((4-b.length%4)%4),raw=atob((b+pad).replace(/-/g,'+').replace(/_/g,'/')),out=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function ensurePush(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return Promise.resolve(false);
  return call('/push/key',{},GET_MS).then(function(r){return r.ok?r.json():null}).then(function(k){
    if(!k||!k.enabled||!k.public_key)return false;
    return Notification.requestPermission().then(function(perm){
      if(perm!=='granted')return false;
      return navigator.serviceWorker.ready.then(function(reg){
        return reg.pushManager.getSubscription().then(function(sub){return sub||reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64ToU8(k.public_key)})});
      }).then(function(sub){
        return call('/push/subscribe',{method:'POST',body:{subscription:sub.toJSON()}},POST_MS).then(function(r){return r.ok});
      });
    });
  }).catch(function(){return false});
}
/* where this phone stands on push: none, blocked, off, allowed (permission but no subscription), on */
function pushState(){
  if(!('Notification' in window)||!('PushManager' in window)||!('serviceWorker' in navigator))return Promise.resolve('none');
  if(Notification.permission==='denied')return Promise.resolve('blocked');
  if(Notification.permission!=='granted')return Promise.resolve('off');
  return navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription()}).then(function(sub){return sub?'on':'allowed'}).catch(function(){return 'allowed'});
}
/* ---- the header chip ---- */
var CSS='.wrap > .top,.gmx-top{display:flex;align-items:center;justify-content:space-between;gap:12px}'+
 '.hero > .gmx-hdr.float{position:absolute;top:calc(16px + env(safe-area-inset-top));right:16px;z-index:2}'+
 '.gmx-acct{flex:none;font-family:"Space Mono",monospace;font-size:.7rem;letter-spacing:.08em;color:#8A8A93;text-decoration:none;border:1px solid rgba(242,242,239,.18);border-radius:999px;padding:0 12px;min-height:34px;line-height:32px;max-width:46vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;-webkit-tap-highlight-color:transparent}'+
 '.gmx-acct.in{color:#F2F2EF;border-color:rgba(255,28,2,.5)}'+
 '.gmx-acct:hover,.gmx-acct:focus-visible{color:#FF1C02;border-color:#FF1C02;outline:none}'+
 '';
function paint(){
  if(!chip)return;
  var t=token(),m=snapshot();
  chip.className='gmx-acct'+(t?' in':'');
  chip.textContent=t?(m&&m.handle?'@'+m.handle:'you'):'sign in';
  chip.href=path==='/scan'?'#you':'/more#account';
  chip.setAttribute('aria-label',t?'your account'+(m&&m.handle?', @'+m.handle:''):'sign in');
}
/* the header row: on a wide screen the logo (to /scan) and the search button sit beside the chip, since there is
   no tab bar and no floating button there. gmx-nav.css hides both under 1025px. */
function headerRow(){
  var row=document.createElement('span');row.className='gmx-hdr';
  if(path!=='/scan'){var m=document.createElement('a');m.className='gmx-hmark';m.href='/scan';m.setAttribute('aria-label','scan what is playing');m.innerHTML=MARK;row.appendChild(m)}
  if(path!=='/search'){var b=document.createElement('button');b.type='button';b.className='gmx-hsearch';b.setAttribute('aria-label','search the site');b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20"/></svg>';b.addEventListener('click',function(){if(window.gmxQuick)gmxQuick.open(b);else location.href='/search'});row.appendChild(b)}
  chip=document.createElement('a');row.appendChild(chip);
  return row;
}
function mountChip(){
  if(chip||document.querySelector('meta[http-equiv="refresh"]')||document.querySelector('.gmx-acct'))return;
  var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  var row=headerRow();
  var top=document.querySelector('.wrap > .top');
  if(top)top.appendChild(row);
  else{
    var back=document.querySelector('.wrap > a.back');
    if(back){var d=document.createElement('div');d.className='gmx-top';back.parentNode.insertBefore(d,back);d.appendChild(back);d.appendChild(row)}
    else{
      var hero=document.querySelector('header.hero');
      if(hero){row.className+=' float';hero.appendChild(row)}
      else{var w=document.querySelector('.wrap')||document.body,d2=document.createElement('div');d2.className='gmx-top';d2.appendChild(row);w.insertBefore(d2,w.firstChild)}
    }
  }
  paint();
  if(token())getMe(false).catch(function(){});
}
if(document.body)mountChip();else document.addEventListener('DOMContentLoaded',mountChip);
/* a sign-in in another tab shows up here too */
window.addEventListener('storage',function(e){if(e.key===SESSION||e.key===ME){me=null;paint();fire('session')}});
window.gmxAccount={
  token:token,set:set,device:device,config:config,headers:headers,call:call,
  start:start,code:code,finish:finish,poll:poll,waitForLink:waitForLink,resumeWait:resumeWait,signout:signout,
  me:getMe,snapshot:snapshot,setHandle:setHandle,ensurePush:ensurePush,pushState:pushState,
  on:function(f){subs.push(f)},paint:paint
};
})();
