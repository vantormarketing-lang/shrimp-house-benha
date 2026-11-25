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
- Realtime alerts are shown while an authenticated admin page is open; the browser notification permission is opt-in.
- Staff invitations run through `admin-staff-invite`, require an authenticated admin, send an Auth invitation email and create the staff profile. Supabase Auth email delivery/SMTP and the redirect URL must be configured.
- Inventory movements are recorded with an authenticated RPC. Order recipes are deducted when an order is moved into `preparing`; deductions happen only for recipes actually configured.

## New database objects and functions
- `menu_items.options`, `category_key`, `category_icon`
- `orders.tracking_code`, `fulfillment_type`, `delivery_fee`, `discount_amount`, `payment_method`, `stock_deducted_at`
- `bookings.booking_code`
- `restaurant_settings.maps_url`, social URLs, delivery fee, minimum, delivery areas and payment methods
- `menu_item_recipes`, `inventory_movements`, `order_status_history`, `staff_activity_logs`, `offers`, `request_rate_limits`
- Edge Functions: `submit-request` (public, server-validated) and `admin-staff-invite` (admin-only)
- Migrations: `20261125150819_restaurant_operations_foundation`, `20261125151636_secure_public_requests_and_inventory_movements`.

## Owner configuration still required
1. Enter the real restaurant phone, WhatsApp, full address, Google Maps URL, opening hours and social links in Admin → Settings.
2. Enter actual delivery fees, minimum order, delivery areas and accepted payment method labels (comma-separated). The checkout uses those settings; the server validates the selected payment-method label.
3. Add the real ingredients/stock amounts in Inventory, then create recipe quantities for each menu item in Recipes. Do not invent ingredient quantities; automatic stock deduction will apply only after real recipes are entered.
4. Confirm Auth email/SMTP delivery and the allowed redirect URL for staff invitations.
5. Browser push notifications are optional; allow notifications in the browser while the admin page is open.

## Security notes
- RLS remains enabled. The public role can read available menu items and active offers; it cannot insert orders or bookings directly.
- Request rate-limit records are not readable/writable by browser roles.
- No service-role or secret key is stored in this repository.
- Review Supabase Auth's leaked-password protection and remaining security advisor findings before advertising the system as fully production-hardened.
