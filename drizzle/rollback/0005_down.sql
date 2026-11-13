DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM media_assets WHERE mime_type IS NOT NULL OR byte_size IS NOT NULL OR uploaded_by IS NOT NULL LIMIT 1) THEN
    RAISE EXCEPTION 'uploaded media metadata contains data; back up and review before reverting';
  END IF;
END $$;
ALTER TABLE media_assets DROP CONSTRAINT media_assets_byte_size_chk;
DROP INDEX media_assets_storage_key_uq;
ALTER TABLE media_assets DROP CONSTRAINT media_assets_uploaded_by_user_id_fk;
ALTER TABLE media_assets DROP COLUMN uploaded_by;
ALTER TABLE media_assets DROP COLUMN byte_size;
ALTER TABLE media_assets DROP COLUMN mime_type;
