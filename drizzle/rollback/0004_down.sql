DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM businesses WHERE suspended_at IS NOT NULL LIMIT 1) THEN
    RAISE EXCEPTION 'suspensions contain data; review and back up before reverting';
  END IF;
END $$;
ALTER TABLE businesses DROP COLUMN suspended_at;
