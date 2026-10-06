-- Administrative history: never grant client users access to migration controls.
create table public.image_migration_history (
  batch_id uuid not null,
  product_id text not null,
  previous_url text,
  new_url text not null,
  status text not null check (status in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  primary key (batch_id, product_id)
);
alter table public.image_migration_history enable row level security;
revoke all on public.image_migration_history from public, anon, authenticated;
grant select, insert, update on public.image_migration_history to service_role;

create function public.apply_image_migration(p_batch uuid, p_product text, p_previous text, p_new text)
returns text language plpgsql security definer set search_path = '' as $$
declare current_url text; prior public.image_migration_history%rowtype;
begin
  if p_new is null or btrim(p_new) = '' or p_new is not distinct from p_previous then
    raise exception 'A different nonempty image URL is required';
  end if;
  select photo into current_url from public.library_items where id = p_product and kind = 'product' for update;
  if not found then return 'missing'; end if;
  select * into prior from public.image_migration_history where batch_id = p_batch and product_id = p_product;
  if found then
    if prior.previous_url is distinct from p_previous or prior.new_url is distinct from p_new then
      raise exception 'Batch entry differs from original request';
    end if;
    if prior.status = 'applied' and current_url is not distinct from p_new then return 'already_applied'; end if;
    return 'conflict';
  end if;
  if current_url is distinct from p_previous then return 'conflict'; end if;
  insert into public.image_migration_history(batch_id, product_id, previous_url, new_url, status)
  values(p_batch, p_product, p_previous, p_new, 'applied');
  update public.library_items set photo = p_new where id = p_product;
  return 'applied';
end $$;

create function public.rollback_image_migration(p_batch uuid, p_product text)
returns text language plpgsql security definer set search_path = '' as $$
declare current_url text; prior public.image_migration_history%rowtype;
begin
  -- Same lock order as apply prevents conflicting administrative operations.
  select photo into current_url from public.library_items where id = p_product and kind = 'product' for update;
  if not found then return 'missing'; end if;
  select * into prior from public.image_migration_history where batch_id = p_batch and product_id = p_product for update;
  if not found then return 'missing_history'; end if;
  if prior.status = 'rolled_back' then
    if current_url is not distinct from prior.previous_url then return 'already_rolled_back'; end if;
    return 'conflict';
  end if;
  if current_url is distinct from prior.new_url then return 'conflict'; end if;
  update public.library_items set photo = prior.previous_url where id = p_product;
  update public.image_migration_history set status = 'rolled_back', rolled_back_at = now()
    where batch_id = p_batch and product_id = p_product;
  return 'rolled_back';
end $$;
revoke all on function public.apply_image_migration(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.rollback_image_migration(uuid,text) from public, anon, authenticated;
grant execute on function public.apply_image_migration(uuid,text,text,text) to service_role;
grant execute on function public.rollback_image_migration(uuid,text) to service_role;
