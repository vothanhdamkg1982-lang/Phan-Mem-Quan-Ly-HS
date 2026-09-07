-- BƯỚC 149.7 - tăng giới hạn video lên 1 GB
update storage.buckets
set file_size_limit = 1073741824,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
where id = 'app3-public-media';

select id, name, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'app3-public-media';
