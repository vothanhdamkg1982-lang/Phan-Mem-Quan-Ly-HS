# BƯỚC 151.4 – CHẨN ĐOÁN TRUY VẤN STUDENTS

Mục tiêu: xác định chính xác nguyên nhân truy vấn `app3_students` chậm.

Bước này chỉ thêm các truy vấn SELECT chẩn đoán chạy nền, không ghi dữ liệu và không thay đổi APP_STATE.

Console sẽ có các dòng:

- `[STUDENT DIAG] A - chỉ id`
- `[STUDENT DIAG] B - không avatar + có JOIN lớp`
- `[STUDENT DIAG] C - đầy đủ có avatar, không JOIN lớp`
- So sánh với `[LOAD QUERY] app3_students` (truy vấn hiện tại: đầy đủ + avatar + JOIN lớp).

Không cần chạy SQL.
