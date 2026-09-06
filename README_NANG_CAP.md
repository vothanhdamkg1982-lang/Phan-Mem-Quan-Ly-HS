# BƯỚC 148.5.2 - ĐỒNG BỘ VNEDU "CÁC MÔN TÔI DẠY"

Bản này được xây dựng lại từ các file Excel gốc xuất trực tiếp từ VNEDU do người dùng cung cấp.

## Thay đổi chính
- Giữ chức năng Xuất/Nhập VNEDU cho một lớp.
- Thêm **Xuất các môn tôi dạy**: tạo một workbook nhiều sheet theo đúng thứ tự/cặp môn-lớp của file VNEDU mẫu hiện tại (20 sheet).
- Thêm **Nhập các môn tôi dạy**: đọc tất cả sheet, nhận diện lớp/môn/học kỳ/giai đoạn từ mã kỹ thuật tại B6 và học sinh từ cột Mã học sinh.
- File xuất không còn sheet `_VNEDU_META`.
- Cấu trúc mỗi sheet bám theo file gốc: B6 hiển thị mã kỹ thuật; C7:D7 merge Họ và tên; GK1/GK2 dùng cột F; CK1 dùng F:G; CK2 dùng F:I.
- Tên sheet theo mẫu `THVCN(N...)` cho Công nghệ và `THVCN(H...)` cho Tin học.
- Khi nhập nhiều sheet, hệ thống kiểm tra mã lớp, mã học sinh, môn và giai đoạn trước khi ghi; dòng hoàn toàn trống không ghi đè dữ liệu cũ.
- Có hộp xác nhận tổng số sheet và dòng dữ liệu trước khi ghi Supabase.

## Cấu trúc VNEDU đã xác nhận
- Công nghệ: mã môn `107`.
- Tin học: mã môn `113`.
- GK1: `-1-gk1-<năm>`.
- CK1: `-1-ck1-<năm>`.
- GK2: `-2-gk2-<năm>`.
- CK2: `-2-ck2-<năm>`.

## Cơ sở dữ liệu
Không cần chạy SQL mới cho bước này.

## BƯỚC 148.5.3 - SỐ MÔN/LỚP VNEDU ĐỘNG THEO PHÂN CÔNG
- Không cố định số sheet cho tài khoản có phân công môn-lớp.
- Ưu tiên `APP_STATE.currentUserAssignments` cho mọi vai trò, kể cả admin nếu admin có phân công riêng.
- Thêm/bớt phân công => lần xuất sau tự thêm/bớt sheet, không sửa code.
- Chỉ xuất các môn đã có mã VNEDU xác nhận từ file gốc; hiện Tin học=113, Công nghệ=107. Không tự đoán mã môn khác.
- Với tài khoản `assigned` chưa có phân công hợp lệ, không tự xuất ngoài phạm vi.
- Admin chưa có phân công cá nhân vẫn dùng hồ sơ 20 sheet đã học từ file VNEDU gốc để giữ tương thích ngược; khi có assignment thì tự chuyển sang danh sách động.

## BƯỚC 148.5.4 - HIỂN THỊ NGAY DỮ LIỆU SAU KHI NHẬP "CÁC MÔN TÔI DẠY"
- Phân biệt rõ file đúng mẫu nhưng hoàn toàn chưa có điểm/nhận xét: không báo nhập thành công giả.
- Sau khi ghi Supabase, tự chuyển giao diện sang đúng môn - lớp - giai đoạn của sheet đầu tiên có dữ liệu.
- Toast sau nhập cho biết số dòng thực sự ghi và vị trí đang được mở để kiểm tra.
- Không thay đổi database/RLS, không cần chạy SQL.


## Bước 148.5.5 - Lọc đúng môn đang chọn khi Xuất các môn tôi dạy
- Sửa lỗi chọn Tin học nhưng workbook có thể lấy các sheet Công nghệ từ danh sách phân công/fallback.
- Nút Xuất các môn tôi dạy trên trang Điểm giờ tôn trọng môn đang chọn: Tin học chỉ xuất mã 113; Công nghệ chỉ xuất mã 107.
- Số sheet vẫn động theo các lớp được phân công cho môn đó.
- Không thay đổi database/RLS.

## BƯỚC 148.5.6 - ĐỦ 13 MÔN VNEDU
- Mở rộng ánh xạ mã VNEDU đã xác minh từ file gốc cho đủ 13 môn.
- Admin có thể chọn/xuất/nhập VNEDU cho: Tiếng Việt 50, Toán 51, Khoa học 52, Lịch sử và Địa lí 53, Đạo đức 56, Tự nhiên và Xã hội 57, Âm nhạc 58, Mĩ thuật 59, Giáo dục thể chất 97, Hoạt động trải nghiệm 98, Công nghệ 107, Ngoại ngữ 1 110, Tin học 113.
- Parser mã kỹ thuật B6 nhận đủ 13 mã môn, nên Nhập VNEDU/ Nhập các môn tôi dạy có thể nhận diện đúng môn.
- Xuất các môn tôi dạy tiếp tục lọc theo môn đang chọn và phân công lớp động.
- Không cần SQL mới.


## BƯỚC 148.5.7 - CẤU HÌNH TẠM ĐỂ SỬ DỤNG NĂM HỌC 2026-2027
- Tên trường: Trường Tiểu học-Trung học cơ sở & Trung học phổ thông Lại Sơn.
- Năm học: 2026-2027.
- Không thay đổi cơ sở dữ liệu, phân quyền, dữ liệu học sinh hay chức năng VNEDU.
