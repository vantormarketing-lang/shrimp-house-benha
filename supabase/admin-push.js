(() => {
 const state={registration:null,publicKey:null,ready:null,busy:false};
 const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
 const isInstalled=()=>window.matchMedia?.("(display-mode: standalone)")?.matches===true||window.navigator.standalone===true;
 function appKey(s){const pad="=".repeat((4-s.length%4)%4),raw=atob((s+pad).replace(/-/g,"+").replace(/_/g,"/")),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes.buffer;}
 async function prepare(client){
  if(!window.isSecureContext)throw new Error("إشعارات Push تحتاج اتصال HTTPS آمن.");
  if(!("Notification"in window)||!("serviceWorker"in navigator)||!("PushManager"in window))throw new Error("المتصفح الحالي لا يدعم الإشعارات الخارجية. جرّب Edge أو Chrome حديثًا.");
  if(isIOS()&&!isInstalled())throw new Error("على iPhone أو iPad لازم تضيف لوحة الإدارة إلى الشاشة الرئيسية وتفتحها من أيقونتها أولًا.");
  const {data,error}=await client.functions.invoke("admin-push",{body:{action:"setup"}});
  if(error)throw new Error(error.message||"تعذر تجهيز مفاتيح الإشعارات.");
  if(!data?.public_key)throw new Error(data?.error||"مفتاح الإشعارات غير متاح.");
  // Remove only the previous root-scoped admin worker; keep the customer PWA worker untouched.
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const oldRegistration of registrations) {
    const oldWorker = oldRegistration.active || oldRegistration.waiting || oldRegistration.installing;
    const isOldRootAdminWorker = oldRegistration.scope === new URL("/", location.origin).href &&
      oldWorker?.scriptURL === new URL("/admin-push-sw.js", location.origin).href;
    if (!isOldRootAdminWorker) continue;
    const oldSubscription = await oldRegistration.pushManager.getSubscription();
    if (oldSubscription) {
      await client.functions.invoke("admin-push", {body:{action:"unsubscribe",endpoint:oldSubscription.endpoint}});
      await oldSubscription.unsubscribe();
    }
    await oldRegistration.unregister();
  }
  const registration=await navigator.serviceWorker.register("/admin-push-sw.js",{scope:"/admin",updateViaCache:"none"});
  if(registration.installing){
    await new Promise(resolve=>{
      const worker=registration.installing;
      worker.addEventListener("statechange",()=>{if(worker.state==="activated"||worker.state==="redundant")resolve();});
    });
  }
  state.registration=registration;state.publicKey=data.public_key;
  const existing=await registration.pushManager.getSubscription();
  if(existing){const saved=await client.functions.invoke("admin-push",{body:{action:"subscribe",subscription:existing.toJSON(),user_agent:navigator.userAgent.slice(0,500)}});if(saved.error)throw new Error(saved.error.message||"تعذر مزامنة اشتراك هذا الجهاز.");}
  return existing;
 }
 async function ensure(client){if(!state.ready)state.ready=prepare(client);try{return await state.ready;}catch(e){state.ready=null;throw e;}}
 function bindButton(client,profile,button,notify){
  button.textContent="🔔 تفعيل";button.title="تفعيل الإشعارات خارج الموقع";button.setAttribute("aria-label","تفعيل إشعارات الطلبات والحجوزات");
  const initial=ensure(client).then(existing=>{if(existing){button.textContent="🔔 مفعّلة";button.title="الإشعارات مفعّلة على هذا الجهاز؛ اضغط لإرسال إشعار اختبار";}return existing;}).catch(e=>{button.title=e.message;console.warn("Admin Push setup:",e);});
  button.addEventListener("click",async()=>{
   if(state.busy)return;state.busy=true;const old=button.textContent;button.disabled=true;button.textContent="…";
   try{
    await initial;if(!state.registration||!state.publicKey)await ensure(client);
    let permission=Notification.permission;if(permission!=="granted")permission=await Notification.requestPermission();
    if(permission!=="granted")throw new Error("إذن الإشعارات غير مسموح. غيّر إعداد Notifications لهذا الموقع إلى Allow من إعدادات المتصفح.");
    let subscription=await state.registration.pushManager.getSubscription();
    if(!subscription)subscription=await state.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:appKey(state.publicKey)});
    const saved=await client.functions.invoke("admin-push",{body:{action:"subscribe",subscription:subscription.toJSON(),user_agent:navigator.userAgent.slice(0,500)}});
    if(saved.error||!saved.data?.subscribed)throw new Error(saved.data?.error||saved.error?.message||"تعذر تسجيل هذا الجهاز.");
    button.textContent="🔔 مفعّلة";button.title="الإشعارات مفعّلة على هذا الجهاز؛ اضغط لإرسال إشعار اختبار";
    notify("تم ربط هذا الجهاز بنظام إشعارات Shrimp House.");
    const test=await client.functions.invoke("admin-push",{body:{action:"test"}});
    if(test.error||!test.data?.ok){notify("تم تسجيل الجهاز، لكن إشعار الاختبار لم يصل من خدمة الإرسال. راجع الاتصال وحاول مرة أخرى.");console.warn("Admin Push test:",test.error||test.data);}
    else notify("تم إرسال إشعار اختبار إلى هذا الجهاز. راقب إشعارات الهاتف أو الكمبيوتر.");
   }catch(e){button.textContent=old||"🔔 تفعيل";notify(e instanceof Error?e.message:"تعذر تفعيل الإشعارات على هذا الجهاز.");console.error("Admin Push activation:",e);}
   finally{button.disabled=false;state.busy=false;}
  });
  return initial;
 }
 async function unsubscribe(client){
  try{const reg=await navigator.serviceWorker.getRegistration("/admin"),sub=await reg?.pushManager.getSubscription();if(!sub)return;await client.functions.invoke("admin-push",{body:{action:"unsubscribe",endpoint:sub.endpoint}});await sub.unsubscribe();}catch(e){console.warn("Admin Push unsubscribe:",e);}
 }
 window.SHRIMP_ADMIN_PUSH={bindButton,unsubscribe};
})();
