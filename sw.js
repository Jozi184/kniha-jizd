const CACHE='kniha-jizd-account-v3';
const ASSETS=['./','index.html','account.js','route-map.js','ride-places.js','odometer-photo.js','manifest.webmanifest','icon-graphite-192.png','icon-graphite-512.png','icon-graphite-180.png','favicon-graphite.png','mapy-logo.svg','vendor/supabase-2.102.0.js','vendor/leaflet.js','vendor/leaflet.css'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;
 }).catch(()=>caches.match(event.request)));
});
