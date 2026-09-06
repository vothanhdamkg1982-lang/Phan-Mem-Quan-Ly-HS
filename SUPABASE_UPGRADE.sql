-- ============================================================
-- QUẢN LÝ HỌC SINH - GÓI NÂNG CẤP 2026
-- Chạy TỪNG KHỐI trong Supabase SQL Editor sau khi đã sao lưu.
-- ============================================================

-- [A] Cho phép người dùng authenticated quản lý danh mục môn học.
grant select, update on table public.app3_subjects to authenticated;

drop policy if exists "Authenticated can update app3_subjects" on public.app3_subjects;
create policy "Authenticated can update app3_subjects"
on public.app3_subjects
for update
to authenticated
using (true)
with check (true);

-- [B] Bảng vai trò người dùng.
create table if not exists public.app3_user_roles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text,
    display_name text,
    role text not null default 'teacher' check (role in ('admin','teacher','viewer')),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.app3_user_roles enable row level security;
grant select, insert, update on table public.app3_user_roles to authenticated;

-- Hàm kiểm tra admin, SECURITY DEFINER để tránh policy tự truy vấn lặp.
create or replace function public.app3_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.app3_user_roles r
        where r.user_id = auth.uid() and r.role = 'admin' and r.active = true
    );
$$;

revoke all on function public.app3_is_admin() from public;
grant execute on function public.app3_is_admin() to authenticated;

drop policy if exists "Users read roles" on public.app3_user_roles;
create policy "Users read roles"
on public.app3_user_roles for select to authenticated
using (user_id = auth.uid() or public.app3_is_admin());

drop policy if exists "Admins update roles" on public.app3_user_roles;
create policy "Admins update roles"
on public.app3_user_roles for update to authenticated
using (public.app3_is_admin())
with check (public.app3_is_admin());

-- Đồng bộ các tài khoản Auth hiện có thành teacher nếu chưa có.
insert into public.app3_user_roles (user_id, email, display_name, role, active)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email), 'teacher', true
from auth.users u
on conflict (user_id) do nothing;

-- QUAN TRỌNG: Sau khối trên, chọn đúng email quản trị của bạn và chạy MỘT lệnh sau:
-- update public.app3_user_roles set role = 'admin', updated_at = now() where email = 'EMAIL_CUA_BAN';

-- [C] Tự tạo hồ sơ teacher cho tài khoản đăng ký mới.
create or replace function public.app3_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app3_user_roles(user_id,email,display_name,role,active)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',new.email),'teacher',true)
  on conflict(user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists app3_on_auth_user_created on auth.users;
create trigger app3_on_auth_user_created
after insert on auth.users
for each row execute procedure public.app3_handle_new_user();

-- [D] Kiểm tra sau khi chạy.
-- select id,name,grades,active from public.app3_subjects order by name;
-- select user_id,email,display_name,role,active from public.app3_user_roles order by email;

-- ============================================================
-- [E] FULL RESTORE SNAPSHOT - CHỈ CHẠY Ở BƯỚC 109 KHI ĐƯỢC HƯỚNG DẪN
-- Toàn bộ hàm chạy trong 1 transaction của PostgreSQL: nếu một lệnh lỗi,
-- các thay đổi của lần gọi RPC sẽ rollback.
-- ============================================================
create or replace function public.app3_full_restore_backup(
    p_backup jsonb,
    p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tables jsonb;
begin
    if auth.uid() is null then
        raise exception 'Bạn phải đăng nhập để khôi phục dữ liệu.';
    end if;
    if p_confirmation is distinct from 'FULL_RESTORE' then
        raise exception 'Thiếu mã xác nhận FULL_RESTORE.';
    end if;
    if coalesce(p_backup->>'format','') <> 'QLHS_BACKUP_V1' then
        raise exception 'File backup không đúng định dạng QLHS_BACKUP_V1.';
    end if;
    v_tables := p_backup->'tables';
    if v_tables is null then raise exception 'Backup không có tables.'; end if;

    -- Bắt buộc đủ tất cả bảng để tránh xóa nhầm vì file backup thiếu phần.
    if not (v_tables ?& array[
        'app3_subjects','app3_classes','app3_students','app3_scores',
        'app3_attendance','app3_rewards','app3_disciplines',
        'app3_learning_comments','app3_files','app3_settings'
    ]) then
        raise exception 'Backup thiếu một hoặc nhiều bảng bắt buộc.';
    end if;

    -- Xóa bảng con trước để tôn trọng khóa ngoại.
    delete from public.app3_attendance where true;
    delete from public.app3_rewards where true;
    delete from public.app3_disciplines where true;
    delete from public.app3_learning_comments where true;
    delete from public.app3_files where true;
    delete from public.app3_scores where true;
    delete from public.app3_students where true;
    delete from public.app3_classes where true;
    delete from public.app3_subjects where true;
    delete from public.app3_settings where true;

    -- Phục hồi bảng cha trước, sau đó bảng con.
    insert into public.app3_subjects select * from jsonb_populate_recordset(null::public.app3_subjects, v_tables->'app3_subjects');
    insert into public.app3_classes select * from jsonb_populate_recordset(null::public.app3_classes, v_tables->'app3_classes');
    insert into public.app3_students select * from jsonb_populate_recordset(null::public.app3_students, v_tables->'app3_students');
    insert into public.app3_scores select * from jsonb_populate_recordset(null::public.app3_scores, v_tables->'app3_scores');
    insert into public.app3_attendance select * from jsonb_populate_recordset(null::public.app3_attendance, v_tables->'app3_attendance');
    insert into public.app3_rewards select * from jsonb_populate_recordset(null::public.app3_rewards, v_tables->'app3_rewards');
    insert into public.app3_disciplines select * from jsonb_populate_recordset(null::public.app3_disciplines, v_tables->'app3_disciplines');
    insert into public.app3_learning_comments select * from jsonb_populate_recordset(null::public.app3_learning_comments, v_tables->'app3_learning_comments');
    insert into public.app3_files select * from jsonb_populate_recordset(null::public.app3_files, v_tables->'app3_files');
    insert into public.app3_settings select * from jsonb_populate_recordset(null::public.app3_settings, v_tables->'app3_settings');

    return jsonb_build_object(
        'ok', true,
        'format', p_backup->>'format',
        'created_at', p_backup->>'created_at',
        'students', jsonb_array_length(v_tables->'app3_students'),
        'scores', jsonb_array_length(v_tables->'app3_scores')
    );
end;
$$;

revoke all on function public.app3_full_restore_backup(jsonb,text) from public;
grant execute on function public.app3_full_restore_backup(jsonb,text) to authenticated;


-- Làm mới schema cache PostgREST sau khi cập nhật RPC.
notify pgrst, 'reload schema';

-- ============================================================
-- [F] BƯỚC 119.2 / 119.6 - PHÂN CÔNG NGƯỜI DÙNG THEO MÔN - LỚP
-- Có thể chạy lại an toàn trên hệ thống đã nâng cấp.
-- ============================================================
alter table public.app3_user_roles
add column if not exists access_scope text not null default 'all';

-- Bổ sung/ràng buộc access_scope trên CSDL đã có cột từ trước.
alter table public.app3_user_roles
    drop constraint if exists app3_user_roles_access_scope_check;
alter table public.app3_user_roles
    add constraint app3_user_roles_access_scope_check
    check (access_scope in ('all', 'assigned'));

create table if not exists public.app3_teacher_assignments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.app3_user_roles(user_id) on delete cascade,
    subject_id varchar not null references public.app3_subjects(id) on delete cascade,
    class_id uuid not null references public.app3_classes(id) on delete cascade,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint app3_teacher_assignments_unique unique (user_id, subject_id, class_id)
);

alter table public.app3_teacher_assignments enable row level security;

grant select, insert, update, delete
on table public.app3_teacher_assignments
to authenticated;

grant update (access_scope)
on table public.app3_user_roles
to authenticated;

drop policy if exists "Admin insert teacher assignments" on public.app3_teacher_assignments;
create policy "Admin insert teacher assignments"
on public.app3_teacher_assignments
for insert to authenticated
with check (public.app3_is_admin());

drop policy if exists "Admin update teacher assignments" on public.app3_teacher_assignments;
create policy "Admin update teacher assignments"
on public.app3_teacher_assignments
for update to authenticated
using (public.app3_is_admin())
with check (public.app3_is_admin());

drop policy if exists "Admin delete teacher assignments" on public.app3_teacher_assignments;
create policy "Admin delete teacher assignments"
on public.app3_teacher_assignments
for delete to authenticated
using (public.app3_is_admin());

drop policy if exists "Users read own assignments or admin read all" on public.app3_teacher_assignments;
create policy "Users read own assignments or admin read all"
on public.app3_teacher_assignments
for select to authenticated
using (user_id = auth.uid() or public.app3_is_admin());

notify pgrst, 'reload schema';

-- ============================================================
-- [G] BƯỚC 121.4 - RLS THẬT CHO app3_scores
-- Đã kiểm nghiệm: Admin ghi toàn bộ; Teacher theo access_scope;
-- Viewer chỉ đọc theo access_scope và không thể UPDATE trực tiếp.
-- Có thể chạy lại an toàn.
-- ============================================================
create or replace function public.app3_can_read_score(
    p_student_id uuid,
    p_subject_id varchar
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and (
                r.role = 'admin'
                or
                (
                    r.role in ('teacher', 'viewer')
                    and (
                        r.access_scope = 'all'
                        or (
                            r.access_scope = 'assigned'
                            and exists (
                                select 1
                                from public.app3_students st
                                join public.app3_teacher_assignments a
                                  on a.user_id = r.user_id
                                 and a.class_id = st.class_id
                                 and a.subject_id = p_subject_id
                                 and a.active = true
                                where st.id = p_student_id
                            )
                        )
                    )
                )
          )
    );
$$;

create or replace function public.app3_can_write_score(
    p_student_id uuid,
    p_subject_id varchar
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and (
                r.role = 'admin'
                or
                (
                    r.role = 'teacher'
                    and (
                        r.access_scope = 'all'
                        or (
                            r.access_scope = 'assigned'
                            and exists (
                                select 1
                                from public.app3_students st
                                join public.app3_teacher_assignments a
                                  on a.user_id = r.user_id
                                 and a.class_id = st.class_id
                                 and a.subject_id = p_subject_id
                                 and a.active = true
                                where st.id = p_student_id
                            )
                        )
                    )
                )
          )
    );
$$;

revoke all on function public.app3_can_read_score(uuid,varchar) from public;
revoke all on function public.app3_can_write_score(uuid,varchar) from public;
grant execute on function public.app3_can_read_score(uuid,varchar) to authenticated;
grant execute on function public.app3_can_write_score(uuid,varchar) to authenticated;

alter table public.app3_scores enable row level security;

drop policy if exists "Allow authenticated full access on app3_scores" on public.app3_scores;
drop policy if exists "Allow full access to app3_scores" on public.app3_scores;
drop policy if exists "Scores read by access scope" on public.app3_scores;
drop policy if exists "Scores insert by access scope" on public.app3_scores;
drop policy if exists "Scores update by access scope" on public.app3_scores;
drop policy if exists "Scores delete by access scope" on public.app3_scores;

create policy "Scores read by access scope"
on public.app3_scores
for select to authenticated
using (public.app3_can_read_score(student_id, subject_id));

create policy "Scores insert by access scope"
on public.app3_scores
for insert to authenticated
with check (public.app3_can_write_score(student_id, subject_id));

create policy "Scores update by access scope"
on public.app3_scores
for update to authenticated
using (public.app3_can_write_score(student_id, subject_id))
with check (public.app3_can_write_score(student_id, subject_id));

create policy "Scores delete by access scope"
on public.app3_scores
for delete to authenticated
using (public.app3_can_write_score(student_id, subject_id));

grant select, insert, update, delete on table public.app3_scores to authenticated;
revoke insert, update, delete on table public.app3_scores from anon;

notify pgrst, 'reload schema';

-- ============================================================
-- [H] BƯỚC 122.3 - RLS THẬT CHO app3_students
-- Đã kiểm nghiệm: Admin đọc/ghi toàn bộ; Teacher/Viewer chỉ đọc
-- theo access_scope; chỉ Admin được thêm/sửa/xóa hồ sơ học sinh.
-- Có thể chạy lại an toàn.
-- ============================================================
create or replace function public.app3_can_read_student(
    p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and (
                r.role = 'admin'
                or (
                    r.role in ('teacher', 'viewer')
                    and (
                        r.access_scope = 'all'
                        or (
                            r.access_scope = 'assigned'
                            and exists (
                                select 1
                                from public.app3_teacher_assignments a
                                where a.user_id = r.user_id
                                  and a.class_id = p_class_id
                                  and a.active = true
                            )
                        )
                    )
                )
          )
    );
$$;

create or replace function public.app3_can_write_student()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and r.role = 'admin'
    );
