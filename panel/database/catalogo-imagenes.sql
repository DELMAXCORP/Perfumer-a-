-- Almacenamiento público de imágenes de perfumes.
-- La escritura se limita a administradores y a su carpeta personal.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogo-imagenes', 'catalogo-imagenes', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins upload catalog images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'catalogo-imagenes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(auth.jwt() ->> 'email') in ('diego@alpha.com', 'luis@alpha.com', 'mau@alpha.com')
);

create policy "Admins select own catalog images"
on storage.objects for select to authenticated
using (
  bucket_id = 'catalogo-imagenes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(auth.jwt() ->> 'email') in ('diego@alpha.com', 'luis@alpha.com', 'mau@alpha.com')
);

create policy "Admins delete own catalog images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'catalogo-imagenes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(auth.jwt() ->> 'email') in ('diego@alpha.com', 'luis@alpha.com', 'mau@alpha.com')
);
