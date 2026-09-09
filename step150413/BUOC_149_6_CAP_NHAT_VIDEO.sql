-- BƯỚC 149.6 - tăng giới hạn bucket media lên 200 MB
update storage.buckets
set public = true,
    file_size_limit = 209715200,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
where id = 'app3-public-media';