$$;

revoke all on function public.app3_can_read_student(uuid) from public;
revoke all on function public.app3_can_write_student() from public;
grant execute on function public.app3_can_read_student(uuid) to authenticated;
grant execute on function public.app3_can_write_student() to authenticated;

alter table public.app3_students enable row level security;

drop policy if exists "Allow authenticated full access on app3_students" on public.app3_students;
drop policy if exists "Students read by access scope" on public.app3_students;
drop policy if exists "Students insert admin only" on public.app3_students;
drop policy if exists "Students update admin only" on public.app3_students;
drop policy if exists "Students delete admin only" on public.app3_students;

create policy "Students read by access scope"
on public.app3_students
for select to authenticated
using (public.app3_can_read_student(class_id));

create policy "Students insert admin only"
on public.app3_students
for insert to authenticated
with check (public.app3_can_write_student());

create policy "Students update admin only"
on public.app3_students
for update to authenticated
using (public.app3_can_write_student())
with check (public.app3_can_write_student());

create policy "Students delete admin only"
on public.app3_students
for delete to authenticated
using (public.app3_can_write_student());

grant select, insert, update, delete on table public.app3_students to authenticated;
revoke insert, update, delete on table public.app3_students from anon;

notify pgrst, 'reload schema';

-- ============================================================
-- [I] BƯỚC 122.5E - RLS THẬT CHO app3_learning_comments
-- Đã kiểm nghiệm: quyền theo đúng cặp Môn - Lớp.
-- Admin đọc/ghi toàn bộ; Teacher ghi theo access_scope;
-- Viewer chỉ đọc theo access_scope; active=false bị chặn.
-- Có thể chạy lại an toàn.
-- ============================================================
create or replace function public.app3_can_read_learning_comment(
    p_class_id uuid,
    p_subject text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and (
                r.role = 'admin'
                or (
                    r.role in ('teacher', 'viewer')
                    and (
                        r.access_scope = 'all'
                        or (
                            r.access_scope = 'assigned'
                            and exists (
                                select 1
                                from public.app3_teacher_assignments a
                                join public.app3_subjects s
                                  on s.id = a.subject_id
                                where a.user_id = r.user_id
                                  and a.class_id = p_class_id
                                  and s.name = p_subject
                                  and a.active = true
                            )
                        )
                    )
                )
          )
    );
$$;

create or replace function public.app3_can_write_learning_comment(
    p_class_id uuid,
    p_subject text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and (
                r.role = 'admin'
                or (
                    r.role = 'teacher'
                    and (
                        r.access_scope = 'all'
                        or (
                            r.access_scope = 'assigned'
                            and exists (
                                select 1
                                from public.app3_teacher_assignments a
                                join public.app3_subjects s
                                  on s.id = a.subject_id
                                where a.user_id = r.user_id
                                  and a.class_id = p_class_id
                                  and s.name = p_subject
                                  and a.active = true
                            )
                        )
                    )
                )
          )
    );
$$;

revoke all on function public.app3_can_read_learning_comment(uuid,text) from public;
revoke all on function public.app3_can_write_learning_comment(uuid,text) from public;
grant execute on function public.app3_can_read_learning_comment(uuid,text) to authenticated;
grant execute on function public.app3_can_write_learning_comment(uuid,text) to authenticated;

alter table public.app3_learning_comments enable row level security;

drop policy if exists "Allow all authenticated users" on public.app3_learning_comments;
drop policy if exists "Authenticated users can delete learning comments" on public.app3_learning_comments;
drop policy if exists "Authenticated users can insert learning comments" on public.app3_learning_comments;
drop policy if exists "Authenticated users can update learning comments" on public.app3_learning_comments;
drop policy if exists "Authenticated users can view learning comments" on public.app3_learning_comments;
drop policy if exists "Learning comments read by access scope" on public.app3_learning_comments;
drop policy if exists "Learning comments insert by access scope" on public.app3_learning_comments;
drop policy if exists "Learning comments update by access scope" on public.app3_learning_comments;
drop policy if exists "Learning comments delete by access scope" on public.app3_learning_comments;

create policy "Learning comments read by access scope"
on public.app3_learning_comments
for select to authenticated
using (public.app3_can_read_learning_comment(class_id, subject));

create policy "Learning comments insert by access scope"
on public.app3_learning_comments
for insert to authenticated
with check (public.app3_can_write_learning_comment(class_id, subject));

create policy "Learning comments update by access scope"
on public.app3_learning_comments
for update to authenticated
using (public.app3_can_write_learning_comment(class_id, subject))
with check (public.app3_can_write_learning_comment(class_id, subject));

create policy "Learning comments delete by access scope"
on public.app3_learning_comments
for delete to authenticated
using (public.app3_can_write_learning_comment(class_id, subject));

grant select, insert, update, delete on table public.app3_learning_comments to authenticated;
revoke insert, update, delete on table public.app3_learning_comments from anon;

notify pgrst, 'reload schema';

-- ============================================================
-- [J] BƯỚC 124.3 - CHUẨN HÓA LỚP + MÔN CHO
-- KHEN THƯỞNG / KỶ LUẬT / NHẬN XÉT HỌC TẬP
-- ============================================================

alter table public.app3_rewards add column if not exists class_id uuid;
alter table public.app3_rewards add column if not exists subject_id varchar;
alter table public.app3_rewards add column if not exists subject text;

alter table public.app3_disciplines add column if not exists class_id uuid;
alter table public.app3_disciplines add column if not exists subject_id varchar;
alter table public.app3_disciplines add column if not exists subject text;

alter table public.app3_learning_comments add column if not exists subject_id varchar;

update public.app3_rewards r
set class_id = s.class_id
from public.app3_students s
where r.student_id = s.id and r.class_id is null and s.class_id is not null;

update public.app3_disciplines d
set class_id = s.class_id
from public.app3_students s
where d.student_id = s.id and d.class_id is null and s.class_id is not null;

update public.app3_learning_comments lc
set subject_id = s.id
from public.app3_subjects s
where lc.subject_id is null
  and lc.subject is not null
  and lower(trim(lc.subject)) = lower(trim(s.name));

do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'app3_rewards_class_id_fkey') then
        alter table public.app3_rewards add constraint app3_rewards_class_id_fkey
        foreign key (class_id) references public.app3_classes(id) on delete set null;
    end if;
end $$;

do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'app3_rewards_subject_id_fkey') then
        alter table public.app3_rewards add constraint app3_rewards_subject_id_fkey
        foreign key (subject_id) references public.app3_subjects(id) on delete set null;
    end if;
end $$;

do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'app3_disciplines_class_id_fkey') then
        alter table public.app3_disciplines add constraint app3_disciplines_class_id_fkey
        foreign key (class_id) references public.app3_classes(id) on delete set null;
    end if;
end $$;

do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'app3_disciplines_subject_id_fkey') then
        alter table public.app3_disciplines add constraint app3_disciplines_subject_id_fkey
        foreign key (subject_id) references public.app3_subjects(id) on delete set null;
    end if;
end $$;

do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'app3_learning_comments_subject_id_fkey') then
        alter table public.app3_learning_comments add constraint app3_learning_comments_subject_id_fkey
        foreign key (subject_id) references public.app3_subjects(id) on delete set null;
    end if;
end $$;

create index if not exists idx_app3_rewards_class_subject
on public.app3_rewards(class_id, subject_id);
create index if not exists idx_app3_disciplines_class_subject
on public.app3_disciplines(class_id, subject_id);
create index if not exists idx_app3_learning_comments_class_subject
on public.app3_learning_comments(class_id, subject_id);

notify pgrst, 'reload schema';

-- ============================================================
-- [K] BƯỚC 123.2 - RLS THẬT CHO app3_classes
-- Đã triển khai trên Supabase: Admin toàn quyền;
-- Teacher/Viewer đọc theo access_scope; chỉ Admin được ghi.
-- Có thể chạy lại an toàn.
-- ============================================================
create or replace function public.app3_can_read_class(
    p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and (
                r.role = 'admin'
                or (
                    r.role in ('teacher', 'viewer')
                    and (
                        r.access_scope = 'all'
                        or (
                            r.access_scope = 'assigned'
                            and exists (
                                select 1
                                from public.app3_teacher_assignments a
                                where a.user_id = r.user_id
                                  and a.class_id = p_class_id
                                  and a.active = true
                            )
                        )
                    )
                )
          )
    );
