# BƯỚC 151.7 – RÀ SOÁT PHÂN QUYỀN TEACHER / VIEWER / PHÂN CÔNG LỚP–MÔN

## Phạm vi
Bước này chỉ rà soát tĩnh mã nguồn và SQL. Không thay đổi logic ứng dụng, không chạy SQL, không thay đổi dữ liệu.

## Kết quả chính
- `app3_scores`: Admin toàn quyền; Teacher ghi theo `access_scope`; Viewer chỉ đọc theo `access_scope`; assigned kiểm tra đúng cặp học sinh/lớp + môn.
- `app3_students`: Admin đọc/ghi toàn bộ; Teacher/Viewer đọc theo phạm vi lớp; chỉ Admin được thêm/sửa/xóa hồ sơ học sinh.
- `app3_classes`: Admin ghi; Teacher/Viewer đọc theo phạm vi lớp.
- `app3_learning_comments`: quyền đọc/ghi theo cặp lớp + môn; Viewer không ghi.
- `app3_rewards`, `app3_disciplines`: quyền theo lớp + môn; Viewer chỉ đọc.
- `app3_attendance`: quyền ghi theo lớp; Viewer chỉ đọc.
- `app3_files`: Teacher thêm file và chỉ sửa/xóa file mình tải; Viewer chỉ đọc; Admin toàn quyền.
- `app3_settings`, `app3_subjects`, `app3_profiles`, nội dung website công khai: các thao tác ghi nhạy cảm bị giới hạn Admin ở RLS.
- `app3_teacher_assignments`: chỉ Admin thêm/sửa/xóa; người dùng chỉ đọc phân công của chính mình (Admin đọc tất cả).
- Full Restore đã được khóa thêm bằng `app3_is_admin()` ở Bước 151.1.

## Điểm cần xử lý tiếp theo
Trigger `public.app3_handle_new_user()` hiện tự tạo hồ sơ mới với:
- `role = 'teacher'`
- `active = true`

Nếu Supabase Auth cho phép đăng ký công khai, tài khoản mới có thể trở thành Teacher đang hoạt động ngay. Đề nghị BƯỚC 151.8 đổi mặc định tài khoản mới thành `viewer` + `active=false` (hoặc ít nhất `active=false`) và chỉ Admin kích hoạt/phân quyền.

## Ghi chú
Trong `loadCurrentUserAccess()`, nếu không có bản ghi role thì frontend fallback về `teacher`, nhưng RLS phía PostgreSQL vẫn cần bản ghi role active nên không tự mở quyền dữ liệu. Tuy vậy ở bước sau nên đổi fallback UI sang trạng thái an toàn hơn để tránh hiển thị gây hiểu nhầm.
