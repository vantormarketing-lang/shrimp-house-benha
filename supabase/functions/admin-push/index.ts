import { withSupabase } from "npm:@supabase/server@1";
import webpush from "npm:web-push@3.6.7";
const ALLOWED_ORIGINS = new Set(["https://shrimp-house.pages.dev","http://localhost:5500","http://127.0.0.1:5500"]);
const HEADERS = {"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Max-Age":"86400"};
function json(req:Request,payload:unknown,status=200){const origin=req.headers.get("origin")||"";const headers=new Headers({...HEADERS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"});if(ALLOWED_ORIGINS.has(origin))headers.set("Access-Control-Allow-Origin",origin);return new Response(JSON.stringify(payload),{status,headers});}
const clean=(v:unknown,max:number)=>String(v??"").trim().slice(0,max);
async function getOrCreateKeys(db:any){
 const {data:current,error}=await db.from("admin_push_config").select("vapid_public_key,vapid_private_key").eq("id",1).maybeSingle();
 if(error)throw new Error("تعذر قراءة إعدادات الإشعارات.");
 if(current?.vapid_public_key&&current?.vapid_private_key)return current;
 const keys=webpush.generateVAPIDKeys();
 const {error:insertError}=await db.from("admin_push_config").insert({id:1,vapid_public_key:keys.publicKey,vapid_private_key:keys.privateKey,updated_at:new Date().toISOString()});
 if(insertError){const {data:winner,error:rereadError}=await db.from("admin_push_config").select("vapid_public_key,vapid_private_key").eq("id",1).maybeSingle();if(!rereadError&&winner?.vapid_public_key&&winner?.vapid_private_key)return winner;throw new Error("تعذر إنشاء مفاتيح الإشعارات.");}
 return {vapid_public_key:keys.publicKey,vapid_private_key:keys.privateKey};
}
async function sendToSubscriptions(db:any,keys:any,rows:any[],payload:any){
 webpush.setVapidDetails("mailto:admin@shrimp-house.pages.dev",keys.vapid_public_key,keys.vapid_private_key);
 const outcomes=await Promise.all(rows.map(async(row:any)=>{
  try{await webpush.sendNotification({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},JSON.stringify(payload),{TTL:120,urgency:"high"});return true;}
  catch(error:any){const status=Number(error?.statusCode||error?.status||0);if(status===404||status===410){await db.from("admin_push_subscriptions").delete().eq("endpoint",row.endpoint);}else{console.error("Push delivery failed:",status,String(error?.message||error));}return false;}
 }));
 return {sent:outcomes.filter(Boolean).length,total:rows.length};
}
export default {fetch:withSupabase({auth:["user"]},async(req:Request,ctx:any)=>{
 const origin=req.headers.get("origin")||"";
 if(origin&&!ALLOWED_ORIGINS.has(origin))return json(req,{error:"origin_not_allowed"},403);
 if(req.method==="OPTIONS")return new Response("ok",{headers:{...HEADERS,"Access-Control-Allow-Origin":origin||"https://shrimp-house.pages.dev"}});
 if(req.method!=="POST")return json(req,{error:"method_not_allowed"},405);
 if(ctx.authMode!=="user"||!ctx.userClaims?.id)return json(req,{error:"يلزم تسجيل الدخول بحساب من فريق المطعم."},401);
 const {data:actor,error:actorError}=await ctx.supabase.from("staff_profiles").select("role").eq("user_id",ctx.userClaims.id).maybeSingle();
 if(actorError||!actor||!["admin","staff"].includes(actor.role))return json(req,{error:"هذه الخدمة متاحة لفريق المطعم فقط."},403);
 let body:any;try{body=await req.json();}catch{return json(req,{error:"invalid_json"},400);}
 const db=ctx.supabaseAdmin,action=clean(body?.action,30);
 try{
  if(action==="setup"){const keys=await getOrCreateKeys(db);return json(req,{ok:true,public_key:keys.vapid_public_key});}
  if(action==="subscribe"){
   const sub=body?.subscription,endpoint=clean(sub?.endpoint,2048),p256dh=clean(sub?.keys?.p256dh,200),auth=clean(sub?.keys?.auth,200);
   let endpointUrl:URL;try{endpointUrl=new URL(endpoint);}catch{return json(req,{error:"عنوان الاشتراك غير صالح."},400);}
   if(endpointUrl.protocol!=="https:"||!p256dh||!auth)return json(req,{error:"بيانات اشتراك الإشعارات غير مكتملة."},400);
   const {error}=await db.from("admin_push_subscriptions").upsert({user_id:ctx.userClaims.id,endpoint,p256dh,auth,user_agent:clean(body?.user_agent,500),updated_at:new Date().toISOString()},{onConflict:"endpoint"});
   if(error){console.error("Saving push subscription failed:",error.message);return json(req,{error:"تعذر حفظ هذا الجهاز ضمن أجهزة الإشعارات."},500);}
   return json(req,{ok:true,subscribed:true});
  }
  if(action==="unsubscribe"){
   const endpoint=clean(body?.endpoint,2048);if(!endpoint)return json(req,{error:"بيانات الجهاز غير مكتملة."},400);
   const {error}=await db.from("admin_push_subscriptions").delete().eq("endpoint",endpoint).eq("user_id",ctx.userClaims.id);
   if(error)return json(req,{error:"تعذر إلغاء اشتراك هذا الجهاز."},500);
   return json(req,{ok:true,unsubscribed:true});
  }
  if(action==="test"){
   const keys=await getOrCreateKeys(db);
   const {data:rows,error}=await db.from("admin_push_subscriptions").select("endpoint,p256dh,auth").eq("user_id",ctx.userClaims.id);
   if(error)throw new Error("تعذر قراءة أجهزة الإشعارات.");
   if(!rows?.length)return json(req,{error:"لم يتم ربط هذا الجهاز بالإشعارات بعد."},404);
   const result=await sendToSubscriptions(db,keys,rows,{title:"Shrimp House · إشعار تجريبي",body:"الإشعارات الخارجية تعمل على هذا الجهاز.",url:"/admin",tag:"shrimp-house-push-test"});
   return json(req,{ok:result.sent>0,...result});
  }
  return json(req,{error:"إجراء غير معروف."},400);
 }catch(error){console.error("Admin push error:",error);return json(req,{error:error instanceof Error?error.message:"تعذر إكمال إعداد الإشعارات."},500);}
})};
