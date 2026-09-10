# BƯỚC 151.2 - ĐO THỜI GIAN TỪNG TRUY VẤN LOAD

Mục tiêu: xác định chính xác bảng Supabase nào làm chậm quá trình vào hệ thống.

Thay đổi:
- Chỉ thêm log `[LOAD QUERY]` cho 10 truy vấn trong `loadAllData()`.
- Không thay đổi câu truy vấn, dữ liệu, quyền, UI hoặc logic nghiệp vụ.
- Đổi cache version của script.js sang `v=1512` để trình duyệt nạp đúng mã mới.

Cách kiểm tra:
1. Mở app và đăng nhập.
2. Mở DevTools > Console.
3. Tìm các dòng bắt đầu bằng `[LOAD QUERY]`.
4. Chụp ảnh các dòng đó cùng dòng `Tổng thời gian loadAllData`.

Không cần chạy SQL.
