-- ============================================================
-- BƯỚC 151.1 - KHÓA FULL RESTORE CHỈ CHO ADMIN
-- Chạy toàn bộ khối này trong Supabase SQL Editor.
-- Có thể chạy lại an toàn.
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

    -- Chặn Teacher/Viewer ở tầng PostgreSQL, không phụ thuộc giao diện.
    if not public.app3_is_admin() then
        raise exception 'Chỉ tài khoản Admin mới được phép khôi phục toàn bộ dữ liệu.';
    end if;

    if p_confirmation is distinct from 'FULL_RESTORE' then
        raise exception 'Thiếu mã xác nhận FULL_RESTORE.';
    end if;
    if coalesce(p_backup->>'format','') <> 'QLHS_BACKUP_V1' then
        raise exception 'File backup không đúng định dạng QLHS_BACKUP_V1.';
    end if;
    v_tables := p_backup->'tables';
    if v_tables is null then raise exception 'Backup không có tables.'; end if;

    if not (v_tables ?& array[
        'app3_subjects','app3_classes','app3_students','app3_scores',
        'app3_attendance','app3_rewards','app3_disciplines',
        'app3_learning_comments','app3_files','app3_settings'
    ]) then
        raise exception 'Backup thiếu một hoặc nhiều bảng bắt buộc.';
    end if;

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

notify pgrst, 'reload schema';
