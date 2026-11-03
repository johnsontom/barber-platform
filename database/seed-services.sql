
INSERT INTO services
  (salon_id, name, description, price, duration_minutes)
SELECT
  s.id,
  sample.name,
  sample.description,
  sample.price,
  sample.duration_minutes
FROM salons s
CROSS JOIN (
  SELECT
    'Fade haircut' AS name,
    'A clean fade haircut.' AS description,
    22.00 AS price,
    40 AS duration_minutes
  UNION ALL
  SELECT
    'Beard trim',
    'A tidy beard trim and shape.',
    12.00,
    20
  UNION ALL
  SELECT
    'Classic haircut',
    'A classic haircut and finish.',
    18.00,
    30
) AS sample
WHERE NOT EXISTS (
  SELECT 1
  FROM services existing
  WHERE existing.salon_id = s.id
    AND existing.name = sample.name
);
