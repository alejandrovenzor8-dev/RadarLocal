DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM rate_limit LIMIT 1) THEN
    RAISE EXCEPTION 'rate_limit contains data; make a backup and use a reviewed recovery plan';
  END IF;
END $$;
DROP TABLE rate_limit;
