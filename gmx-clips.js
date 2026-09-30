/* groovesmaxxing, keep my clips (phase 5, DECISION 12). vanilla, no dependencies.
   the switch lives in localStorage, the clips in IndexedDB, both on this phone only.
   nothing here plays audio or sends anything: the scan page sends a clip only when the
   user taps help us find it. off by default. turning it off deletes every kept clip.
   newest KEEP_MAX are kept, and nothing older than KEEP_DAYS. */
(function(){
'use strict';
var KEY='gmx_keep_clips', DB='gmx', STORE='clips', KEEP_MAX=20, KEEP_DAYS=30;
function open(){
  return new Promise(function(res,rej){
    if(!window.indexedDB)return rej(new Error('no indexeddb'));
    var q=indexedDB.open(DB,1);
    q.onupgradeneeded=function(){var d=q.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'})};
    q.onsuccess=function(){res(q.result)}; q.onerror=function(){rej(q.error)};
  });
}
function tx(mode,fn){
  return open().then(function(d){
    return new Promise(function(res,rej){
      var t=d.transaction(STORE,mode), s=t.objectStore(STORE), out=fn(s);
      t.oncomplete=function(){d.close();res(out&&typeof out==='object'&&('result' in out)?out.result:undefined)};
      t.onerror=function(){d.close();rej(t.error)};
    });
  });
}
function on(){try{return localStorage.getItem(KEY)==='1'}catch(e){return false}}
function setOn(v){
  try{localStorage.setItem(KEY,v?'1':'0')}catch(e){}
  return v?Promise.resolve():clear();
}
function put(rec){
  /* rec: {id, t, blob, recognition_id, kind}. the newest first, then the cap and the age. */
  return tx('readwrite',function(s){s.put(rec)}).then(prune);
}
function get(id){return tx('readonly',function(s){return s.get(id)})}
function del(id){return tx('readwrite',function(s){s.delete(id)})}
function clear(){return tx('readwrite',function(s){s.clear()}).catch(function(){})}
function list(){
  return tx('readonly',function(s){return s.getAll()}).then(function(rows){
    rows=rows||[]; rows.sort(function(a,b){return b.t-a.t}); return rows;
  });
}
function prune(){
  var floor=Date.now()-KEEP_DAYS*86400000;
  return list().then(function(rows){
    var drop=rows.filter(function(r,i){return i>=KEEP_MAX||r.t<floor});
    if(!drop.length)return;
    return tx('readwrite',function(s){drop.forEach(function(r){s.delete(r.id)})});
  }).catch(function(){});
}
window.gmxClips={on:on,setOn:setOn,put:put,get:get,del:del,clear:clear,list:list,prune:prune,KEEP_MAX:KEEP_MAX,KEEP_DAYS:KEEP_DAYS};
})();
