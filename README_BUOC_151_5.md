# BƯỚC 151.5 - TẢI ẢNH HỌC SINH THEO NHU CẦU

Mục tiêu: giảm thời gian vào hệ thống bằng cách không tải toàn bộ `avatar_url` base64 của 443 học sinh trong `loadAllData()`.

Thay đổi:
- Truy vấn `app3_students` ban đầu không lấy `avatar_url`.
- Trang Học sinh chỉ tải ảnh của 10 học sinh đang hiển thị.
- Xem chi tiết, sửa, tải ảnh, in hồ sơ và Vòng quay tự tải ảnh đúng học sinh khi cần.
- Có bộ nhớ đệm trong `APP_STATE`, ảnh đã tải sẽ không bị tải lại trong cùng phiên.
- Trước khi cập nhật học sinh, app bảo đảm đã lấy ảnh gốc để tránh ghi đè ảnh cũ.
- Không thay đổi dữ liệu Supabase, không cần chạy SQL.

Không thay đổi VNEDU, Excel, Banner, phân quyền, Điểm, Điểm danh, Thống kê và các module khác.
