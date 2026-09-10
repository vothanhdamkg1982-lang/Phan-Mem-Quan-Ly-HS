# BƯỚC 151.1 - KHÓA FULL RESTORE CHỈ CHO ADMIN

Phạm vi thay đổi duy nhất: bảo vệ RPC `app3_full_restore_backup` ở tầng PostgreSQL.

- Admin đang hoạt động: vẫn được phép Full Restore.
- Teacher/Viewer: bị chặn trực tiếp trong hàm, kể cả khi gọi RPC thủ công.
- Không thay đổi giao diện.
- Không thay đổi VNEDU, Excel, Học sinh, Điểm, Banner, Vòng quay, Thống kê hay các module khác.

## Cập nhật Supabase
Chạy toàn bộ file `BUOC_151_1_KHOA_FULL_RESTORE_ADMIN.sql` trong Supabase SQL Editor.

Sau khi chạy SQL, đăng nhập bằng Admin và kiểm tra ứng dụng hoạt động bình thường. Không cần thực hiện Full Restore thật để thử nếu đang dùng dữ liệu thật.
