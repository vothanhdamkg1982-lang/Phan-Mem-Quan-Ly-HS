# BƯỚC 151.6 - DỌN MÃ CHẨN ĐOÁN TẠM THỜI

- Giữ nguyên cơ chế lazy-load avatar của Bước 151.5.
- Gỡ helper đo thời gian từng truy vấn `[LOAD QUERY]` và log tổng thời gian dùng trong các bước chẩn đoán.
- Không thay đổi cấu trúc dữ liệu, Supabase, VNEDU, Excel, phân quyền, Vòng quay hay các module khác.
- Không cần chạy SQL.
- Cache version của script.js được tăng từ 1515 lên 1516.
