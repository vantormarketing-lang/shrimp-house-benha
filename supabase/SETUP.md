# Shrimp House — Supabase setup checklist

## 1. Create a dedicated Supabase project
Do not reuse the DOMA Academy project. Name it Shrimp House (or similar) and keep its credentials separate.

## 2. Run the schema
Open SQL Editor in the Shrimp House Supabase project and run `supabase/schema.sql`.

## 3. Enable Authentication
- Authentication → Providers → Email: enable email/password.
- Create your first admin user through Supabase Auth (invite/create the account yourself).
- Verify the email if email confirmation is enabled.

## 4. Assign the first admin role (trusted SQL Editor only)
Replace the email literal with the admin account's exact email. Run only after that Auth user exists:
```sql
insert into public.staff_profiles (user_id, display_name, role)
select id, 'Restaurant Admin', 'admin'
from auth.users
where email = 'YOUR_ADMIN_EMAIL'
on conflict (user_id) do update set role = 'admin';
```
This assigns the initial admin. Do not run from the public website.

## 5. Configure frontend values
Copy the Supabase Project URL and anon/public key from Project Settings → API into `supabase/config.js`.
The anon/public key is meant for frontend use when Row Level Security is correctly enabled. Never use the service_role key.

## 6. Before publishing the dashboard
- Implement login via Supabase Auth and verify the logged-in user's staff role.
- Protect admin UI routes with an auth gate.
- Keep all admin data operations behind RLS policies.
- Test anonymous reads, inserts, and admin/staff access with separate test accounts.
- Review the current SQL policies before accepting real customer orders. Public insert policies are intentionally permissive starter policies and need abuse controls/validation before production.

## Tables created
`staff_profiles`, `menu_items`, `orders`, `bookings`, `inventory_items`.
