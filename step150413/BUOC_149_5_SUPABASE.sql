-- ============================================================
-- [X] BƯỚC 149.5 - THƯ VIỆN ẢNH / VIDEO / YOUTUBE WEBSITE CÔNG KHAI
-- Public chỉ đọc nội dung đã công khai; Admin quản trị CRUD.
-- ============================================================
create table if not exists public.app3_public_media (
    id uuid primary key default gen_random_uuid(),
    media_type text not null check (media_type in ('image','video','youtube')),
    title text not null,
    category text,
    description text,
    media_url text not null,
    thumbnail_url text,
    sort_order integer not null default 0,
    is_published boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_app3_public_media_published_sort
    on public.app3_public_media(is_published, sort_order, created_at desc);

alter table public.app3_public_media enable row level security;

drop policy if exists "Public read published media" on public.app3_public_media;
drop policy if exists "Admin insert public media" on public.app3_public_media;
drop policy if exists "Admin update public media" on public.app3_public_media;
drop policy if exists "Admin delete public media" on public.app3_public_media;

create policy "Public read published media"
on public.app3_public_media for select
to anon, authenticated
using (is_published = true or public.app3_is_admin());

create policy "Admin insert public media"
on public.app3_public_media for insert
to authenticated
with check (public.app3_is_admin());

create policy "Admin update public media"
on public.app3_public_media for update
to authenticated
using (public.app3_is_admin())
with check (public.app3_is_admin());

create policy "Admin delete public media"
on public.app3_public_media for delete
to authenticated
using (public.app3_is_admin());

grant select on public.app3_public_media to anon;
grant select, insert, update, delete on public.app3_public_media to authenticated;
revoke references, trigger, truncate on public.app3_public_media from authenticated;

-- Bucket công khai cho ảnh/video hoạt động nhà trường.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'app3-public-media',
    'app3-public-media',
    true,
    209715200,
    array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read app3 media" on storage.objects;
drop policy if exists "Admin insert app3 media" on storage.objects;
drop policy if exists "Admin update app3 media" on storage.objects;
drop policy if exists "Admin delete app3 media" on storage.objects;

create policy "Public read app3 media"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'app3-public-media');

create policy "Admin insert app3 media"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'app3-public-media'
    and public.app3_is_admin()
);

create policy "Admin update app3 media"
on storage.objects for update
to authenticated
using (
    bucket_id = 'app3-public-media'
    and public.app3_is_admin()
)
with check (
    bucket_id = 'app3-public-media'
    and public.app3_is_admin()
);

create policy "Admin delete app3 media"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'app3-public-media'
    and public.app3_is_admin()
);

notify pgrst, 'reload schema';

-- Ảnh mẫu ban đầu từ bộ ảnh nhà trường đã cung cấp.
insert into public.app3_public_media(media_type,title,category,description,media_url,sort_order,is_published)
select 'image','Hoạt động học sinh','Hoạt động nhà trường','Khoảnh khắc sinh hoạt, học tập và hoạt động tập thể của học sinh.','assets/gallery/hoat-dong-01.jpg',1,true
where not exists (select 1 from public.app3_public_media where media_url='assets/gallery/hoat-dong-01.jpg');
insert into public.app3_public_media(media_type,title,category,description,media_url,sort_order,is_published)
select 'image','Hoạt động học sinh','Hoạt động nhà trường','Khoảnh khắc sinh hoạt, học tập và hoạt động tập thể của học sinh.','assets/gallery/hoat-dong-02.jpg',2,true
where not exists (select 1 from public.app3_public_media where media_url='assets/gallery/hoat-dong-02.jpg');
insert into public.app3_public_media(media_type,title,category,description,media_url,sort_order,is_published)
select 'image','Hoạt động học sinh','Hoạt động nhà trường','Khoảnh khắc sinh hoạt, học tập và hoạt động tập thể của học sinh.','assets/gallery/hoat-dong-03.jpg',3,true
where not exists (select 1 from public.app3_public_media where media_url='assets/gallery/hoat-dong-03.jpg');
insert into public.app3_public_media(media_type,title,category,description,media_url,sort_order,is_published)
select 'image','Hoạt động Đội','Hoạt động nhà trường','Hình ảnh sinh hoạt tập thể và hoạt động Đội.','assets/gallery/hoat-dong-04.jpg',4,true
where not exists (select 1 from public.app3_public_media where media_url='assets/gallery/hoat-dong-04.jpg');
insert into public.app3_public_media(media_type,title,category,description,media_url,sort_order,is_published)
select 'image','Hoạt động Đội','Hoạt động nhà trường','Hình ảnh sinh hoạt tập thể và hoạt động Đội.','assets/gallery/hoat-dong-05.jpg',5,true
where not exists (select 1 from public.app3_public_media where media_url='assets/gallery/hoat-dong-05.jpg');
insert into public.app3_public_media(media_type,title,category,description,media_url,sort_order,is_published)
select 'image','Hoạt động nhà trường','Hoạt động nhà trường','Khoảnh khắc trong hoạt động chung của nhà trường.','assets/gallery/hoat-dong-06.jpg',6,true
where not exists (select 1 from public.app3_public_media where media_url='assets/gallery/hoat-dong-06.jpg');
