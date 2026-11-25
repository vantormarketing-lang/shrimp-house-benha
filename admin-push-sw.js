/* Shrimp House Admin installable PWA worker: separate /admin scope, no interference with customer PWA. */
const ADMIN_CACHE="shrimp-house-admin-shell-v3";
const ADMIN_URLS=["/admin","/admin.html","/admin.webmanifest","/app-icon.svg","/app-icon-180.png"];
self.addEventListener("install",event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(ADMIN_CACHE);
  for(const url of ADMIN_URLS){try{const response=await fetch(url,{cache:"no-store"});if(response.ok)await cache.put(url,response);}catch(_){}}
  await self.skipWaiting();
 })());
});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith("shrimp-house-admin-shell-")&&k!==ADMIN_CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
 })());
});
self.addEventListener("fetch",event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=="GET"||url.origin!==self.location.origin||!url.pathname.startsWith("/admin"))return;
 if(request.mode==="navigate"){
  event.respondWith((async()=>{
   const cache=await caches.open(ADMIN_CACHE);
   try{const response=await fetch(request);if(response.ok&&response.headers.get("content-type")?.includes("text/html"))cache.put(url.pathname,response.clone()).catch(()=>{});return response;}
   catch(_){return await cache.match(request)||await cache.match(url.pathname)||await cache.match("/admin.html")||new Response("Admin offline",{status:503});}
  })());
 }
});
self.addEventListener("push",event=>{
 event.waitUntil((async()=>{
  let data={};try{if(event.data)data=event.data.json();}catch(_){try{data={body:event.data?.text()||""};}catch(_){}}
  await self.registration.showNotification(data.title||"Shrimp House",{body:data.body||"وصل تحديث جديد من المطعم.",icon:data.icon||"/app-icon.svg",badge:data.badge||"/app-icon.svg",tag:data.tag||"shrimp-house-admin",renotify:true,requireInteraction:true,dir:"rtl",lang:"ar",data:{url:data.url||"/admin"}});
 })());
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();const target=new URL(event.notification.data?.url||"/admin",self.location.origin).href;
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});for(const client of windows){if(new URL(client.url).origin===self.location.origin){try{await client.navigate(target);}catch(_){}return client.focus();}}return self.clients.openWindow(target);})());
});
