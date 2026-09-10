# BƯỚC 151.3 – ĐO DUNG LƯỢNG ẢNH HỌC SINH

Mục tiêu: xác định chính xác avatar_url có phải nguyên nhân làm app3_students tải khoảng 20 giây hay không.

Thay đổi duy nhất:
- Thêm log `[STUDENT AVATAR PAYLOAD]` sau khi truy vấn app3_students hoàn tất.
- Báo tổng dung lượng chuỗi avatar_url gần đúng theo MiB.
- Báo số ảnh base64, URL và ảnh trống.
- Không thay đổi dữ liệu, không thay đổi cách hiển thị ảnh, không thay đổi Supabase.

Không cần chạy SQL.