$$;

create or replace function public.app3_can_write_class()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and r.role = 'admin'
    );
$$;

revoke all on function public.app3_can_read_class(uuid) from public;
revoke all on function public.app3_can_write_class() from public;
grant execute on function public.app3_can_read_class(uuid) to authenticated;
grant execute on function public.app3_can_write_class() to authenticated;

alter table public.app3_classes enable row level security;

drop policy if exists "Allow authenticated full access on app3_classes" on public.app3_classes;
drop policy if exists "Allow read access to app3_classes" on public.app3_classes;
drop policy if exists "Classes read by access scope" on public.app3_classes;
drop policy if exists "Classes insert admin only" on public.app3_classes;
drop policy if exists "Classes update admin only" on public.app3_classes;
drop policy if exists "Classes delete admin only" on public.app3_classes;

create policy "Classes read by access scope"
on public.app3_classes
for select to authenticated
using (public.app3_can_read_class(id));

create policy "Classes insert admin only"
on public.app3_classes
for insert to authenticated
with check (public.app3_can_write_class());

create policy "Classes update admin only"
on public.app3_classes
for update to authenticated
using (public.app3_can_write_class())
with check (public.app3_can_write_class());

create policy "Classes delete admin only"
on public.app3_classes
for delete to authenticated
using (public.app3_can_write_class());

grant select, insert, update, delete on table public.app3_classes to authenticated;
revoke insert, update, delete on table public.app3_classes from anon;

notify pgrst, 'reload schema';

-- ============================================================
-- [L] BƯỚC 124.7 - RLS THẬT CHO KHEN THƯỞNG + KỶ LUẬT
-- Đã kiểm nghiệm thực tế:
--   * Admin đọc/ghi/xóa toàn bộ và vẫn thấy dữ liệu cũ.
--   * Teacher assigned chỉ đọc/ghi đúng cặp Lớp + Môn.
--   * UPDATE ngoài phạm vi trả data=[] / error=null.
--   * Viewer chỉ đọc theo access_scope.
-- Dữ liệu cũ subject_id IS NULL chỉ Admin hoặc tài khoản scope=all
-- có thể đọc; assigned không được suy đoán quyền trên dữ liệu chưa rõ môn.
-- Có thể chạy lại an toàn.
-- ============================================================
create or replace function public.app3_can_read_class_subject_record(
    p_class_id uuid,
    p_subject_id varchar
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and (
                r.role = 'admin'
                or (
                    r.role in ('teacher', 'viewer')
                    and (
                        r.access_scope = 'all'
                        or (
                            r.access_scope = 'assigned'
                            and p_class_id is not null
                            and p_subject_id is not null
                            and exists (
                                select 1
                                from public.app3_teacher_assignments a
                                where a.user_id = r.user_id
                                  and a.class_id = p_class_id
                                  and a.subject_id = p_subject_id
                                  and a.active = true
                            )
                        )
                    )
                )
          )
    );
$$;

create or replace function public.app3_can_write_class_subject_record(
    p_class_id uuid,
    p_subject_id varchar
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and (
                r.role = 'admin'
                or (
                    r.role = 'teacher'
                    and (
                        r.access_scope = 'all'
                        or (
                            r.access_scope = 'assigned'
                            and p_class_id is not null
                            and p_subject_id is not null
                            and exists (
                                select 1
                                from public.app3_teacher_assignments a
                                where a.user_id = r.user_id
                                  and a.class_id = p_class_id
                                  and a.subject_id = p_subject_id
                                  and a.active = true
                            )
                        )
                    )
                )
          )
    );
$$;

revoke all on function public.app3_can_read_class_subject_record(uuid, varchar) from public;
revoke all on function public.app3_can_write_class_subject_record(uuid, varchar) from public;
grant execute on function public.app3_can_read_class_subject_record(uuid, varchar) to authenticated;
grant execute on function public.app3_can_write_class_subject_record(uuid, varchar) to authenticated;

alter table public.app3_rewards enable row level security;
alter table public.app3_disciplines enable row level security;

drop policy if exists "Allow authenticated full access on app3_rewards" on public.app3_rewards;
drop policy if exists "Rewards read by access scope" on public.app3_rewards;
drop policy if exists "Rewards insert by access scope" on public.app3_rewards;
drop policy if exists "Rewards update by access scope" on public.app3_rewards;
drop policy if exists "Rewards delete by access scope" on public.app3_rewards;

create policy "Rewards read by access scope"
on public.app3_rewards
for select to authenticated
using (public.app3_can_read_class_subject_record(class_id, subject_id));

create policy "Rewards insert by access scope"
on public.app3_rewards
for insert to authenticated
with check (public.app3_can_write_class_subject_record(class_id, subject_id));

create policy "Rewards update by access scope"
on public.app3_rewards
for update to authenticated
using (public.app3_can_write_class_subject_record(class_id, subject_id))
with check (public.app3_can_write_class_subject_record(class_id, subject_id));

create policy "Rewards delete by access scope"
on public.app3_rewards
for delete to authenticated
using (public.app3_can_write_class_subject_record(class_id, subject_id));

drop policy if exists "Allow authenticated full access on app3_disciplines" on public.app3_disciplines;
drop policy if exists "Disciplines read by access scope" on public.app3_disciplines;
drop policy if exists "Disciplines insert by access scope" on public.app3_disciplines;
drop policy if exists "Disciplines update by access scope" on public.app3_disciplines;
drop policy if exists "Disciplines delete by access scope" on public.app3_disciplines;

create policy "Disciplines read by access scope"
on public.app3_disciplines
for select to authenticated
using (public.app3_can_read_class_subject_record(class_id, subject_id));

create policy "Disciplines insert by access scope"
on public.app3_disciplines
for insert to authenticated
with check (public.app3_can_write_class_subject_record(class_id, subject_id));

create policy "Disciplines update by access scope"
on public.app3_disciplines
for update to authenticated
using (public.app3_can_write_class_subject_record(class_id, subject_id))
with check (public.app3_can_write_class_subject_record(class_id, subject_id));

create policy "Disciplines delete by access scope"
on public.app3_disciplines
for delete to authenticated
using (public.app3_can_write_class_subject_record(class_id, subject_id));

grant select, insert, update, delete on table public.app3_rewards to authenticated;
grant select, insert, update, delete on table public.app3_disciplines to authenticated;
revoke insert, update, delete on table public.app3_rewards from anon;
revoke insert, update, delete on table public.app3_disciplines from anon;

notify pgrst, 'reload schema';

-- ============================================================
-- [M] BƯỚC 127.3 - CHUẨN HÓA RLS NHẬN XÉT HỌC TẬP
--     THEO class_id + subject_id
-- ============================================================

create or replace function public.app3_can_read_learning_comment_v2(
    p_class_id uuid,
    p_subject_id varchar
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and (
                r.role = 'admin'
                or
                (
                    r.role in ('teacher', 'viewer')
                    and (
                        r.access_scope = 'all'
                        or
                        (
                            r.access_scope = 'assigned'
                            and p_class_id is not null
                            and p_subject_id is not null
                            and exists (
                                select 1
                                from public.app3_teacher_assignments a
                                where a.user_id = r.user_id
                                  and a.class_id = p_class_id
                                  and a.subject_id = p_subject_id
                                  and a.active = true
                            )
                        )
                    )
                )
          )
    );
$$;

create or replace function public.app3_can_write_learning_comment_v2(
    p_class_id uuid,
    p_subject_id varchar
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and (
                r.role = 'admin'
                or
                (
                    r.role = 'teacher'
                    and (
                        r.access_scope = 'all'
                        or
                        (
                            r.access_scope = 'assigned'
                            and p_class_id is not null
                            and p_subject_id is not null
                            and exists (
                                select 1
                                from public.app3_teacher_assignments a
                                where a.user_id = r.user_id
                                  and a.class_id = p_class_id
                                  and a.subject_id = p_subject_id
                                  and a.active = true
                            )
                        )
                    )
                )
          )
    );
$$;

revoke all on function public.app3_can_read_learning_comment_v2(uuid, varchar) from public;
revoke all on function public.app3_can_write_learning_comment_v2(uuid, varchar) from public;
grant execute on function public.app3_can_read_learning_comment_v2(uuid, varchar) to authenticated;
grant execute on function public.app3_can_write_learning_comment_v2(uuid, varchar) to authenticated;

alter table public.app3_learning_comments enable row level security;

drop policy if exists "Learning comments read by access scope" on public.app3_learning_comments;
drop policy if exists "Learning comments insert by access scope" on public.app3_learning_comments;
drop policy if exists "Learning comments update by access scope" on public.app3_learning_comments;
drop policy if exists "Learning comments delete by access scope" on public.app3_learning_comments;

create policy "Learning comments read by access scope"
on public.app3_learning_comments
for select to authenticated
using (public.app3_can_read_learning_comment_v2(class_id, subject_id));

create policy "Learning comments insert by access scope"
on public.app3_learning_comments
for insert to authenticated
with check (public.app3_can_write_learning_comment_v2(class_id, subject_id));

create policy "Learning comments update by access scope"
on public.app3_learning_comments
for update to authenticated
using (public.app3_can_write_learning_comment_v2(class_id, subject_id))
with check (public.app3_can_write_learning_comment_v2(class_id, subject_id));

create policy "Learning comments delete by access scope"
on public.app3_learning_comments
for delete to authenticated
using (public.app3_can_write_learning_comment_v2(class_id, subject_id));

notify pgrst, 'reload schema';

-- ============================================================
-- [N] BƯỚC 129.5 - RLS ĐIỂM DANH THEO PHẠM VI LỚP
-- Đã kiểm thử thực tế Bước 129.6-129.9 ngày 2026-09-02.
-- Admin: toàn quyền; Teacher all: đọc/ghi toàn bộ;
-- Teacher assigned: đọc/ghi lớp được phân công; Viewer: chỉ đọc theo phạm vi.
-- ============================================================

create or replace function public.app3_can_write_attendance(
    p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles r
        where r.user_id = auth.uid()
          and r.active = true
          and (
                r.role = 'admin'
                or
                (
                    r.role = 'teacher'
                    and (
                        r.access_scope = 'all'
                        or
                        (
                            r.access_scope = 'assigned'
                            and p_class_id is not null
                            and exists (
                                select 1
                                from public.app3_teacher_assignments a
                                where a.user_id = r.user_id
                                  and a.class_id = p_class_id
                                  and a.active = true
                            )
                        )
                    )
                )
          )
    );
