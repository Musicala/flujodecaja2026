const CACHE='flujo-caja-firebase-v10';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  const isLocal=url.origin===location.origin;
  const isAppFile=/\.(html|css|js)(\?.*)?$/.test(url.pathname)||url.pathname.endsWith('/');
  if(isLocal&&isAppFile){
    e.respondWith(fetch(e.request).then(r=>{const rc=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,rc)); return r;}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{try{if(isLocal)caches.open(CACHE).then(c=>c.put(e.request,r.clone()))}catch{}return r})));
});
