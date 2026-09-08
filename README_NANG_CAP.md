# BƯỚC 149.10 – GIAO DIỆN CHỐT CỔNG THÔNG TIN + NỘI DUNG + HỌC SINH

- Trang công khai được hoàn thiện theo bố cục đã duyệt: menu trái, banner lớn trung tâm, tiện ích/thông báo/liên kết bên phải.
- Module Nội dung website được tách khỏi Cài đặt và dùng giao diện quản trị chuyên nghiệp riêng.
- Module Học sinh được nâng cấp thành bố cục danh sách + bảng cập nhật bên phải, giữ nguyên lớp/bộ lọc sau khi lưu.
- Thêm nút **Lưu & sang học sinh kế tiếp** để cập nhật liên tục theo lớp.
- Sửa xóa ảnh học sinh: khi chọn Xóa ảnh và lưu, `avatar_url` được đặt NULL trong Supabase.
- Không thay đổi cấu trúc database và không cần chạy SQL mới.