$$;

revoke all on function public.app3_can_write_attendance(uuid) from public;
grant execute on function public.app3_can_write_attendance(uuid) to authenticated;

alter table public.app3_attendance enable row level security;

drop policy if exists "Allow authenticated full access on app3_attendance" on public.app3_attendance;
drop policy if exists "Attendance read by class scope" on public.app3_attendance;
drop policy if exists "Attendance insert by class scope" on public.app3_attendance;
drop policy if exists "Attendance update by class scope" on public.app3_attendance;
drop policy if exists "Attendance delete by class scope" on public.app3_attendance;

create policy "Attendance read by class scope"
on public.app3_attendance
for select to authenticated
using (public.app3_can_read_class(class_id));

create policy "Attendance insert by class scope"
on public.app3_attendance
for insert to authenticated
with check (public.app3_can_write_attendance(class_id));

create policy "Attendance update by class scope"
on public.app3_attendance
for update to authenticated
using (public.app3_can_write_attendance(class_id))
with check (public.app3_can_write_attendance(class_id));

create policy "Attendance delete by class scope"
on public.app3_attendance
for delete to authenticated
using (public.app3_can_write_attendance(class_id));

grant select, insert, update, delete on public.app3_attendance to authenticated;
revoke insert, update, delete on public.app3_attendance from anon;

notify pgrst, 'reload schema';

-- ============================================================
-- [O] BƯỚC 130.4 - RLS CHO app3_files
-- Đã kiểm thử thực tế Bước 130.5-130.9 ngày 2026-09-02.
-- Admin: đọc/ghi toàn bộ.
-- Teacher: đọc toàn bộ, thêm file, chỉ sửa/xóa file do chính mình tải lên.
-- Viewer: chỉ đọc. Tài khoản inactive: không truy cập.
-- ============================================================

create or replace function public.app3_is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.app3_user_roles ur
        where ur.user_id = auth.uid()
          and ur.active = true
          and ur.role in ('admin', 'teacher', 'viewer')
    );
$$;

create or replace function public.app3_can_manage_file(
    p_uploaded_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select
        public.app3_is_admin()
        or exists (
            select 1
            from public.app3_user_roles ur
            where ur.user_id = auth.uid()
              and ur.active = true
              and ur.role = 'teacher'
              and p_uploaded_by = auth.uid()
        );
$$;

revoke all on function public.app3_is_active_user() from public;
revoke all on function public.app3_can_manage_file(uuid) from public;
grant execute on function public.app3_is_active_user() to authenticated;
grant execute on function public.app3_can_manage_file(uuid) to authenticated;

alter table public.app3_files enable row level security;

drop policy if exists "Allow authenticated full access on app3_files" on public.app3_files;
drop policy if exists "Files read by active users" on public.app3_files;
drop policy if exists "Files insert by admin or teacher" on public.app3_files;
drop policy if exists "Files update by owner or admin" on public.app3_files;
drop policy if exists "Files delete by owner or admin" on public.app3_files;

create policy "Files read by active users"
on public.app3_files
for select to authenticated
using (public.app3_is_active_user());

create policy "Files insert by admin or teacher"
on public.app3_files
for insert to authenticated
with check (
    uploaded_by = auth.uid()
    and (
        public.app3_is_admin()
        or exists (
            select 1
            from public.app3_user_roles ur
            where ur.user_id = auth.uid()
              and ur.active = true
              and ur.role = 'teacher'
        )
    )
);

create policy "Files update by owner or admin"
on public.app3_files
for update to authenticated
using (public.app3_can_manage_file(uploaded_by))
with check (public.app3_can_manage_file(uploaded_by));

create policy "Files delete by owner or admin"
on public.app3_files
for delete to authenticated
using (public.app3_can_manage_file(uploaded_by));

grant select, insert, update, delete on public.app3_files to authenticated;
revoke insert, update, delete on public.app3_files from anon;

notify pgrst, 'reload schema';

-- ============================================================
-- [P] BƯỚC 131.3 - RLS CHO app3_settings
-- Đã kiểm thử thực tế Bước 131.4-131.7 ngày 2026-09-02.
-- Active Admin/Teacher/Viewer: được đọc cấu hình.
-- Chỉ Admin: INSERT / UPDATE / DELETE.
-- ============================================================

alter table public.app3_settings enable row level security;

drop policy if exists "Allow authenticated full access on app3_settings" on public.app3_settings;
drop policy if exists "Allow write settings" on public.app3_settings;
drop policy if exists "Settings read by active users" on public.app3_settings;
drop policy if exists "Settings insert by admin" on public.app3_settings;
drop policy if exists "Settings update by admin" on public.app3_settings;
drop policy if exists "Settings delete by admin" on public.app3_settings;

create policy "Settings read by active users"
on public.app3_settings
for select to authenticated
using (public.app3_is_active_user());

create policy "Settings insert by admin"
on public.app3_settings
for insert to authenticated
with check (public.app3_is_admin());

create policy "Settings update by admin"
on public.app3_settings
for update to authenticated
using (public.app3_is_admin())
with check (public.app3_is_admin());

create policy "Settings delete by admin"
on public.app3_settings
for delete to authenticated
using (public.app3_is_admin());

grant select, insert, update, delete on public.app3_settings to authenticated;
revoke insert, update, delete on public.app3_settings from anon;

notify pgrst, 'reload schema';

-- ============================================================
-- [Q] BƯỚC 132.2 - RLS CHO app3_subjects
-- Đã kiểm thử thực tế Bước 132.3-132.5 ngày 2026-09-02.
-- Active Admin/Teacher/Viewer: được đọc danh mục môn học.
-- Chỉ Admin: INSERT / UPDATE / DELETE.
-- ============================================================

alter table public.app3_subjects enable row level security;

drop policy if exists "Allow read app3_subjects" on public.app3_subjects;
drop policy if exists "Authenticated can update app3_subjects" on public.app3_subjects;
drop policy if exists "Subjects read by active users" on public.app3_subjects;
drop policy if exists "Subjects insert by admin" on public.app3_subjects;
drop policy if exists "Subjects update by admin" on public.app3_subjects;
drop policy if exists "Subjects delete by admin" on public.app3_subjects;

create policy "Subjects read by active users"
on public.app3_subjects
for select to authenticated
using (public.app3_is_active_user());

create policy "Subjects insert by admin"
on public.app3_subjects
for insert to authenticated
with check (public.app3_is_admin());

create policy "Subjects update by admin"
on public.app3_subjects
for update to authenticated
using (public.app3_is_admin())
with check (public.app3_is_admin());

create policy "Subjects delete by admin"
on public.app3_subjects
for delete to authenticated
using (public.app3_is_admin());

grant select, insert, update, delete on public.app3_subjects to authenticated;
revoke select, insert, update, delete on public.app3_subjects from anon;

notify pgrst, 'reload schema';

-- ============================================================
-- [R] BƯỚC 133.4 - RLS CHO app3_profiles
-- Bảng hiện không được frontend sử dụng.
-- Chỉ Admin được SELECT / INSERT / UPDATE / DELETE.
-- ============================================================

alter table public.app3_profiles enable row level security;

drop policy if exists "Allow authenticated full access on app3_profiles" on public.app3_profiles;
drop policy if exists "Profiles read by admin" on public.app3_profiles;
drop policy if exists "Profiles insert by admin" on public.app3_profiles;
drop policy if exists "Profiles update by admin" on public.app3_profiles;
drop policy if exists "Profiles delete by admin" on public.app3_profiles;

create policy "Profiles read by admin"
on public.app3_profiles
for select
to authenticated
using (public.app3_is_admin());

create policy "Profiles insert by admin"
on public.app3_profiles
for insert
to authenticated
with check (public.app3_is_admin());

create policy "Profiles update by admin"
on public.app3_profiles
for update
to authenticated
using (public.app3_is_admin())
with check (public.app3_is_admin());

create policy "Profiles delete by admin"
on public.app3_profiles
for delete
to authenticated
using (public.app3_is_admin());

grant select, insert, update, delete on public.app3_profiles to authenticated;
revoke select, insert, update, delete on public.app3_profiles from anon;

-- ============================================================
-- [S] BƯỚC 134-135 - HARDENING GRANT TOÀN BỘ app3_*
-- Đồng bộ cấu hình quyền đã kiểm chứng trên database.
-- Mục tiêu:
--   1) anon không có quyền trực tiếp trên các bảng app3_*.
--   2) authenticated không giữ REFERENCES / TRIGGER / TRUNCATE.
--   3) app3_user_roles chỉ cần SELECT / UPDATE ở cấp GRANT;
--      RLS tiếp tục quyết định người dùng nào được đọc/cập nhật.
-- Lưu ý: khối này không thay đổi dữ liệu và không thay đổi policy RLS.
-- ============================================================

-- Thu hồi toàn bộ quyền trực tiếp của anon trên đúng các bảng app3_*.
do $$
declare
    r record;
begin
    for r in
        select schemaname, tablename
        from pg_tables
        where schemaname = 'public'
          and tablename like 'app3\_%' escape '\'
    loop
        execute format(
            'revoke all privileges on table %I.%I from anon',
            r.schemaname,
            r.tablename
        );
    end loop;
end
$$;

-- authenticated chỉ cần CRUD thông thường; RLS kiểm soát phạm vi bản ghi.
-- Thu hồi các quyền PostgreSQL không cần cho frontend/PostgREST.
do $$
declare
    r record;
begin
    for r in
        select schemaname, tablename
        from pg_tables
        where schemaname = 'public'
          and tablename like 'app3\_%' escape '\'
    loop
        execute format(
            'revoke references, trigger, truncate on table %I.%I from authenticated',
            r.schemaname,
            r.tablename
        );
    end loop;
end
$$;

