-- Server-side filtering for the domain listing. Needs ALTER/CREATE, so run as
-- an admin user (the app user only has DML):
--
--   mysql -u root -p internal_tbr < api/migrations/001_listing.sql
--   php bin/backfill.php
--
-- Rollback:
--   ALTER TABLE domains DROP INDEX listed, DROP INDEX listed_default, DROP INDEX listed_added,
--     DROP INDEX listed_tbr, DROP INDEX listed_domain, DROP INDEX listed_flag,
--     DROP INDEX listed_word_length, DROP COLUMN listed, DROP COLUMN words,
--     DROP COLUMN word_length, DROP COLUMN date_auctioned;

CREATE TABLE domains_backup_20261030 LIKE domains;
INSERT INTO domains_backup_20261030 SELECT * FROM domains;

ALTER TABLE domains
  ADD COLUMN words TEXT NULL AFTER flag,
  ADD COLUMN word_length TINYINT UNSIGNED NULL AFTER words,
  ADD COLUMN date_auctioned DATETIME NULL AFTER date_removed,
  -- The client only lists short, dash- and digit-free names; a stored flag lets every listing query lead with an index.
  ADD COLUMN listed TINYINT(1) AS ( has_dashes = 0 AND has_numbers = 0 AND domain_length < 13 ) STORED,
  ADD INDEX listed (listed),
  ADD INDEX listed_default (listed, date_removed, date_added DESC, date_tbr, domain),
  ADD INDEX listed_added (listed, date_added),
  ADD INDEX listed_tbr (listed, date_tbr),
  ADD INDEX listed_domain (listed, domain),
  ADD INDEX listed_flag (listed, flag),
  ADD INDEX listed_word_length (listed, word_length);
