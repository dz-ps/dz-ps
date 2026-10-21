-- Public buckets for bundles and icons (DECISIONS.md D5, D13). Reads are public; writes are service role only
-- (no insert/update policies for anon/authenticated).
insert into storage.buckets (id, name, public)
values ('catalog', 'catalog', true), ('icons', 'icons', true)
on conflict (id) do update set public = excluded.public;