-- app3_user_roles không có luồng tạo role trực tiếp từ client.
-- Chỉ giữ SELECT / UPDATE ở cấp GRANT; policy RLS vẫn giới hạn quyền thực tế.
revoke insert, delete on public.app3_user_roles from authenticated;
grant select, update on public.app3_user_roles to authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- [T] BƯỚC 145 - TIN TỨC / THÔNG BÁO / TÀI LIỆU WEBSITE CÔNG KHAI
-- Public chỉ đọc nội dung đã công khai; Admin quản trị CRUD.
-- ============================================================
create table if not exists public.app3_public_posts (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    category text default 'TIN TỨC',
    summary text,
    is_published boolean not null default true,
    published_at timestamptz default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.app3_public_documents (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    category text default 'TÀI LIỆU',
    description text,
    file_url text,
    is_published boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.app3_public_posts enable row level security;
alter table public.app3_public_documents enable row level security;

drop policy if exists "Public read published posts" on public.app3_public_posts;
drop policy if exists "Admin insert posts" on public.app3_public_posts;
drop policy if exists "Admin update posts" on public.app3_public_posts;
drop policy if exists "Admin delete posts" on public.app3_public_posts;
create policy "Public read published posts" on public.app3_public_posts for select to anon, authenticated using (is_published = true or public.app3_is_admin());
create policy "Admin insert posts" on public.app3_public_posts for insert to authenticated with check (public.app3_is_admin());
create policy "Admin update posts" on public.app3_public_posts for update to authenticated using (public.app3_is_admin()) with check (public.app3_is_admin());
create policy "Admin delete posts" on public.app3_public_posts for delete to authenticated using (public.app3_is_admin());

drop policy if exists "Public read published documents" on public.app3_public_documents;
drop policy if exists "Admin insert documents" on public.app3_public_documents;
drop policy if exists "Admin update documents" on public.app3_public_documents;
drop policy if exists "Admin delete documents" on public.app3_public_documents;
create policy "Public read published documents" on public.app3_public_documents for select to anon, authenticated using (is_published = true or public.app3_is_admin());
create policy "Admin insert documents" on public.app3_public_documents for insert to authenticated with check (public.app3_is_admin());
create policy "Admin update documents" on public.app3_public_documents for update to authenticated using (public.app3_is_admin()) with check (public.app3_is_admin());
create policy "Admin delete documents" on public.app3_public_documents for delete to authenticated using (public.app3_is_admin());

grant select on public.app3_public_posts, public.app3_public_documents to anon;
grant select, insert, update, delete on public.app3_public_posts, public.app3_public_documents to authenticated;
revoke references, trigger, truncate on public.app3_public_posts, public.app3_public_documents from anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- [U] BƯỚC 147 - TIN TỨC CHUYÊN NGHIỆP
-- Bổ sung nội dung đầy đủ và ảnh đại diện cho bài viết.
-- Không thay đổi RLS/policy hiện có của app3_public_posts.
-- ============================================================
alter table public.app3_public_posts
    add column if not exists content text;

alter table public.app3_public_posts
    add column if not exists image_url text;

notify pgrst, 'reload schema';

-- ============================================================
-- [V] BƯỚC 147.3 - ẢNH ĐẠI DIỆN TIN TỨC TRÊN SUPABASE STORAGE
-- Bucket công khai để website hiển thị ảnh; chỉ Admin được upload/sửa/xóa.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'app3-public-post-images',
    'app3-public-post-images',
    true,
    5242880,
    array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read app3 post images" on storage.objects;
drop policy if exists "Admin insert app3 post images" on storage.objects;
drop policy if exists "Admin update app3 post images" on storage.objects;
drop policy if exists "Admin delete app3 post images" on storage.objects;

create policy "Public read app3 post images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'app3-public-post-images');

create policy "Admin insert app3 post images"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'app3-public-post-images'
    and public.app3_is_admin()
);

create policy "Admin update app3 post images"
on storage.objects for update
to authenticated
using (
    bucket_id = 'app3-public-post-images'
    and public.app3_is_admin()
)
with check (
    bucket_id = 'app3-public-post-images'
    and public.app3_is_admin()
);

create policy "Admin delete app3 post images"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'app3-public-post-images'
    and public.app3_is_admin()
);

-- ============================================================
-- [W] BƯỚC 148 - DANH SÁCH HỌC SINH + CẤU TRÚC ĐIỂM THEO FILE MẪU VNEDU
-- CẢNH BÁO: chạy một lần bằng Admin; khối này xóa dữ liệu học sinh/điểm cũ.
-- Nguồn dữ liệu: 5 file .xls người dùng cung cấp ngày 04/09/2026.
-- ============================================================
begin;
alter table public.app3_scores add column if not exists xep_loai_cuoi_ky_1 text;
alter table public.app3_scores add column if not exists xep_loai_cuoi_ky_2 text;
alter table public.app3_scores add column if not exists cuoi_ky_2_sau_thi_lai numeric;
alter table public.app3_scores add column if not exists xep_loai_cuoi_ky_2_sau_thi_lai text;
alter table public.app3_scores add column if not exists nhan_xet_gk1 text;
alter table public.app3_scores add column if not exists nhan_xet_ck1 text;
alter table public.app3_scores add column if not exists nhan_xet_gk2 text;
alter table public.app3_scores add column if not exists nhan_xet_ck2 text;

insert into public.app3_classes (name,grade,class_code,teacher)
select v.name,v.grade,v.class_code,v.teacher from (values
('3A1','3','L3A1','Võ Thanh Đậm'),
('3A2','3','L3A2','Võ Thanh Đậm'),
('3B1','3','L3B1','Võ Thanh Đậm'),
('3B2','3','L3B2','Võ Thanh Đậm'),
('3C','3','L3C','Võ Thanh Đậm'),
('4A1','4','L4A1','Võ Thanh Đậm'),
('4A2','4','L4A2','Võ Thanh Đậm'),
('4B','4','L4B','Võ Thanh Đậm'),
('4C','4','L4C','Võ Thanh Đậm'),
('5A1','5','L5A1','Võ Thanh Đậm'),
('5A2','5','L5A2','Võ Thanh Đậm'),
('5B','5','L5B','Võ Thanh Đậm'),
('5C','5','L5C','Võ Thanh Đậm')
) v(name,grade,class_code,teacher)
where not exists(select 1 from public.app3_classes c where c.name=v.name);

delete from public.app3_attendance;
delete from public.app3_rewards;
delete from public.app3_disciplines;
delete from public.app3_learning_comments;
delete from public.app3_scores;
delete from public.app3_students;

