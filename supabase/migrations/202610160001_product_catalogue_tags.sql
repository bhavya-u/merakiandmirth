begin;
alter table public.library_items add column catalogue_role text not null default '' check(catalogue_role in ('','main-gift','add-on','packaging'));
alter table public.library_items add column collection_tags text[] not null default '{}' check(cardinality(collection_tags)<=20);
commit;
