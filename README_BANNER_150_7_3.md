# BƯỚC 150.7.3 – Banner đồng bộ tỷ lệ + thông điệp chạy

- Phát triển trực tiếp từ Bước 150.7.2.
- Chỉ chỉnh khu vực công khai: header, logo, banner và thanh thông điệp.
- Không thay đổi logic các module quản lý học sinh, điểm, VNEDU, thống kê, vòng quay, phân quyền.
- Bộ banner mới dùng ảnh riêng trong `assets/banners/`, không lấy ảnh từ Thư viện ảnh/Supabase.
- Banner chuẩn cùng tỷ lệ 1964:801; ảnh WebP đã nén để giảm thời gian tải.
- Logo giao diện công khai dùng `assets/logo-phan-hieu-tran-quoc-toan.png`, đồng bộ với logo trên banner.
- Thanh `THÔNG ĐIỆP NHÀ TRƯỜNG` nằm ngay dưới banner, có đúng chiều rộng bằng banner và chữ chạy từ phải sang trái.
- Không cần chạy SQL.
