UPDATE "products"
SET "can_split_into_boosters"=true,"updated_at"=now()
WHERE "is_loose_booster"=false
  AND (
    lower("name" || ' ' || COALESCE("description",'')) LIKE '%booster box%'
    OR (lower("name" || ' ' || COALESCE("description",'')) LIKE '%display%' AND lower("name" || ' ' || COALESCE("description",'')) LIKE '%booster%')
    OR lower("name" || ' ' || COALESCE("description",'')) LIKE '%triple pack%'
    OR lower("name" || ' ' || COALESCE("description",'')) LIKE '%elite trainer box%'
    OR (lower("name" || ' ' || COALESCE("description",'')) LIKE '%bundle%' AND lower("name" || ' ' || COALESCE("description",'')) LIKE '%booster%')
  );
