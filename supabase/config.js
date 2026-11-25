// Public frontend config for Shrimp House. Safe publishable/anon key only.
window.SHRIMP_SUPABASE_CONFIG = {
  url: "https://hcxoysslyfsktnrshoaw.supabase.co",
  anonKey: "sb_publishable_GS7BQDm2thndbsYv-P5Q4w_SgCZVlV4"
};
/* Load the shared glass hover layer on the public home and menu only. */
(() => {
 const path=window.location.pathname.replace(/\/+$/, "")||"/";
 if(!["/","/index.html","/menu","/menu.html"].includes(path))return;
 if(document.querySelector('link[data-shrimp-glass="true"]'))return;
 const link=document.createElement("link");link.rel="stylesheet";link.href="/interaction-glass.css?v=1";link.dataset.shrimpGlass="true";document.head.appendChild(link);
})();

/* Admin-only search controls for loaded operational lists. */
(() => {
 const path=window.location.pathname.replace(/\/+$/,"")||"/";
 if(!["/admin","/admin.html"].includes(path))return;
 const init=()=>{
  if(window.__SHRIMP_ADMIN_SEARCH_READY)return;
  window.__SHRIMP_ADMIN_SEARCH_READY=true;
  const $=id=>document.getElementById(id);
  function addSearch(id,view,afterId,placeholder,listId,selector,countId,unit){
   const toolbar=document.querySelector("#"+view+" .toolbar"),list=$(listId);
   if(!toolbar||!list)return;
   let input=$(id);
   if(!input){
    input=document.createElement("input");input.id=id;input.type="search";input.className="sh-admin-search";
    input.placeholder=placeholder;input.setAttribute("aria-label",placeholder);
    const anchor=$(afterId);
    if(anchor&&anchor.parentElement===toolbar)anchor.insertAdjacentElement("afterend",input);else toolbar.append(input);
   }
   const count=$(countId);
   const apply=()=>{
    const term=input.value.trim().toLocaleLowerCase("ar");
    const cards=Array.from(list.querySelectorAll(selector));let shown=0;
    cards.forEach(card=>{const match=!term||card.textContent.toLocaleLowerCase("ar").includes(term);card.hidden=!match;if(match)shown++;});
    if(count)count.textContent=term?shown+" / "+cards.length+" "+unit:cards.length+" "+unit;
   };
   input.addEventListener("input",apply);
   new MutationObserver(apply).observe(list,{childList:true});
   apply();
  }
  addSearch("orderSearch","orders","exportOrders","بحث بالاسم أو الموبايل أو رقم المتابعة","ordersList",".order-card","ordersCount","طلب");
  addSearch("bookingSearch","bookings","exportBookings","بحث بالاسم أو الموبايل أو رقم الحجز","bookingList",".booking-card","bookingCount","حجز");
  addSearch("menuSearch","menu","refreshMenu","بحث عن صنف أو قسم","menuItems",".dish-card","menuCount","صنف");
  addSearch("inventorySearch","stock","refreshStock","بحث عن خامة أو وحدة قياس","stockItems",".stock-card","stockCount","خامة");
  const style=document.createElement("style");
  style.textContent=".sh-admin-search{min-width:min(250px,100%);max-width:320px;min-height:40px;padding:9px 13px;border-radius:12px;border:1px solid rgba(180,195,210,.28);color:var(--cream,#D7DCE4);background:rgba(215,220,228,.06);font:inherit;font-size:13px;outline:none;backdrop-filter:blur(14px)}.sh-admin-search:focus{border-color:rgba(103,185,232,.8);background:rgba(103,185,232,.12);box-shadow:0 0 0 3px rgba(103,185,232,.12)}.toolbar .sh-admin-search{flex:1 1 220px}@media(max-width:700px){.toolbar .sh-admin-search{min-width:100%;max-width:none;order:5}}";
  document.head.appendChild(style);
  document.addEventListener("keydown",event=>{
   const t=event.target,typing=t&&(t.isContentEditable||["INPUT","TEXTAREA","SELECT"].includes(t.tagName));
   if(event.key==="/"&&!typing){
    const active=document.querySelector(".view.active");
    const id=active?.id==="bookings"?"bookingSearch":active?.id==="menu"?"menuSearch":active?.id==="stock"?"inventorySearch":"orderSearch";
    const input=$(id);if(input){event.preventDefault();input.focus();}
   }
   if(event.key==="Escape"&&t?.classList?.contains("sh-admin-search")){t.value="";t.dispatchEvent(new Event("input",{bubbles:true}));t.blur();}
  });
 };
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