with src as (
 select * from jsonb_to_recordset('[{"cls": "3C", "grade": "3", "code": "2513481781", "name": "Đinh Thiên Kim", "dob": "2018-12-08", "gender": "Nữ"}, {"cls": "3C", "grade": "3", "code": "2513481821", "name": "Đoàn Trần Gia Quyên", "dob": "2018-06-28", "gender": "Nữ"}, {"cls": "3C", "grade": "3", "code": "2513481841", "name": "Hồ Trâm Anh", "dob": "2018-05-23", "gender": "Nữ"}, {"cls": "3C", "grade": "3", "code": "2513481861", "name": "Lâm Hoàng Lộc", "dob": "2018-06-17", "gender": "Nam"}, {"cls": "3C", "grade": "3", "code": "2513481881", "name": "Lê Quốc Anh", "dob": "2018-04-14", "gender": "Nam"}, {"cls": "3C", "grade": "3", "code": "2513481901", "name": "Lê Trần Tuyết Nhi", "dob": "2018-11-02", "gender": "Nữ"}, {"cls": "3C", "grade": "3", "code": "2513481921", "name": "Nguyễn Bảo Lâm", "dob": "2018-05-01", "gender": "Nam"}, {"cls": "3C", "grade": "3", "code": "2513481941", "name": "Nguyễn Huỳnh Phương", "dob": "2018-05-10", "gender": "Nữ"}, {"cls": "3C", "grade": "3", "code": "2513481961", "name": "Nguyễn Lê Ngọc Hân", "dob": "2018-06-02", "gender": "Nữ"}, {"cls": "3C", "grade": "3", "code": "2513481981", "name": "Trần Thanh Ảo", "dob": "2018-05-29", "gender": "Nam"}, {"cls": "3C", "grade": "3", "code": "2513482021", "name": "Lương Nguyễn Tuyết Như", "dob": "2017-02-10", "gender": "Nữ"}, {"cls": "3C", "grade": "3", "code": "2513482041", "name": "Nguyễn Ngọc Tiền", "dob": "2017-06-06", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513513981", "name": "Nguyễn Thị Cà Rốt", "dob": "2018-01-02", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514001", "name": "Danh Như Ngọc", "dob": "2018-03-29", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514021", "name": "Hồ Ngọc Gia Hân", "dob": "2018-10-10", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514041", "name": "Huỳnh Tấn Thành", "dob": "2018-11-28", "gender": "Nam"}, {"cls": "3A2", "grade": "3", "code": "2513514061", "name": "Lê Huỳnh Bảo Khang", "dob": "2018-01-07", "gender": "Nam"}, {"cls": "3A2", "grade": "3", "code": "2513514081", "name": "Lê Huỳnh Bảo Thư", "dob": "2018-10-01", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514101", "name": "Lê Thanh Phong", "dob": "2018-06-23", "gender": "Nam"}, {"cls": "3A2", "grade": "3", "code": "2513514441", "name": "Lê Tấn Lực", "dob": "2016-05-30", "gender": "Nam"}, {"cls": "3A2", "grade": "3", "code": "2513514121", "name": "Lê Thị Bích Trâm", "dob": "2018-11-07", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514141", "name": "Lê Thị Diệp Chi", "dob": "2018-05-03", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514161", "name": "Lê Triệu Phát", "dob": "2018-11-29", "gender": "Nam"}, {"cls": "3A2", "grade": "3", "code": "2513514181", "name": "Nguyễn Đức Phúc", "dob": "2018-07-12", "gender": "Nam"}, {"cls": "3A2", "grade": "3", "code": "2513514201", "name": "Nguyễn Gia Khánh", "dob": "2018-08-29", "gender": "Nam"}, {"cls": "3A2", "grade": "3", "code": "2513514221", "name": "Nguyễn Khả Anh", "dob": "2018-08-16", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514241", "name": "Nguyễn Kim Anh", "dob": "2018-03-18", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514261", "name": "Nguyễn Ngọc Bảo Anh", "dob": "2018-03-29", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514281", "name": "Nguyễn Thị Mỹ Hảo", "dob": "2018-01-14", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514301", "name": "Nguyễn Trí Bình", "dob": "2018-09-18", "gender": "Nam"}, {"cls": "3A2", "grade": "3", "code": "2513514321", "name": "Phan Kiều Thanh Phương", "dob": "2018-11-11", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514341", "name": "Phan Trần Thảo Vy", "dob": "2018-10-04", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514361", "name": "Trần Cao Ngọc Minh", "dob": "2018-12-06", "gender": "Nữ"}, {"cls": "3A2", "grade": "3", "code": "2513514381", "name": "Trương Nguyễn Nhật Anh", "dob": "2018-03-07", "gender": "Nam"}, {"cls": "3A2", "grade": "3", "code": "2513514401", "name": "Võ Hồng Khôi", "dob": "2018-04-25", "gender": "Nam"}, {"cls": "3A2", "grade": "3", "code": "2513514421", "name": "Trần Thị Kim Anh", "dob": "2016-10-04", "gender": "Nữ"}, {"cls": "3A1", "grade": "3", "code": "2513498741", "name": "Cao Chi Quân", "dob": "2018-10-29", "gender": "Nam"}, {"cls": "3A1", "grade": "3", "code": "2513498761", "name": "Đào An Nhiên", "dob": "2018-09-05", "gender": "Nữ"}, {"cls": "3A1", "grade": "3", "code": "2513498781", "name": "Đoàn Minh Vy", "dob": "2018-03-06", "gender": "Nữ"}, {"cls": "3A1", "grade": "3", "code": "2513498801", "name": "Dương Thành Ân", "dob": "2018-06-22", "gender": "Nam"}, {"cls": "3A1", "grade": "3", "code": "2513498821", "name": "Lê Nguyên Phát", "dob": "2018-11-16", "gender": "Nam"}, {"cls": "3A1", "grade": "3", "code": "2513498841", "name": "Lê Thị Thúy Kiều", "dob": "2018-09-07", "gender": "Nữ"}, {"cls": "3A1", "grade": "3", "code": "2513498881", "name": "Lê Trương Thiên Ý", "dob": "2018-12-22", "gender": "Nữ"}, {"cls": "3A1", "grade": "3", "code": "2513498901", "name": "Nguyễn Đoàn Đông Hưng", "dob": "2018-04-13", "gender": "Nam"}, {"cls": "3A1", "grade": "3", "code": "2513498921", "name": "Nguyễn Hoàng Ái Nghi", "dob": "2018-11-27", "gender": "Nữ"}, {"cls": "3A1", "grade": "3", "code": "2513498941", "name": "Nguyễn Thành Quý", "dob": "2018-06-29", "gender": "Nam"}, {"cls": "3A1", "grade": "3", "code": "2513498961", "name": "Nguyễn Tuấn Kiệt", "dob": "2018-11-08", "gender": "Nam"}, {"cls": "3A1", "grade": "3", "code": "2513498981", "name": "Phạm Mỹ Huyền", "dob": "2018-05-20", "gender": "Nữ"}, {"cls": "3A1", "grade": "3", "code": "2513499001", "name": "Trần Bảo Anh", "dob": "2018-12-27", "gender": "Nam"}, {"cls": "3A1", "grade": "3", "code": "2513499021", "name": "Trần Lê Ánh Ngọc", "dob": "2018-04-19", "gender": "Nữ"}, {"cls": "3A1", "grade": "3", "code": "2513499041", "name": "Trần Lê Thiên Kim", "dob": "2018-02-11", "gender": "Nữ"}, {"cls": "3A1", "grade": "3", "code": "2513499061", "name": "Trịnh Tuấn Vĩ", "dob": "2018-06-14", "gender": "Nam"}, {"cls": "3A1", "grade": "3", "code": "2513499081", "name": "Võ Thị Cẩm Tiên", "dob": "2018-01-08", "gender": "Nữ"}, {"cls": "3A1", "grade": "3", "code": "2513499101", "name": "Nguyễn Bảo Nam", "dob": "2017-07-28", "gender": "Nam"}, {"cls": "3A1", "grade": "3", "code": "2513499121", "name": "Nguyễn Thái Nguyên", "dob": "2017-04-02", "gender": "Nam"}, {"cls": "3A1", "grade": "3", "code": "2513499141", "name": "Lê Bảo Huy", "dob": "2017-02-16", "gender": "Nam"}, {"cls": "3A1", "grade": "3", "code": "2513499181", "name": "Nguyễn Thị Bảo Trân", "dob": "2018-02-21", "gender": "Nữ"}, {"cls": "3A1", "grade": "3", "code": "2513499201", "name": "Lê Võ Thiên Ân", "dob": "2018-08-09", "gender": "Nam"}, {"cls": "3A1", "grade": "3", "code": "2518359161", "name": "Danh Hậu", "dob": "2017-08-25", "gender": "Nam"}, {"cls": "3B1", "grade": "3", "code": "2513616621", "name": "Huỳnh Đông Hạo", "dob": "2018-08-18", "gender": "Nam"}, {"cls": "3B1", "grade": "3", "code": "2513616641", "name": "Đặng Minh Thuận", "dob": "2018-10-10", "gender": "Nam"}, {"cls": "3B1", "grade": "3", "code": "2513616661", "name": "Đoàn Hạo Thiên", "dob": "2018-10-22", "gender": "Nam"}, {"cls": "3B1", "grade": "3", "code": "2513616681", "name": "Nguyễn Thị Kim Ngọc", "dob": "2018-01-25", "gender": "Nữ"}, {"cls": "3B1", "grade": "3", "code": "2513616701", "name": "Nguyễn Lâm Hải Yến", "dob": "2018-11-19", "gender": "Nữ"}, {"cls": "3B1", "grade": "3", "code": "2513616721", "name": "Trần Gia Khiêm", "dob": "2018-01-26", "gender": "Nam"}, {"cls": "3B1", "grade": "3", "code": "2513616741", "name": "Nguyễn Trần Thanh Trúc", "dob": "2018-04-12", "gender": "Nữ"}, {"cls": "3B1", "grade": "3", "code": "2513616761", "name": "Đặng Thị Ngọc Trinh", "dob": "2018-07-21", "gender": "Nữ"}, {"cls": "3B1", "grade": "3", "code": "2513616781", "name": "Hoàng Thị Tuyết Ngân", "dob": "2018-10-18", "gender": "Nữ"}, {"cls": "3B1", "grade": "3", "code": "2513616801", "name": "Nguyễn Trường Giang", "dob": "2018-04-06", "gender": "Nam"}, {"cls": "3B1", "grade": "3", "code": "2513616821", "name": "Nguyễn Đăng Khôi", "dob": "2018-04-24", "gender": "Nam"}, {"cls": "3B1", "grade": "3", "code": "2513616841", "name": "Lê Trần Chí Đình", "dob": "2018-12-15", "gender": "Nam"}, {"cls": "3B1", "grade": "3", "code": "2513616941", "name": "Nguyễn Thị Trâm Anh", "dob": "2017-12-16", "gender": "Nữ"}, {"cls": "3B1", "grade": "3", "code": "2513617001", "name": "Huỳnh Bảo An", "dob": "2017-07-05", "gender": "Nam"}, {"cls": "3B1", "grade": "3", "code": "2513616861", "name": "Hoàng Gia Cát", "dob": "2018-05-06", "gender": "Nữ"}, {"cls": "3B1", "grade": "3", "code": "2513616881", "name": "Dương Hồng Anh", "dob": "2018-06-14", "gender": "Nữ"}, {"cls": "3B1", "grade": "3", "code": "2513636821", "name": "Phạm Anh Thư", "dob": "2018-11-27", "gender": "Nữ"}, {"cls": "3B1", "grade": "3", "code": "2513631981", "name": "Nguyễn Thị Ngọc Quỳnh", "dob": "2018-10-22", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2513620941", "name": "Phan Huỳnh Quốc Pháp", "dob": "2018-01-06", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2513620961", "name": "Huỳnh Công Phát", "dob": "2018-08-18", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2513620981", "name": "Nguyễn Lâm Thái Hoà", "dob": "2018-02-09", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2513621001", "name": "Nguyễn Hữu Phước", "dob": "2018-06-18", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2513621021", "name": "Nguyễn Thanh Tỷ", "dob": "2018-11-15", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2513621041", "name": "Trần Minh Nhựt", "dob": "2018-09-01", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2513621061", "name": "Trần Đặng Thiên Di", "dob": "2018-04-12", "gender": "Nữ"}, {"cls": "3B2", "grade": "3", "code": "2513621301", "name": "Trần Thị Kim Ngọc", "dob": "2017-05-17", "gender": "Nữ"}, {"cls": "3B2", "grade": "3", "code": "2513621081", "name": "Nguyễn Nhất Huy", "dob": "2018-07-07", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2513621101", "name": "Trần Ngọc Kim Tiên", "dob": "2018-09-07", "gender": "Nữ"}, {"cls": "3B2", "grade": "3", "code": "2513621121", "name": "Đỗ Đặng Minh Khôi", "dob": "2018-03-07", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2513621141", "name": "Trương Trà My", "dob": "2018-05-11", "gender": "Nữ"}, {"cls": "3B2", "grade": "3", "code": "2513621161", "name": "Nguyễn Tôn Sơn", "dob": "2018-02-14", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2513621181", "name": "Võ Minh Anh Đức", "dob": "2018-01-24", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2513621201", "name": "Lê Thị Mai Hoa", "dob": "2018-04-17", "gender": "Nữ"}, {"cls": "3B2", "grade": "3", "code": "2513621221", "name": "Lê Ngọc Mẫn", "dob": "2018-01-01", "gender": "Nữ"}, {"cls": "3B2", "grade": "3", "code": "2513621241", "name": "Trần Trọng Tín", "dob": "2018-06-13", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2600923661", "name": "Trương Hoàng An", "dob": "2017-12-02", "gender": "Nam"}, {"cls": "3B2", "grade": "3", "code": "2513621261", "name": "Mai Ngọc Như Ý", "dob": "2018-07-31", "gender": "Nữ"}, {"cls": "3B2", "grade": "3", "code": "2513621321", "name": "Bùi Phi Hổ Em", "dob": "2017-09-08", "gender": "Nam"}, {"cls": "4C", "grade": "4", "code": "2514070281", "name": "Nguyễn Thị Thảo Nhi", "dob": "2017-08-05", "gender": "Nữ"}, {"cls": "4C", "grade": "4", "code": "2514070301", "name": "Phạm Kim Yến", "dob": "2017-04-06", "gender": "Nữ"}, {"cls": "4C", "grade": "4", "code": "2514070321", "name": "Võ Phương Nghi", "dob": "2017-05-02", "gender": "Nữ"}, {"cls": "4C", "grade": "4", "code": "2514070341", "name": "Trần Hạo Nam", "dob": "2017-12-10", "gender": "Nam"}, {"cls": "4C", "grade": "4", "code": "2514070361", "name": "Đoàn Trần Gia Thịnh", "dob": "2017-06-24", "gender": "Nam"}, {"cls": "4C", "grade": "4", "code": "2514070381", "name": "Đinh Nguyễn Minh Quân", "dob": "2017-03-13", "gender": "Nam"}, {"cls": "4C", "grade": "4", "code": "2514070401", "name": "Trần Thanh Mạnh", "dob": "2016-01-12", "gender": "Nam"}, {"cls": "4C", "grade": "4", "code": "2514070421", "name": "Nguyễn Ngọc Tiền", "dob": "2014-05-14", "gender": "Nữ"}, {"cls": "4A1", "grade": "4", "code": "2514070981", "name": "Lý Minh Nam Anh", "dob": "2017-06-17", "gender": "Nam"}, {"cls": "4A1", "grade": "4", "code": "2514071001", "name": "Trần Thiên Kim", "dob": "2017-09-18", "gender": "Nữ"}, {"cls": "4A1", "grade": "4", "code": "2514071021", "name": "Nguyễn Trường Giang", "dob": "2017-09-06", "gender": "Nam"}, {"cls": "4A1", "grade": "4", "code": "2514071041", "name": "Huỳnh Đoàn Đan Vy", "dob": "2017-07-19", "gender": "Nữ"}, {"cls": "4A1", "grade": "4", "code": "2514071061", "name": "Nguyễn Hữu Khánh", "dob": "2017-07-17", "gender": "Nam"}, {"cls": "4A1", "grade": "4", "code": "2514071081", "name": "Phan Ngọc Như Tiên", "dob": "2017-06-29", "gender": "Nữ"}, {"cls": "4A1", "grade": "4", "code": "2514071101", "name": "Phù Tiến Thịnh", "dob": "2017-02-12", "gender": "Nam"}, {"cls": "4A1", "grade": "4", "code": "2514071121", "name": "Đoàn Ngọc Tú Trâm", "dob": "2017-10-04", "gender": "Nữ"}, {"cls": "4A1", "grade": "4", "code": "2514071141", "name": "Trần Nguyễn Mỹ Phụng", "dob": "2017-05-26", "gender": "Nữ"}, {"cls": "4A1", "grade": "4", "code": "2514071161", "name": "Trương Thị Bảo Nghi", "dob": "2017-12-14", "gender": "Nữ"}, {"cls": "4A1", "grade": "4", "code": "2514071181", "name": "Huỳnh Ngân Tiến", "dob": "2017-05-15", "gender": "Nam"}, {"cls": "4A1", "grade": "4", "code": "2514071221", "name": "Nguyễn Chí Linh", "dob": "2016-04-02", "gender": "Nam"}, {"cls": "4A1", "grade": "4", "code": "2514071241", "name": "Cao Thái Sơn", "dob": "2016-01-12", "gender": "Nam"}, {"cls": "4A1", "grade": "4", "code": "2514071261", "name": "Nguyễn Hải Nam", "dob": "2015-12-25", "gender": "Nam"}, {"cls": "4A1", "grade": "4", "code": "2514071281", "name": "Ngô Ngọc Trâm", "dob": "2015-09-22", "gender": "Nữ"}, {"cls": "4A1", "grade": "4", "code": "2514071301", "name": "Nguyễn Quốc Thái", "dob": "2015-06-07", "gender": "Nam"}, {"cls": "4A1", "grade": "4", "code": "2514071321", "name": "Nguyễn Thị Ngọc Trâm", "dob": "2014-06-22", "gender": "Nữ"}, {"cls": "4A1", "grade": "4", "code": "2514071341", "name": "Lê Tấn Kết", "dob": "2014-11-27", "gender": "Nam"}, {"cls": "4A1", "grade": "4", "code": "2514071201", "name": "Trương Mỹ Nhã", "dob": "2017-11-14", "gender": "Nữ"}, {"cls": "4A1", "grade": "4", "code": "2514071361", "name": "Nguyễn Hoàng Nguyên", "dob": "2014-02-25", "gender": "Nam"}, {"cls": "4A2", "grade": "4", "code": "2514071661", "name": "Lê Ti Na", "dob": "2017-08-23", "gender": "Nữ"}, {"cls": "4A2", "grade": "4", "code": "2514071681", "name": "Phạm Trần Đăng Khôi", "dob": "2017-08-02", "gender": "Nam"}, {"cls": "4A2", "grade": "4", "code": "2514071701", "name": "Lê Trí Nhân", "dob": "2017-07-10", "gender": "Nam"}, {"cls": "4A2", "grade": "4", "code": "2514071721", "name": "Danh Hoàng Quân", "dob": "2017-02-24", "gender": "Nam"}, {"cls": "4A2", "grade": "4", "code": "2514071741", "name": "Lê Thị Băng Tâm", "dob": "2017-02-12", "gender": "Nữ"}, {"cls": "4A2", "grade": "4", "code": "2514071761", "name": "Nguyễn Lâm Thiên Duy", "dob": "2017-07-24", "gender": "Nam"}, {"cls": "4A2", "grade": "4", "code": "2514071801", "name": "Huỳnh Gia Cát Tường", "dob": "2017-07-18", "gender": "Nữ"}, {"cls": "4A2", "grade": "4", "code": "2514071821", "name": "Nguyễn Phạm Như Yến", "dob": "2017-12-11", "gender": "Nữ"}, {"cls": "4A2", "grade": "4", "code": "2514071841", "name": "Lê Đinh Tuyết Nhi", "dob": "2017-06-25", "gender": "Nữ"}, {"cls": "4A2", "grade": "4", "code": "2514071861", "name": "Mai Nhật Minh", "dob": "2017-02-11", "gender": "Nam"}, {"cls": "4A2", "grade": "4", "code": "2514071881", "name": "Cái Phượng Minh", "dob": "2017-09-25", "gender": "Nữ"}, {"cls": "4A2", "grade": "4", "code": "2514071901", "name": "Nguyễn Gia Huyền Anh", "dob": "2017-05-30", "gender": "Nữ"}, {"cls": "4A2", "grade": "4", "code": "2514071921", "name": "Nguyễn Tăng Tường Quy", "dob": "2017-07-21", "gender": "Nữ"}, {"cls": "4A2", "grade": "4", "code": "2514071941", "name": "Đặng Thành Khang", "dob": "2016-02-16", "gender": "Nam"}, {"cls": "4A2", "grade": "4", "code": "2514071961", "name": "Nguyễn Ngọc Hân", "dob": "2016-08-15", "gender": "Nữ"}, {"cls": "4A2", "grade": "4", "code": "2514071981", "name": "Trương Hoàng Long", "dob": "2015-04-29", "gender": "Nam"}, {"cls": "4A2", "grade": "4", "code": "2514072001", "name": "Lê Văn Toàn", "dob": "2014-12-02", "gender": "Nam"}, {"cls": "4A2", "grade": "4", "code": "2514072021", "name": "Tô Tuấn Chuyển", "dob": "2014-12-25", "gender": "Nam"}, {"cls": "4A2", "grade": "4", "code": "2514072041", "name": "Nguyễn Gia Kiệt", "dob": "2016-07-03", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604747581", "name": "Lê Minh Chiến", "dob": "2017-08-04", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604747601", "name": "Phạm Thảo My", "dob": "2017-01-11", "gender": "Nữ"}, {"cls": "4B", "grade": "4", "code": "2604747621", "name": "Nguyễn Minh Tiến", "dob": "2017-08-21", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604747641", "name": "Trần Phúc Thiên", "dob": "2017-09-20", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604747661", "name": "Hà Lâm Anh Thư", "dob": "2017-05-05", "gender": "Nữ"}, {"cls": "4B", "grade": "4", "code": "2604747681", "name": "Huỳnh Quốc Khánh", "dob": "2017-09-02", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604747701", "name": "Dương Thị Thu Thảo", "dob": "2016-12-18", "gender": "Nữ"}, {"cls": "4B", "grade": "4", "code": "2604747721", "name": "Lê Thị Ngọc Mỹ", "dob": "2016-12-24", "gender": "Nữ"}, {"cls": "4B", "grade": "4", "code": "2604747741", "name": "Trần Thị Kim Ngân", "dob": "2016-08-01", "gender": "Nữ"}, {"cls": "4B", "grade": "4", "code": "2604747761", "name": "Lê Minh Phi", "dob": "2016-01-15", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604747781", "name": "Đỗ Kim Lộc", "dob": "2016-03-08", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604747801", "name": "Trần Quốc Khang", "dob": "2016-01-08", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604747821", "name": "Trần Thị Liễu", "dob": "2015-11-19", "gender": "Nữ"}, {"cls": "4B", "grade": "4", "code": "2604747841", "name": "Võ Hoàng Anh Tú", "dob": "2016-01-08", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604747861", "name": "Lê Ngọc Trinh", "dob": "2017-10-24", "gender": "Nữ"}, {"cls": "4B", "grade": "4", "code": "2604747881", "name": "Nguyễn Huỳnh Thiên Khôi", "dob": "2017-10-14", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604747901", "name": "Nguyễn Ngọc Kim Anh", "dob": "2017-11-12", "gender": "Nữ"}, {"cls": "4B", "grade": "4", "code": "2604747921", "name": "Nguyễn Dương Kim Yến", "dob": "2017-12-22", "gender": "Nữ"}, {"cls": "4B", "grade": "4", "code": "2604747941", "name": "Nguyễn Thị Mai Linh", "dob": "2017-09-20", "gender": "Nữ"}, {"cls": "4B", "grade": "4", "code": "2604747961", "name": "Trần Tống Gia Khiêm", "dob": "2017-04-14", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604747981", "name": "Đỗ Tuấn Lộc", "dob": "2017-11-20", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604748001", "name": "Phạm Đại Nam", "dob": "2017-05-22", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604748021", "name": "Đặng Ngọc Tiên", "dob": "2017-11-24", "gender": "Nữ"}, {"cls": "4B", "grade": "4", "code": "2604748041", "name": "Chim Văn Hiền", "dob": "2017-07-03", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604748061", "name": "Huỳnh Ngọc Tuyền", "dob": "2016-12-25", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604748081", "name": "Huỳnh Quang Đặng", "dob": "2015-10-14", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604748101", "name": "Thạch Ngọc Trai", "dob": "2016-05-10", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604748121", "name": "Trần Ngọc Nguyên Khang", "dob": "2016-07-18", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604748141", "name": "Huỳnh Thanh Tùng", "dob": "2016-07-24", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604748161", "name": "Nguyễn Văn Hậu", "dob": "2017-03-09", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604748181", "name": "Nguyễn Anh Giang", "dob": "2017-02-15", "gender": "Nữ"}, {"cls": "4B", "grade": "4", "code": "2604748201", "name": "Nguyễn Trương Duy Anh", "dob": "2017-02-25", "gender": "Nam"}, {"cls": "4B", "grade": "4", "code": "2604748221", "name": "Trần Thị Kim Xuyến", "dob": "2016-09-18", "gender": "Nữ"}, {"cls": "5C", "grade": "5", "code": "2514174981", "name": "Phạm Đình Phú", "dob": "2016-07-02", "gender": "Nam"}, {"cls": "5C", "grade": "5", "code": "2514175001", "name": "Nguyễn Như Ngọc", "dob": "2016-05-18", "gender": "Nữ"}, {"cls": "5C", "grade": "5", "code": "2514175021", "name": "Bùi Ngọc Bích", "dob": "2016-08-22", "gender": "Nữ"}, {"cls": "5C", "grade": "5", "code": "2514175041", "name": "Trần Minh Hạo", "dob": "2016-02-22", "gender": "Nam"}, {"cls": "5C", "grade": "5", "code": "2514175061", "name": "Nguyễn Thị Thảo Vân", "dob": "2016-09-01", "gender": "Nữ"}, {"cls": "5C", "grade": "5", "code": "2514175081", "name": "Nguyễn Thị Tường Vy", "dob": "2016-06-28", "gender": "Nữ"}, {"cls": "5C", "grade": "5", "code": "2514175101", "name": "Bùi Bảo Thy", "dob": "2016-09-26", "gender": "Nữ"}, {"cls": "5C", "grade": "5", "code": "2514175121", "name": "Lê Thành Đạt", "dob": "2016-12-24", "gender": "Nam"}, {"cls": "5C", "grade": "5", "code": "2514175141", "name": "Trần Kiều Ân", "dob": "2016-04-27", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515058981", "name": "Đặng Hồ Hoàng Phát", "dob": "2016-03-06", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059001", "name": "Dương Bảo Tuyết Anh", "dob": "2016-10-27", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059021", "name": "Lê Thiện Hòa", "dob": "2016-12-09", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059041", "name": "Ngô Hoàng Mỹ", "dob": "2016-01-16", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059061", "name": "Nguyễn Bảo Ngọc", "dob": "2016-08-20", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059081", "name": "Nguyễn Đăng Dương", "dob": "2016-09-16", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059101", "name": "Nguyễn Mỹ Anh", "dob": "2016-05-26", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059121", "name": "Nguyễn Ngọc Định", "dob": "2016-07-08", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059141", "name": "Nguyễn Ngọc Khả Anh", "dob": "2016-10-31", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059161", "name": "Nguyễn Ngọc Khả Vy", "dob": "2016-03-25", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059181", "name": "Nguyễn Trọng Nhân", "dob": "2016-03-08", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059201", "name": "Phạm Thiên Phúc", "dob": "2016-03-22", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059221", "name": "Phan Gia Bảo", "dob": "2016-01-01", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059241", "name": "Tô Khả Vy", "dob": "2016-01-09", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059261", "name": "Trần Bảo Ngọc", "dob": "2016-04-23", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059281", "name": "Trần Lê Diễm Mai", "dob": "2016-03-16", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059301", "name": "Trần Quốc Chiến", "dob": "2016-04-21", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059321", "name": "Trần Quốc Thịnh", "dob": "2016-10-25", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059341", "name": "Văn Thế Phúc", "dob": "2016-08-08", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059361", "name": "Võ Kim Ngọc", "dob": "2016-01-15", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059381", "name": "Tô Ngọc Nhuận", "dob": "2015-11-27", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059401", "name": "Nguyễn Thị Kim Luyến", "dob": "2015-04-17", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059421", "name": "Nguyễn Trương Yến Ngân", "dob": "2015-05-24", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059441", "name": "Võ Thị Bích Trân", "dob": "2015-12-29", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059521", "name": "Nguyễn Thị Ngọc Tiền", "dob": "2012-01-09", "gender": "Nữ"}, {"cls": "5A1", "grade": "5", "code": "2515059461", "name": "Lê Hạo Minh", "dob": "2014-10-06", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059481", "name": "Trần Trường Vỹ", "dob": "2014-05-11", "gender": "Nam"}, {"cls": "5A1", "grade": "5", "code": "2515059501", "name": "Võ Văn Thắng", "dob": "2014-06-17", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515060961", "name": "Bùi Thị Bảo Anh", "dob": "2016-01-21", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515060981", "name": "Bùi Thị Tuệ Khương", "dob": "2016-04-23", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061001", "name": "Danh Thị Khánh Trân", "dob": "2016-09-07", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061021", "name": "Lâm Vân Anh", "dob": "2016-10-20", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061041", "name": "Lê Hoàng Huy", "dob": "2016-08-29", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061061", "name": "Lê Phương Thư", "dob": "2016-11-05", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061081", "name": "Lê Thị Bảo Hân", "dob": "2016-11-20", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061101", "name": "Lư Vũ Bảo Huynh", "dob": "2016-12-04", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061121", "name": "Ngô Thành Thái", "dob": "2016-12-26", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061141", "name": "Nguyễn Đức Huy", "dob": "2016-05-28", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061161", "name": "Nguyễn Lê Kim Ngân", "dob": "2016-12-06", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061181", "name": "Nguyễn Linh Băng", "dob": "2016-01-28", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061201", "name": "Nguyễn Minh Tuấn", "dob": "2016-10-27", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061221", "name": "Nguyễn Ngọc Phương Nghi", "dob": "2016-05-15", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061241", "name": "Nguyễn Ngọc Yến", "dob": "2016-06-05", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061261", "name": "Nguyễn Nguyên Gia Bảo", "dob": "2016-04-08", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061281", "name": "Nguyễn Thị Phú Quý", "dob": "2016-06-02", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061301", "name": "Nguyễn Trọng Thiên", "dob": "2016-12-02", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061321", "name": "Phan Thanh Quy", "dob": "2016-09-17", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061341", "name": "Thị Tú Trân", "dob": "2016-12-17", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061361", "name": "Trần Huỳnh Thảo My", "dob": "2016-06-02", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061381", "name": "Trần Nhật Minh Thư", "dob": "2016-03-19", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061401", "name": "Trần Quốc Huy", "dob": "2016-12-06", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061421", "name": "Trần Trúc Mai", "dob": "2016-12-22", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061441", "name": "Võ Anh Đạt", "dob": "2016-07-13", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061461", "name": "Vương Duy Bảo", "dob": "2016-12-23", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061501", "name": "Nguyễn Thanh Trúc", "dob": "2015-11-24", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061521", "name": "Huỳnh Lê Quốc Hào", "dob": "2015-10-26", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061541", "name": "Nguyễn Hoàng Tỷ", "dob": "2015-11-06", "gender": "Nam"}, {"cls": "5A2", "grade": "5", "code": "2515061561", "name": "Phạm Bùi Ngọc Hân", "dob": "2015-12-15", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061581", "name": "Trần Phú Mỹ", "dob": "2015-01-10", "gender": "Nữ"}, {"cls": "5A2", "grade": "5", "code": "2515061601", "name": "Trương Hải Bằng", "dob": "2015-03-28", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748261", "name": "Văn Phước Thịnh", "dob": "2016-02-17", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748281", "name": "Trần Đại Minh", "dob": "2016-10-27", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748301", "name": "Lê Trịnh Phi Long", "dob": "2016-04-14", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748321", "name": "Nguyễn Thị Kim Phượng", "dob": "2016-05-23", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748341", "name": "Nguyễn Minh Châu", "dob": "2016-07-09", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748361", "name": "Bùi Thị Yến Nhi", "dob": "2016-01-09", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748381", "name": "Lê Tuyết Liên", "dob": "2016-04-04", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748401", "name": "Phạm Minh Nhật", "dob": "2016-10-04", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748421", "name": "Trần Minh Thành", "dob": "2016-01-06", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748441", "name": "Nguyễn Thế Duy", "dob": "2016-01-26", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748461", "name": "Nguyễn Ngọc Bảo Trân", "dob": "2016-02-03", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748481", "name": "Nguyễn Lê Nhã Kỳ", "dob": "2016-02-15", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748501", "name": "Quách Ngọc Bích Tuyền", "dob": "2015-04-24", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748521", "name": "Trần Tấn Lộc", "dob": "2015-10-20", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748541", "name": "Cao Danh Thái", "dob": "2015-10-23", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748561", "name": "Đặng Minh Tâm", "dob": "2016-11-12", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748581", "name": "Danh Minh Phúc", "dob": "2016-01-30", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748601", "name": "Huỳnh Nguyễn Nhật Thanh", "dob": "2016-01-03", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748621", "name": "Lê Đình Phong", "dob": "2016-12-26", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748641", "name": "Lê Mỹ Kỳ", "dob": "2016-04-01", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748661", "name": "Trần Thị Tường Vy", "dob": "2016-08-02", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748681", "name": "Hoàng Nhật Minh", "dob": "2016-09-12", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748701", "name": "Dương Đức Thiên", "dob": "2015-07-09", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748721", "name": "Huỳnh Thanh Giàu", "dob": "2015-09-05", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748741", "name": "Lê Chí Tùng", "dob": "2015-07-14", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748761", "name": "Nguyễn Ngọc Sơn", "dob": "2015-09-04", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748781", "name": "Trần Văn Vũ", "dob": "2015-05-24", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748801", "name": "Lý Chí Hào", "dob": "2014-09-02", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748821", "name": "Lê Kim Hồng", "dob": "2014-10-20", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748841", "name": "Lê Nhứt Quy", "dob": "2013-12-19", "gender": "Nam"}, {"cls": "5B", "grade": "5", "code": "2604748861", "name": "Đoàn Ngọc Anh", "dob": "2012-11-21", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748881", "name": "Lê Thị Như Ngọc", "dob": "2016-08-21", "gender": "Nữ"}, {"cls": "5B", "grade": "5", "code": "2604748901", "name": "Trần Thị Yến Vy", "dob": "2015-10-20", "gender": "Nam"}]'::jsonb)
 as x(cls text,grade text,code text,name text,dob date,gender text)
)
insert into public.app3_students(student_code,full_name,dob,gender,class_id,grade,status)
select s.code,s.name,s.dob,s.gender,c.id,s.grade,'Đang học' from src s join public.app3_classes c on c.name=s.cls;
commit;
notify pgrst,'reload schema';

select c.name as lop,count(*) as so_hoc_sinh from public.app3_students s join public.app3_classes c on c.id=s.class_id group by c.name order by c.name;
select count(*) as tong_hoc_sinh from public.app3_students;
