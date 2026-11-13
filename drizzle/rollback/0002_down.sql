DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM categories WHERE parent_id IS NOT NULL LIMIT 1) THEN
    RAISE EXCEPTION 'subcategories contain data; review and back up before reverting';
  END IF;
END $$;
ALTER TABLE categories DROP CONSTRAINT categories_not_self_chk;
DROP INDEX categories_parent_idx;
ALTER TABLE categories DROP CONSTRAINT categories_parent_id_categories_id_fk;
ALTER TABLE categories DROP COLUMN parent_id;
