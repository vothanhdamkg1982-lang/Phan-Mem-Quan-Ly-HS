-- ============================================================
-- BƯỚC 149.8 - THÔNG BÁO CÔNG KHAI + LIÊN KẾT WEBSITE
-- Chạy 1 lần trong Supabase SQL Editor. Có thể chạy lại an toàn.
-- ============================================================

create table if not exists public.app3_public_announcements (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    content text,
    link_url text,
    is_pinned boolean not null default false,
    is_published boolean not null default true,
    sort_order integer not null default 0,
    published_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.app3_public_links (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    description text,
    url text not null,
    icon text not null default 'link',
    sort_order integer not null default 0,
    is_published boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint app3_public_links_url_unique unique (url)
);

create index if not exists idx_app3_public_announcements_public
    on public.app3_public_announcements (is_published, is_pinned desc, sort_order, published_at desc);
create index if not exists idx_app3_public_links_public
    on public.app3_public_links (is_published, sort_order, created_at desc);

alter table public.app3_public_announcements enable row level security;
alter table public.app3_public_links enable row level security;

-- Thông báo: khách chỉ đọc bản công khai; Admin đọc tất cả và CRUD.
drop policy if exists "Public read published announcements" on public.app3_public_announcements;
drop policy if exists "Admin insert announcements" on public.app3_public_announcements;
drop policy if exists "Admin update announcements" on public.app3_public_announcements;
drop policy if exists "Admin delete announcements" on public.app3_public_announcements;
create policy "Public read published announcements"
on public.app3_public_announcements for select to anon, authenticated
using (is_published = true or public.app3_is_admin());
create policy "Admin insert announcements"
on public.app3_public_announcements for insert to authenticated
with check (public.app3_is_admin());
create policy "Admin update announcements"
on public.app3_public_announcements for update to authenticated
using (public.app3_is_admin()) with check (public.app3_is_admin());
create policy "Admin delete announcements"
on public.app3_public_announcements for delete to authenticated
using (public.app3_is_admin());

-- Liên kết: khách chỉ đọc bản công khai; Admin đọc tất cả và CRUD.
drop policy if exists "Public read published links" on public.app3_public_links;
drop policy if exists "Admin insert links" on public.app3_public_links;
drop policy if exists "Admin update links" on public.app3_public_links;
drop policy if exists "Admin delete links" on public.app3_public_links;
create policy "Public read published links"
on public.app3_public_links for select to anon, authenticated
using (is_published = true or public.app3_is_admin());
create policy "Admin insert links"
on public.app3_public_links for insert to authenticated
with check (public.app3_is_admin());
create policy "Admin update links"
on public.app3_public_links for update to authenticated
using (public.app3_is_admin()) with check (public.app3_is_admin());
create policy "Admin delete links"
on public.app3_public_links for delete to authenticated
using (public.app3_is_admin());

grant select on public.app3_public_announcements, public.app3_public_links to anon;
grant select, insert, update, delete on public.app3_public_announcements, public.app3_public_links to authenticated;
revoke references, trigger, truncate on public.app3_public_announcements, public.app3_public_links from anon, authenticated;

-- Hai liên kết mặc định. Nếu đã có cùng URL thì không tạo trùng.
insert into public.app3_public_links (title, description, url, icon, sort_order, is_published)
values
    ('VNEDU', 'Hệ thống đang sử dụng của nhà trường', 'https://ucnnzccazsgdkiengiang.vnedu.vn/v5/', 'school', 10, true),
    ('Bộ Giáo dục và Đào tạo', 'Cổng thông tin điện tử', 'https://moet.gov.vn/', 'landmark', 20, true)
on conflict (url) do nothing;

notify pgrst, 'reload schema';
