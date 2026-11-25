import { withSupabase } from "npm:@supabase/server@1";

const ALLOWED_ORIGINS = new Set([
  "https://shrimp-house.pages.dev",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);
const commonHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
function json(req: Request, value: unknown, status = 200) {
  const origin = req.headers.get("origin") || "";
  const headers = new Headers({ ...commonHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Vary": "Origin" });
  if (ALLOWED_ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(value), { status, headers });
}
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export default {
  fetch: withSupabase({ auth: ["user", "none"] }, async (req: Request, ctx: any) => {
    const origin = req.headers.get("origin") || "";
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json(req, { error: "origin_not_allowed" }, 403);
    if (req.method === "OPTIONS") return new Response("ok", {
      headers: { ...commonHeaders, "Access-Control-Allow-Origin": origin || "https://shrimp-house.pages.dev" },
    });
    if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
    if (ctx.authMode !== "user" || !ctx.userClaims?.id) return json(req, { error: "يلزم تسجيل الدخول بحساب مدير." }, 401);

    let body: any;
    try { body = await req.json(); } catch { return json(req, { error: "invalid_json" }, 400); }
    const { data: actor, error: actorError } = await ctx.supabase
      .from("staff_profiles")
      .select("role")
      .eq("user_id", ctx.userClaims.id)
      .maybeSingle();
    if (actorError || actor?.role !== "admin") return json(req, { error: "هذه العملية متاحة لمسؤول المطعم فقط." }, 403);

    const email = clean(body.email, 254).toLowerCase();
    const displayName = clean(body.display_name, 100);
    const role = clean(body.role, 20);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(req, { error: "اكتب بريدًا إلكترونيًا صحيحًا." }, 400);
    if (displayName.length < 2) return json(req, { error: "اكتب اسم الموظف." }, 400);
    if (!["staff", "admin"].includes(role)) return json(req, { error: "الصلاحية المختارة غير صحيحة." }, 400);

    const { data: invitation, error: inviteError } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: "https://shrimp-house.pages.dev/admin-login.html",
      data: { display_name: displayName, restaurant: "Shrimp House" },
    });
    if (inviteError || !invitation?.user?.id) return json(req, { error: inviteError?.message || "تعذر إرسال دعوة الموظف." }, 400);

    const { error: profileError } = await ctx.supabaseAdmin.from("staff_profiles").upsert({
      user_id: invitation.user.id, display_name: displayName, role,
    }, { onConflict: "user_id" });
    if (profileError) {
      await ctx.supabaseAdmin.auth.admin.deleteUser(invitation.user.id);
      return json(req, { error: "تم إنشاء الدعوة لكن تعذر حفظ الصلاحية؛ أُلغيت الدعوة تلقائيًا. " + profileError.message }, 500);
    }
    return json(req, { ok: true, email, display_name: displayName, role }, 201);
  }),
};