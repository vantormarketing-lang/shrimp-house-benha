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
