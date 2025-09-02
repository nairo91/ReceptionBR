BEGIN;
ALTER TABLE bulles
  ADD COLUMN levee_fait_par INTEGER NULL,
  ADD COLUMN levee_fait_le TIMESTAMP NULL,
  ADD COLUMN levee_commentaire TEXT NULL;

-- allow levee photos in bulle_media
ALTER TABLE bulle_media DROP CONSTRAINT IF EXISTS bulle_media_type_check;
ALTER TABLE bulle_media
  ADD CONSTRAINT bulle_media_type_check CHECK (type IN ('photo','video','levee_photo'));
COMMIT;
