# Shrimp House — production setup and operations

## Project
- Supabase project ref: `hcxoysslyfsktnrshoaw`
- Public project URL: `https://hcxoysslyfsktnrshoaw.supabase.co`
- Public browser config: `supabase/config.js` contains only the publishable key. Never put a Supabase secret/service-role key in GitHub or browser files.

## Customer flow
1. The menu is read from `public.menu_items`; current seed contains 46 active dishes across 8 categories. Prices and size/weight options are read from the same table the admin edits.
2. The cart sends item IDs, selected options and quantities to the home checkout.
3. `submit-request` validates identity fields, availability, size options and current prices on the server, applies the configured delivery fee, minimum order and optional discount code, then inserts a tracked order.
4. `track-order.html` looks up an order or booking only when both tracking code and the customer phone match.
5. Table bookings use the same server-side Edge Function and get a booking code.

Public users may read available menu items and currently active offers, but no longer have direct INSERT access to `orders` or `bookings`. Public order/booking creation goes through the Edge Function, which rate-limits phone/IP requests and computes totals from database prices.

## Admin access and features
- Admin login uses Supabase Auth and `staff_profiles.role`.
- The current staff profile has role `admin`.
- Existing views: Dashboard, Orders, Menu, Bookings, Inventory, Settings.
- Added views: Kitchen queue, sales reports, customer summaries, active offers/coupons, recipe-to-inventory mappings, staff invitation/role management, audit/activity log.
- Admin Web Push sends native operating-system notifications for new orders and bookings even when the admin page is closed. The admin device subscribes through `admin-push`, and the public `submit-request` function sends the event in an Edge Function background task.
- The first authenticated admin visit initializes one VAPID key pair in `admin_push_config`; subscriptions are stored per device in `admin_push_subscriptions`. Both tables have RLS enabled, no browser grants, explicit deny policies for `anon` and `authenticated`, and service-role-only access.
- The customer website is an installable PWA using `/app.webmanifest`, `/sw.js`, `/app-icon.svg`, and the Home Screen PNG icon. The home page, menu and order-tracking page share the same app identity and standalone start page.
- The customer PWA uses the root `/` service-worker scope; the admin app uses a separate `/admin` manifest and `/admin-push-sw.js` service-worker scope. Cloudflare Pages `_headers` grants the admin worker only the necessary `Service-Worker-Allowed: /admin` scope. The admin worker is deliberately isolated from customer-page caching.
- The admin page registers `/admin-push-sw.js` and uses `/admin.webmanifest` for its installable standalone app. The notification button connects the current browser/device, asks for permission, and sends a test notification. Each device/browser must be enabled separately.
- On iPhone/iPad, Web Push requires iOS/iPadOS 16.4 or later and the admin web app added to the Home Screen; open it from its Home Screen icon before enabling notifications. On desktop and Android, use a current HTTPS browser that supports Web Push.
- Signing out of the admin account removes that device's push subscription.
- Staff invitations run through `admin-staff-invite`, require an authenticated admin, send an Auth invitation email and create the staff profile. Supabase Auth email delivery/SMTP and the redirect URL must be configured.
- Inventory movements are recorded with an authenticated RPC. Order recipes are deducted when an order is moved into `preparing`; deductions happen only for recipes actually configured.

## New database objects and functions
- `admin_push_config`, `admin_push_subscriptions` (server-only VAPID key and device subscription storage)\n- `menu_items.options`, `category_key`, `category_icon`
- `orders.tracking_code`, `fulfillment_type`, `delivery_fee`, `discount_amount`, `payment_method`, `stock_deducted_at`
- `bookings.booking_code`
- `restaurant_settings.maps_url`, social URLs, delivery fee, minimum, delivery areas and payment methods
- `menu_item_recipes`, `inventory_movements`, `order_status_history`, `staff_activity_logs`, `offers`, `request_rate_limits`
- Edge Functions: `submit-request` v6 (public, server-validated, dispatches order/booking Web Push), `admin-push` v1 (authenticated staff subscription setup/test), and `admin-staff-invite` (admin-only)
- Migrations: `20261125150819_restaurant_operations_foundation`, `20261125151636_secure_public_requests_and_inventory_movements`.

