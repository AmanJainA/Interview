-- Restore the custom-auth login RPC expected by src/supabaseClient.js.
-- The function lives in the exposed interview schema, not public.
create or replace function interview.login_user(
  p_email text,
  p_password text
)
returns table (
  id uuid,
  name text,
  email text,
  stream text,
  location text,
  registration_no text,
  contact_number text,
  gender text,
  father_name text,
  usertype text,
  created_date timestamptz
)
language sql
security definer
set search_path = interview, public, extensions
as $function$
  select
    u.id,
    u.name,
    u.email,
    u.stream,
    u.location,
    u.registration_no,
    u.contact_number,
    u.gender,
    u.father_name,
    u.usertype,
    u.created_date
  from interview.users as u
  where lower(u.email) = lower(trim(p_email))
    and u.password = extensions.crypt(p_password, u.password)
  limit 1;
$function$;

grant usage on schema interview to anon, authenticated;
grant execute on function interview.login_user(text, text) to anon, authenticated;
notify pgrst, 'reload schema';
