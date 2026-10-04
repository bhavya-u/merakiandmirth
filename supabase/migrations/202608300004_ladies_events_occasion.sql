insert into public.occasion_types (code, label, sort_order, active)
values ('ladies_events', 'Ladies’ events', 77, true)
on conflict (code) do update set
  label = excluded.label,
  sort_order = excluded.sort_order,
  active = excluded.active;
