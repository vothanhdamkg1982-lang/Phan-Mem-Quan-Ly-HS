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


## BƯỚC 148.5.8 - SỬA NĂM HỌC TRANG CHỦ
- Cố định hiển thị Năm học 2026-2027 trên website công khai.
- Không để localStorage cũ (2025-2026) ghi đè năm học mới.
- Đồng bộ localStorage về tên trường Lại Sơn và năm học 2026-2027.
- Thêm version query cho script để hạn chế trình duyệt dùng JavaScript cache cũ.

## Bước 148.5.9 - Banner động và logo Lại Sơn
- Thay logo cũ bằng `assets/logo-lai-son.png` ở website, đăng nhập và footer.
- Thêm `assets/banner-lai-son.png` làm banner hình ảnh.
- Banner có chuyển động nhẹ: nổi, zoom chậm và hiệu ứng ánh sáng quét; không dùng nội dung "Lễ khai giảng" để có thể dùng lâu dài.
- Không thay đổi dữ liệu, điểm, VNEDU, phân quyền hoặc SQL.


## Bước 148.5.10
- Bỏ hoàn toàn hai nút mũi tên và cụm chấm điều hướng banner ở hero.
- Mở rộng banner chính chiếm xấp xỉ 2/3 chiều ngang hero trên desktop; phần nội dung trái xấp xỉ 1/3.
- Thay banner hero bằng phiên bản khổ rộng mới.
- Không thay đổi dữ liệu, Supabase, VNEDU, phân quyền hay nghiệp vụ quản lý.

## Bước 149.1 - Website công khai
- Mở rộng menu công khai: Hình ảnh, Video, Liên kết.
- Thêm giao diện thư viện ảnh và video công khai (chưa cần đăng nhập).
- Thêm liên kết ngoài VNEDU và Bộ GD&ĐT, mở tab mới an toàn.
- Sửa tên trường cũ còn sót ở khối liên hệ.
- Không thay đổi dữ liệu, Supabase RLS hay các chức năng quản lý học sinh.

## Bước 149.2 - Bố cục chữ U ngược (∩)
- Thanh đầu trang + menu dọc trái + tiện ích dọc phải tạo khung chữ U ngược quanh banner.
- Tỷ lệ desktop xấp xỉ 18% - 64% - 18%.
- Hai cột bên chỉ tồn tại trong khu vực banner; các phần nội dung bên dưới vẫn toàn chiều rộng.
- Mobile tự chuyển thành banner trước, menu/tiện ích phía dưới để không ép hẹp nội dung.
- Không thay đổi Supabase, dữ liệu học sinh, điểm, VNEDU, RLS hoặc phân quyền.

## BƯỚC 149.3 – GIỮ NGUYÊN LỚP/BỘ LỌC KHI THAO TÁC HỌC SINH
- Khi đang lọc một lớp (ví dụ 4B), sau khi sửa thông tin hoặc thay ảnh và bấm Cập nhật, danh sách quay lại đúng lớp 4B.
- Giữ nguyên ô tìm kiếm, khối, giới tính và trang phân trang đang làm việc.
- Áp dụng cả khi thêm, sửa, thay ảnh, xóa một học sinh hoặc xóa nhiều học sinh.
- Không thay đổi database, RLS, điểm, VNEDU hay phân quyền.


## BƯỚC 149.5 - ẢNH / VIDEO / YOUTUBE CÔNG KHAI

- Thêm bảng `app3_public_media` và bucket Storage `app3-public-media`.
- Người xem website không cần đăng nhập vẫn xem được ảnh/video đã công khai.
- Admin vào **Cài đặt > Nội dung website công khai > Hình ảnh & Video** để thêm/sửa/xóa/ẩn hiện.
- Hỗ trợ ảnh JPG/PNG/WebP/GIF tối đa 10 MB.
- Hỗ trợ video MP4/WebM/MOV tối đa 120 MB hoặc URL video trực tiếp.
- Hỗ trợ link YouTube dạng watch, youtu.be, shorts hoặc embed.
- Đã đưa 6 ảnh hoạt động người dùng cung cấp vào `assets/gallery` làm ảnh mẫu ban đầu.
- Tin tức/Thông báo và Tài liệu tiếp tục dùng module hiện có.

### Việc thủ công duy nhất
Chạy toàn bộ file `BUOC_149_5_SUPABASE.sql` một lần trong **Supabase > SQL Editor**, sau đó triển khai lại website.


## BƯỚC 149.7
- Nâng giới hạn video phía app lên 1 GB và hiển thị dung lượng thực nếu vượt giới hạn.
- Video lớn tiếp tục dùng resumable upload.
- YouTube hiển thị ảnh bìa thumbnail (maxresdefault, fallback hqdefault) thay vì iframe trực tiếp để tránh khung 'This video is unavailable'.
- Bấm ảnh bìa hoặc nút để mở video trên YouTube.

## BƯỚC 149.8 - THÔNG BÁO + LIÊN KẾT WEBSITE ĐỘNG
- Thêm bảng `app3_public_announcements` và `app3_public_links` với RLS: khách chỉ đọc nội dung đã công khai, Admin mới được thêm/sửa/xóa.
- Cột phải của bố cục U ngược hiển thị tối đa 3 thông báo mới và 3 liên kết nhanh.
- Khu `Liên kết hữu ích` giữa trang lấy dữ liệu động từ Supabase thay vì viết cứng trong HTML.
- Admin quản lý tại `Cài đặt > Nội dung website công khai > Thông báo` và `Liên kết website`.
- Thông báo hỗ trợ ghim, ẩn/hiện, thứ tự và URL chi tiết tùy chọn.
- Liên kết hỗ trợ biểu tượng, mô tả, thứ tự, ẩn/hiện; URL chỉ chấp nhận HTTP/HTTPS.
- Nếu chưa chạy SQL 149.8, website vẫn dùng 2 liên kết dự phòng VNEDU và Bộ GD&ĐT để không làm hỏng trang công khai.
- Chạy `BUOC_149_8_THONG_BAO_LIEN_KET.sql` đúng 1 lần trong Supabase SQL Editor.
