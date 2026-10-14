-- Restore the intended permission model:
-- business owners can inspect records; only explicitly assigned admins can mutate them.
-- Existing company creators are demoted to owner; any other explicit admins remain admins.
begin;

update public.company_memberships cm
set role = 'owner'
from public.companies c
where cm.company_id = c.id
  and cm.user_id = c.created_by
  and cm.role = 'admin';

create or replace function public.create_company_for_current_user(p_company_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  created_company_id uuid;
  cleaned_name text := trim(coalesce(p_company_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if char_length(cleaned_name) < 2 or char_length(cleaned_name) > 100 then
    raise exception 'Company name must be between 2 and 100 characters';
  end if;

  insert into public.companies(name, created_by)
  values (cleaned_name, auth.uid())
  returning id into created_company_id;

  insert into public.company_memberships(company_id, user_id, role)
  values (created_company_id, auth.uid(), 'owner');

  return created_company_id;
end;
$function$;

revoke all on function public.create_company_for_current_user(text) from public;
grant execute on function public.create_company_for_current_user(text) to authenticated;

commit;
