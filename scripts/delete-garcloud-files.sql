-- ============================================
-- Delete all GarCloud files from database
-- ============================================

-- 1. Delete all chunks associated with GarCloud files
DELETE FROM network_chunks
WHERE file_id IN (
  SELECT id FROM network_files
  WHERE drive_id IN (
    SELECT id FROM network_drives
    WHERE name = 'GarCloud'
  )
);

-- 2. Delete all files from GarCloud drive
DELETE FROM network_files
WHERE drive_id IN (
  SELECT id FROM network_drives
  WHERE name = 'GarCloud'
);

-- 3. Verify deletion
SELECT 
  nd.name AS drive_name,
  COUNT(nf.id) AS file_count,
  COUNT(nc.id) AS chunk_count
FROM network_drives nd
LEFT JOIN network_files nf ON nf.drive_id = nd.id
LEFT JOIN network_chunks nc ON nc.file_id = nf.id
WHERE nd.name = 'GarCloud'
GROUP BY nd.name;

-- Expected result: file_count = 0, chunk_count = 0

