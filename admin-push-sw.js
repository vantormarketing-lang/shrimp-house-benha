/* Shrimp House Admin Web Push service worker */
self.addEventListener("push",event=>{
 event.waitUntil((async()=>{
  let data={};try{if(event.data)data=event.data.json();}catch(_){try{data={body:event.data?.text()||""};}catch(_){}}
  await self.registration.showNotification(data.title||"Shrimp House",{
   body:data.body||"وصل تحديث جديد من المطعم.",
   icon:data.icon||"/admin-push-icon.svg",
   badge:data.badge||"/admin-push-icon.svg",
   tag:data.tag||"shrimp-house-admin",
   renotify:true,requireInteraction:true,dir:"rtl",lang:"ar",
   data:{url:data.url||"/admin"}
  });
 })());
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const target=new URL(event.notification.data?.url||"/admin",self.location.origin).href;
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
  for(const client of windows){if(new URL(client.url).origin===self.location.origin){try{await client.navigate(target);}catch(_){}return client.focus();}}
  return self.clients.openWindow(target);
 })());
});
