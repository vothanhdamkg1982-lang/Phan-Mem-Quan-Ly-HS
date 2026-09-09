BƯỚC 150.7 - BANNER CHỦ ĐỀ ĐỘC LẬP

- Phát triển từ bản 150.6.2, chỉ chỉnh phần banner công khai.
- 7 banner tĩnh nằm trong assets/banners/.
- Banner đầu tiên: chủ đề ảnh thật nhà trường đã dựng lại.
- 6 banner tiếp theo: Mái trường hạnh phúc, Tri thức ngày mai, Ươm mầm tương lai, Yêu thương đồng hành, Sáng tạo hội nhập, Chuyển đổi số.
- Mỗi banner có hiệu ứng chuyển động riêng.
- Không lấy ảnh từ app3_public_media / Thư viện ảnh để đẩy lên banner.
- setupPublicHero giữ nguyên tên hàm để không ảnh hưởng luồng tải website, nhưng bỏ phụ thuộc images truyền vào.
- Không thay đổi Supabase, VNEDU, học sinh, thống kê, vòng quay hay các module quản lý khác.
