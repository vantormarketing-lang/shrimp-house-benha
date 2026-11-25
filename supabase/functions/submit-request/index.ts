import { withSupabase } from "npm:@supabase/server@1";

const ALLOWED_ORIGINS = new Set([
  "https://shrimp-house.pages.dev",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
function reply(req: Request, payload: unknown, status = 200) {
  const origin = req.headers.get("origin") || "";
  const headers = new Headers({
    ...corsHeaders, "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "Vary": "Origin",
  });
  if (ALLOWED_ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(payload), { status, headers });
}
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
function normalizePhone(v: unknown) {
  const p = String(v ?? "").replace(/[^\d+]/g, "");
  const normalized = p.replace(/^\+?20/, "0");
  return /^01[0125]\d{8}$/.test(normalized) ? normalized : "";
}
function makeCode() { return crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase(); }
async function sha256(v: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function consumeLimit(db: any, key: string, max: number) {
  const { data, error } = await db.rpc("consume_sh_request_limit", {
    p_key_hash: await sha256(key), p_limit: max, p_window_seconds: 600,
  });
  if (error) throw new Error("تعذر التحقق من معدل الطلبات.");
  return data === true;
}
function validDateTime(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return false;
  const dt = new Date(date + "T" + time + ":00+02:00");
  return Number.isFinite(dt.getTime()) && dt.getTime() > Date.now() && dt.getTime() < Date.now() + 90 * 86400000;
}
export default {
  fetch: withSupabase({ auth: "none" }, async (req: Request, ctx: any) => {
    const origin = req.headers.get("origin") || "";
    if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(req, { error: "origin_not_allowed" }, 403);
    if (req.method === "OPTIONS") return new Response("ok", {
      headers: { ...corsHeaders, "Access-Control-Allow-Origin": origin || "https://shrimp-house.pages.dev" },
    });
    if (req.method !== "POST") return reply(req, { error: "method_not_allowed" }, 405);
    let body: any;
    try { body = await req.json(); } catch { return reply(req, { error: "invalid_json" }, 400); }
    const action = clean(body?.action, 30);
    const db = ctx.supabaseAdmin;
    const ip = clean(req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0], 80);
    const phone = normalizePhone(body?.phone);
    if (!phone) return reply(req, { error: "اكتب رقم موبايل مصري صحيح." }, 400);
    try {
      if (ip && !(await consumeLimit(db, "ip:" + ip, 20))) return reply(req, { error: "محاولات كثيرة من نفس الاتصال. حاول بعد قليل." }, 429);
      if (!(await consumeLimit(db, "phone:" + phone, 7))) return reply(req, { error: "تم إرسال طلبات كثيرة بهذا الرقم. حاول بعد قليل." }, 429);
    } catch (e) {
      return reply(req, { error: e instanceof Error ? e.message : "تعذر التحقق من الطلب." }, 503);
    }
    if (action === "create_order") {
      const customerName = clean(body.customer_name, 100);
      const address = clean(body.address, 300);
      const fulfillment = clean(body.fulfillment_type, 20);
      const notes = clean(body.notes, 1000);
      if (customerName.length < 2) return reply(req, { error: "اكتب اسم العميل بشكل صحيح." }, 400);
      if (!["delivery", "pickup"].includes(fulfillment)) return reply(req, { error: "نوع الاستلام غير صحيح." }, 400);
      if (fulfillment === "delivery" && address.length < 6) return reply(req, { error: "اكتب عنوان التوصيل بالتفصيل." }, 400);
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 25) return reply(req, { error: "السلة فارغة أو تحتوي على عدد أصناف غير صالح." }, 400);
      const requested: any[] = body.items;
      const rawIds = requested.map(x => clean(x?.menu_item_id, 50));
      const rawIdsInvalid = rawIds.some(x => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x));
      const ids = [...new Set(rawIds)];
      if (ids.length < 1 || rawIdsInvalid) {
        return reply(req, { error: "تعذر التحقق من أصناف السلة. افتح المنيو وحدّث الصفحة." }, 400);
      }
      const { data: menuRows, error: menuError } = await db.from("menu_items")
        .select("id,name,price,options,is_available").in("id", ids);
      if (menuError) return reply(req, { error: "تعذر التحقق من أسعار المنيو." }, 503);
      const byId = new Map((menuRows || []).map((x: any) => [x.id, x]));
      const normalizedItems: any[] = [];
      let subtotal = 0;
      for (const line of requested) {
        const item = byId.get(line.menu_item_id) as any;
        const quantity = Number(line.quantity);
        if (!item || !item.is_available) return reply(req, { error: "أحد الأصناف لم يعد متاحًا. حدّث المنيو وحاول مرة أخرى." }, 409);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return reply(req, { error: "كمية أحد الأصناف غير صحيحة." }, 400);
        const options = Array.isArray(item.options) ? item.options : [];
        let unitPrice = Number(item.price || 0);
        let optionLabel = "";
        if (options.length) {
          optionLabel = clean(line.option_label, 60);
          const picked = options.find((o: any) => clean(o?.label, 60) === optionLabel);
          if (!picked) return reply(req, { error: "اختار الحجم أو الوزن لصنف " + item.name + "." }, 400);
          unitPrice = Number(picked.price);
        }
        if (!Number.isFinite(unitPrice) || unitPrice < 0) return reply(req, { error: "سعر أحد الأصناف غير صالح." }, 400);
        const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
        subtotal += lineTotal;
        normalizedItems.push({
          menu_item_id: item.id, name: item.name, option_label: optionLabel,
          quantity, unit_price: unitPrice, line_total: lineTotal,
        });
      }
      subtotal = Math.round(subtotal * 100) / 100;
      const { data: settings } = await db.from("restaurant_settings")
        .select("delivery_fee,minimum_order,payment_methods").eq("id", 1).maybeSingle();
      const minimum = Number(settings?.minimum_order || 0);
      if (subtotal < minimum) return reply(req, { error: "الحد الأدنى للطلب " + minimum + " جنيه." }, 400);
      const deliveryFee = fulfillment === "delivery" ? Number(settings?.delivery_fee || 0) : 0;
      const allowedPayments = String(settings?.payment_methods || "كاش عند الاستلام").split(/[,،\n]/).map(x => x.trim()).filter(Boolean);
      const paymentMethod = clean(body.payment_method, 80) || allowedPayments[0] || "كاش عند الاستلام";
      if (!allowedPayments.includes(paymentMethod)) return reply(req, { error: "طريقة الدفع المختارة غير متاحة حاليًا." }, 400);
      let discount = 0;
      const promoCode = clean(body.promo_code, 40).toUpperCase();
      if (promoCode) {
        const { data: offer } = await db.from("offers").select("discount_type,discount_value")
          .eq("promo_code", promoCode).eq("is_active", true)
          .lte("starts_at", new Date().toISOString()).gt("ends_at", new Date().toISOString()).maybeSingle();
        if (!offer) return reply(req, { error: "كود الخصم غير صالح أو انتهت صلاحيته." }, 400);
        discount = offer.discount_type === "percent"
          ? subtotal * Number(offer.discount_value) / 100 : Number(offer.discount_value);
        discount = Math.min(subtotal, Math.round(discount * 100) / 100);
      }
      const total = Math.max(0, Math.round((subtotal + deliveryFee - discount) * 100) / 100);
      const trackingCode = makeCode();
      const { data: order, error: insertError } = await db.from("orders").insert({
        customer_name: customerName, phone,
        address: fulfillment === "delivery" ? address : "استلام من المطعم",
        fulfillment_type: fulfillment, items: normalizedItems, total, delivery_fee: deliveryFee,
        discount_amount: discount, payment_method: paymentMethod, notes, status: "new", tracking_code: trackingCode,
      }).select("id,tracking_code,total,delivery_fee,discount_amount,status,created_at").single();
      if (insertError) return reply(req, { error: "تعذر تسجيل الطلب. راجع البيانات وحاول مرة أخرى." }, 400);
      return reply(req, { ok: true, kind: "order", order });
    }
    if (action === "create_booking") {
      const customerName = clean(body.customer_name, 100);
      const guests = Number(body.guests);
      const date = clean(body.booking_date, 10);
      const time = clean(body.booking_time, 5);
      const notes = clean(body.notes, 1000);
      if (customerName.length < 2) return reply(req, { error: "اكتب اسم العميل بشكل صحيح." }, 400);
      if (!Number.isInteger(guests) || guests < 1 || guests > 30) return reply(req, { error: "عدد الأفراد غير صحيح." }, 400);
      if (!validDateTime(date, time)) return reply(req, { error: "اختار موعدًا قادمًا خلال الـ90 يومًا القادمة." }, 400);
      const bookingCode = makeCode();
      const { data: booking, error } = await db.from("bookings").insert({
        customer_name: customerName, phone, guests, booking_date: date, booking_time: time,
        notes, status: "pending", booking_code: bookingCode,
      }).select("id,booking_code,status,booking_date,booking_time,guests,created_at").single();
      if (error) return reply(req, { error: "تعذر تسجيل الحجز. حاول مرة أخرى." }, 400);
      return reply(req, { ok: true, kind: "booking", booking });
    }
    if (action === "track_order") {
      const code = clean(body.tracking_code, 20).toUpperCase();
      if (!/^[A-F0-9]{12}$/.test(code)) return reply(req, { error: "رقم المتابعة غير صحيح." }, 400);
      const { data: order } = await db.from("orders")
        .select("tracking_code,phone,status,created_at,fulfillment_type,items,total,delivery_fee,discount_amount")
        .eq("tracking_code", code).eq("phone", phone).maybeSingle();
      if (order) return reply(req, { ok: true, kind: "order", order: {
        tracking_code: order.tracking_code, status: order.status, created_at: order.created_at,
        fulfillment_type: order.fulfillment_type, items: order.items, total: order.total,
        delivery_fee: order.delivery_fee, discount_amount: order.discount_amount,
      } });
      const { data: booking } = await db.from("bookings")
        .select("booking_code,phone,status,booking_date,booking_time,guests")
        .eq("booking_code", code).eq("phone", phone).maybeSingle();
      if (booking) return reply(req, { ok: true, kind: "booking", booking: {
        booking_code: booking.booking_code, status: booking.status,
        booking_date: booking.booking_date, booking_time: booking.booking_time, guests: booking.guests,
      } });
      return reply(req, { error: "لم نعثر على طلب أو حجز مطابق. راجع رقم المتابعة والموبايل." }, 404);
    }
    return reply(req, { error: "طلب غير معروف." }, 400);
  }),
};