# BƯỚC 150.4.1 – Bổ sung lớp 1, lớp 2 và học sinh

Nguồn dữ liệu: 8 file danh sách học sinh VNEDU người dùng cung cấp ngày 08/09/2026.

## Dữ liệu bổ sung
- 1A1: 23 học sinh
- 1A2: 28 học sinh
- 1B: 24 học sinh
- 1C: 10 học sinh
- 2A1: 24 học sinh
- 2A2: 26 học sinh
- 2B: 22 học sinh
- 2C: 7 học sinh
- Tổng: 164 học sinh

## Cách cập nhật Supabase
Chạy file `BUOC_150_4_1_BO_SUNG_LOP_1_2.sql` bằng SQL Editor.
SQL chỉ bổ sung/cập nhật 8 lớp mới theo mã học sinh, không xóa dữ liệu lớp 3–5 và không xóa điểm hiện có.

## Excel / VNEDU
- Nhập danh sách VNEDU đã được sửa để nhận cả mẫu danh sách đầy đủ có các cột `Mã học sinh`, `Họ và tên`, `Ngày sinh`, `Giới tính`.
- Xuất/Nhập Excel của module Học sinh tiếp tục hoạt động với mọi lớp.
- Đã xác minh mã lớp VNEDU từ file mẫu sẵn có cho 1A1 và 2A1.
- Với lớp mới chưa có mã kỹ thuật VNEDU trong nguồn (1A2, 1B, 1C, 2A2, 2B, 2C), ứng dụng có thể học mã lớp tự động khi đọc một file điểm VNEDU của lớp đó; mã được ghi nhớ trên trình duyệt và dùng cho lần xuất tiếp theo. Không tự đoán mã VNEDU.


## Bước 150.4.2
- Sửa lỗi Unicode/NUL trong SQL lớp 2A1.
- Làm sạch bản ghi Nguyễn Cao Phương Nghi để SQL chạy được trên PostgreSQL.
- Không thay đổi dữ liệu cũ; không thay đổi chức năng web.

BƯỚC 150.4.3: SQL lớp 1-2 đã sửa cú pháp, bắt đầu bằng begin; và dùng PostgreSQL dollar-quoted JSON.


## BƯỚC 150.4.4 – LỚP 1-2 + EXCEL/VNEDU
- 8 lớp mới 1A1, 1A2, 1B, 1C, 2A1, 2A2, 2B, 2C tham gia luồng Excel chung.
- Bộ chọn lớp trên trang Điểm được lọc theo khối áp dụng của từng môn.
- VNEDU giữ đủ 13 mã môn đã xác minh.
- 1A1 và 2A1 giữ mã lớp VNEDU đã biết.
- Các lớp mới chưa có prefix VNEDU sẽ tự học prefix khi nhập một file điểm VNEDU gốc của chính lớp đó và ghi nhớ trong trình duyệt. Không tự đoán prefix.
- Không cần chạy SQL mới cho bước này.

## BƯỚC 150.4.5 - SỬA XUẤT DANH SÁCH THEO BỘ LỌC
- Sửa nút Xuất danh sách để dùng đúng danh sách đang lọc trên màn hình (khối/lớp/tìm kiếm/giới tính).
- Chọn lớp 1A1 sẽ chỉ xuất học sinh lớp 1A1, không còn xuất toàn bộ hệ thống.
- Tên file ưu tiên tên lớp, ví dụ Danh_sach_hoc_sinh_lop_1A1_YYYY-MM-DD.xlsx.
- Bỏ cụm nút phụ Tất cả/Nam/Nữ vì trùng với bộ lọc Giới tính phía trên.
- Bỏ hai select phụ Tất cả học sinh/Tất cả lớp ở footer vì trùng bộ lọc chính và dễ gây nhầm.
- Không thay đổi dữ liệu Supabase, VNEDU, nhập Excel, phân quyền hay các module khác.


## Bước 150.4.6 – Học mã VNEDU từ file chưa có điểm
- Xác nhận mã VNEDU lớp 1A2 từ file gốc: `5004661241`.
- File VNEDU hợp lệ nhưng chưa có điểm/nhận xét vẫn được dùng để học mã lớp.
- Không ghi đè điểm khi toàn bộ dòng dữ liệu đang trống.
- Sau khi học mã, có thể Xuất VNEDU lớp ngay.