## Owner configuration still required
1. Enter the real restaurant phone, WhatsApp, full address, Google Maps URL, opening hours and social links in Admin → Settings.
2. Enter actual delivery fees, minimum order, delivery areas and accepted payment method labels (comma-separated). The checkout uses those settings; the server validates the selected payment-method label.
3. Add the real ingredients/stock amounts in Inventory, then create recipe quantities for each menu item in Recipes. Do not invent ingredient quantities; automatic stock deduction will apply only after real recipes are entered.
4. Confirm Auth email/SMTP delivery and the allowed redirect URL for staff invitations.
5. Open Admin on each intended device, click **🔔 تفعيل**, allow notifications, and wait for the test notification. Repeat on every separate browser/device. On iPhone/iPad, install the admin web app to the Home Screen first.

## Security notes
- RLS remains enabled. The public role can read available menu items and active offers; it cannot insert orders or bookings directly.
- Request rate-limit records are not readable/writable by browser roles.
- No service-role or secret key is stored in this repository. VAPID private key material is stored only in the service-role-only `admin_push_config` table and is never returned to browser clients.
- Review Supabase Auth's leaked-password protection and remaining security advisor findings before advertising the system as fully production-hardened.

## Final operations pass — 2026-11-25

- The public menu category selector now uses the same infinite 3D rotating carousel engine as the dish cards.
- Menu size/weight options are selected directly through their visible price pills (for example, kilo or half-kilo). The redundant white native dropdown has been removed from all dish cards and fallback rows. The cart receives the selected option label and its database price; items without options keep a normal single-price display. Category tiles show the section name without adjacent emoji icons and include two small illuminated accent dots beside the title. Drag, touch, keyboard arrows and carousel dots use the same ring engine.
- The customer tracking page renders chronological status events for both orders and table bookings, using `order_status_history` and `booking_status_history`.
- The `submit-request` Edge Function returns the status timeline only after matching both the tracking code and the customer's registered phone number.
- The public menu is database-driven and subscribes to realtime changes in menu items and offers.
- Admin quick-search controls are injected by `supabase/config.js` only on `/admin` and `/admin.html`. They filter the currently loaded Orders, Bookings, Menu and Inventory cards. The view queries currently load a bounded recent set (orders 100, bookings 150); search does not yet fetch older pages from the server.
- CSV export is available for orders and bookings.
- Staff authorization helpers are stored in the non-exposed `private` schema. Public helper functions were removed from the Data API. The inventory movement RPC runs as SECURITY INVOKER and is guarded by the private staff check plus table RLS.
- Explicit Data API grants were added for operational tables, while RLS still controls row access. Browser roles cannot access `request_rate_limits` or insert orders/bookings directly.
- Query indexes were added for order/booking timelines, inventory movements, recipes, activity logs and visits. Performance advisors may report them as unused until real operational records accumulate.
- Canonical migration filenames now match the applied database versions: `20261125153225_enable_realtime_for_operations`, `20261125154116_complete_recipe_coverage_before_stock_deduction`, `20261125154543_booking_status_history_timeline`, `20261125160720_operations_access_performance_hardening`, `20261125164901_admin_push_notifications`, and `20261125165405_admin_push_browser_access_deny`.

## Verification status

- A database transaction test passed for recipe-based stock deduction, inventory movement logging, order status history, and blocking an order with a missing recipe after recipe tracking begins. Test rows were rolled back.
- Database permission checks confirm no browser INSERT access to orders/bookings and no browser access to request-rate-limit records.
- Security advisors no longer report exposed SECURITY DEFINER authorization helpers. One Auth warning remains: **Leaked Password Protection is disabled**. Enable it under Supabase Dashboard → Authentication → Password Security before public launch.
- The menu page's live HTML now contains the circular category-carousel stage. A full interactive browser run could not be completed because the connected browser-testing wallet has insufficient balance, so visual pointer testing remains unverified.
- The full customer order journey and staff invitation email still require acceptance testing with the owner's real contact settings and working Supabase Auth email delivery.

## Deferred until the final customer-details phase

Restaurant phone, WhatsApp, full address, Google Maps URL, working hours, delivery fee, minimum order, service areas and accepted payment methods remain intentionally blank/default until the owner provides the final customer-facing details.
