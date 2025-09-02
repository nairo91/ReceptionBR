BEGIN;
ALTER TABLE bulle_media DROP CONSTRAINT bulle_media_type_check;
ALTER TABLE bulle_media
  ADD CONSTRAINT bulle_media_type_check
  CHECK (type IN ('photo','video','levee_photo'));
COMMIT;
