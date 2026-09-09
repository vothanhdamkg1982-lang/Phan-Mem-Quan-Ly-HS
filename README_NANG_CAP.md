# BƯỚC 150.4.11 – VÒNG QUAY MOBILE + TỐI ƯU TẢI DỮ LIỆU

- Giữ nguyên các sửa lỗi đến Bước 150.4.10.
- Mobile/iPhone: vòng quay dự phòng CSS hiển thị tên học sinh, dùng 2 từ cuối để dễ đọc.
- Canvas vẫn được ưu tiên; fallback chỉ lộ ra khi Safari không paint canvas.
- Tối ưu loadAllData: môn, lớp, học sinh, điểm, điểm danh, khen thưởng, kỷ luật, nhận xét, file và cài đặt được tải song song trong một lượt thay vì hai lượt nối tiếp.
- Giảm log danh sách 443 học sinh xuống chỉ còn số lượng để tránh DevTools làm chậm trình duyệt.
- Không thay đổi Supabase schema/RLS và không cần chạy SQL.
