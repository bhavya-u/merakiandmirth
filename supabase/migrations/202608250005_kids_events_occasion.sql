insert into public.occasion_types (code, label, sort_order, active)
values ('kids_events', 'Kids’ events', 45, true)
on conflict (code) do update set
  label = excluded.label,
  sort_order = excluded.sort_order,
  active = excluded.active;
