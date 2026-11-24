# Shrimp House — Supabase setup and connection status

## Live project
- Supabase project: Shrimp House
- Project ref: `hcxoysslyfsktnrshoaw`
- Project URL: `https://hcxoysslyfsktnrshoaw.supabase.co`
- Frontend config is already written to `supabase/config.js` using the public publishable key only.
- Schema has been applied directly to the dedicated Shrimp House project and verified.

## Tables and security
Tables: `staff_profiles`, `menu_items`, `orders`, `bookings`, `inventory_items`.
RLS is enabled on all five tables.
The staff/admin helper functions cannot be executed by anonymous users.
Public order and booking INSERT policies are intentionally disabled until a validated submission flow (prefer an Edge Function with server-side validation and abuse controls) is implemented.

## Remaining staff-account setup (manual Auth UI step)
1. Supabase Dashboard → Shrimp House → Authentication → Users.
2. Add/create the first staff/admin account. Keep the password private; do not paste it into chat or source code.
3. Once that user exists, run this SQL in the project's trusted SQL editor, replacing the email with the exact account email:
```sql
insert into public.staff_profiles (user_id, display_name, role)
select id, 'Restaurant Admin', 'admin'
from auth.users
where email = 'YOUR_ADMIN_EMAIL'
on conflict (user_id) do update set role = 'admin';
```
4. The admin login page uses Supabase Auth password sign-in and checks `staff_profiles.role` before redirecting to `admin.html`. The admin page itself also checks the current session and staff role before showing content.
5. Frontend values in `supabase/config.js` must remain the project URL plus publishable/anon key only. Never place service-role/secret keys in public files.

## Production readiness notes
- The admin dashboard sections are still visual placeholders; CRUD is not wired up yet.
- Public order/booking submission is currently blocked until a server-validated flow is built.
- Test with separate anonymous and staff accounts, review RLS policies, and run Supabase security advisors before accepting real orders.
