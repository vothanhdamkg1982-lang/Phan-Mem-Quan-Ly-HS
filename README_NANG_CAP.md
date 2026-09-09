# BƯỚC 150.4.12 – SỬA VÒNG QUAY ĐEN / KHÔNG HIỆN TÊN

- Sửa lỗi `ReferenceError: escapeHtml is not defined` trong `updateWheelFallback()`.
- Thêm `escapeWheelHtml()` độc lập cho nhãn tên học sinh trên bánh xe.
- Bọc cập nhật bánh xe dự phòng bằng `try/catch` để lỗi fallback không bao giờ chặn canvas chính trên máy tính.
- Giữ nguyên các chức năng và dữ liệu của bước 150.4.11.
- Tăng cache asset lên v150412.

Không cần chạy SQL.

# BƯỚC 150.4.11 – VÒNG QUAY MOBILE + TỐI ƯU TẢI DỮ LIỆU

- Giữ nguyên các sửa lỗi đến Bước 150.4.10.
- Mobile/iPhone: vòng quay dự phòng CSS hiển thị tên học sinh, dùng 2 từ cuối để dễ đọc.
- Canvas vẫn được ưu tiên; fallback chỉ lộ ra khi Safari không paint canvas.
- Tối ưu loadAllData: môn, lớp, học sinh, điểm, điểm danh, khen thưởng, kỷ luật, nhận xét, file và cài đặt được tải song song trong một lượt thay vì hai lượt nối tiếp.
- Giảm log danh sách 443 học sinh xuống chỉ còn số lượng để tránh DevTools làm chậm trình duyệt.
- Không thay đổi Supabase schema/RLS và không cần chạy SQL.
