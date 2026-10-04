-- Occasion management is intentionally exposed through these three workspace
-- guarded RPCs.  They keep a rename or removal atomic with the product/combo
-- tag changes it requires, instead of leaving partial state in the browser.

create or replace function public.create_workspace_occasion(p_label text)
returns public.occasion_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_base text;
  v_code text;
  v_suffix integer := 1;
  v_row public.occasion_types;
begin
  if not public.is_app_member() then
    raise exception 'You do not have access to manage occasions';
  end if;
  if char_length(v_label) < 2 or char_length(v_label) > 80 then
    raise exception 'An occasion name must contain 2 to 80 characters';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.occasion_types'));
  v_base := trim(both '_' from regexp_replace(lower(v_label), '[^a-z0-9]+', '_', 'g'));
  if char_length(v_base) < 2 then
    raise exception 'Use letters or numbers in the occasion name';
  end if;
  if v_base = 'all' then
    raise exception 'All occasions is reserved for the system tag';
  end if;
  v_base := left(v_base, 45);
  v_code := v_base;
  while exists (select 1 from public.occasion_types where code = v_code) loop
    v_suffix := v_suffix + 1;
    v_code := left(v_base, 50 - char_length(v_suffix) - 1) || '_' || v_suffix;
  end loop;

  insert into public.occasion_types (code, label, sort_order)
  values (v_code, v_label, (select coalesce(max(sort_order), 0) + 10 from public.occasion_types))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.rename_workspace_occasion(p_code text, p_label text)
returns public.occasion_types
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text := btrim(coalesce(p_label, ''));
  v_row public.occasion_types;
begin
  if not public.is_app_member() then
    raise exception 'You do not have access to manage occasions';
  end if;
  if p_code = 'all' then
    raise exception 'The All occasions system tag cannot be renamed';
  end if;
  if char_length(v_label) < 2 or char_length(v_label) > 80 then
    raise exception 'An occasion name must contain 2 to 80 characters';
  end if;

  update public.occasion_types
  set label = v_label
  where code = p_code and active
  returning * into v_row;
  if not found then
    raise exception 'This occasion is no longer available';
  end if;
  return v_row;
end;
$$;

create or replace function public.remove_workspace_occasion(p_code text, p_replacement_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_member() then
    raise exception 'You do not have access to manage occasions';
  end if;
  if p_code = 'all' then
    raise exception 'The All occasions system tag cannot be removed';
  end if;
  if p_replacement_code = p_code or not exists (
    select 1 from public.occasion_types where code = p_replacement_code and active
  ) then
    raise exception 'Choose an active replacement occasion';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.occasion_types'));
  if not exists (select 1 from public.occasion_types where code = p_code and active) then
    raise exception 'This occasion is no longer available';
  end if;

  update public.library_items
  set occasions = case
    when cardinality(array_remove(coalesce(occasions, '{}'::text[]), p_code)) = 0
      then array[p_replacement_code]
    else array_remove(coalesce(occasions, '{}'::text[]), p_code)
  end
  where p_code = any(coalesce(occasions, '{}'::text[]));

  delete from public.occasion_types where code = p_code;
end;
$$;

revoke all on function public.create_workspace_occasion(text) from public;
revoke all on function public.rename_workspace_occasion(text, text) from public;
revoke all on function public.remove_workspace_occasion(text, text) from public;
grant execute on function public.create_workspace_occasion(text) to authenticated;
grant execute on function public.rename_workspace_occasion(text, text) to authenticated;
grant execute on function public.remove_workspace_occasion(text, text) to authenticated;
