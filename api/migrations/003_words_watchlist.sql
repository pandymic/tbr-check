-- Relational dictionary, quality score, watchlist, saved searches and alerts.
-- Run as admin, then backfill:
--
--   mysql -u root -p internal_tbr < api/migrations/003_words_watchlist.sql
--   php bin/backfill.php
--
-- Rollback:
--   DROP TABLE alerts, saved_searches, domain_words, words;
--   ALTER TABLE results_to_domains DROP FOREIGN KEY r2d_results, DROP FOREIGN KEY r2d_domains, DROP PRIMARY KEY;
--   ALTER TABLE domains DROP INDEX listed_filter, DROP INDEX listed_score,
--     DROP COLUMN score, DROP COLUMN segmented, DROP COLUMN segments, DROP COLUMN kinds,
--     DROP COLUMN note, DROP COLUMN max_bid,
--     ADD INDEX listed_filter (listed, flag, domain_length, word_length, date_tbr, date_added, date_removed, date_auctioned, domain),
--     ADD INDEX listed_flag (listed, flag), ADD INDEX listed_word_length (listed, word_length),
--     ADD INDEX domain (domain), ADD INDEX flag (flag), ADD INDEX domain_length (domain_length),
--     ADD INDEX has_dashes (has_dashes), ADD INDEX has_numbers (has_numbers);

-- Dictionary (loaded from var/words.tsv by bin/backfill.php).
CREATE TABLE words (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  word VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind ENUM('common','fr','place','name','tech') NOT NULL,
  zipf DECIMAL(3,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY word (word)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which words each listed domain contains, and where.
CREATE TABLE domain_words (
  domain_id INT UNSIGNED NOT NULL,
  word_id INT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (domain_id, word_id),
  KEY word_domain (word_id, domain_id),
  CONSTRAINT dw_domain FOREIGN KEY (domain_id) REFERENCES domains (id) ON DELETE CASCADE,
  CONSTRAINT dw_word FOREIGN KEY (word_id) REFERENCES words (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE saved_searches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  query VARCHAR(2000) NOT NULL,
  alert TINYINT(1) NOT NULL DEFAULT 0,
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE alerts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  type ENUM('status','match') NOT NULL,
  domain_id INT UNSIGNED NULL,
  search_id INT UNSIGNED NULL,
  message VARCHAR(255) NOT NULL,
  seen TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY seen_created (seen, created),
  CONSTRAINT alerts_domain FOREIGN KEY (domain_id) REFERENCES domains (id) ON DELETE CASCADE,
  CONSTRAINT alerts_search FOREIGN KEY (search_id) REFERENCES saved_searches (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Link table had no key; it has no duplicates or orphans, so this is safe.
ALTER TABLE results_to_domains
  ADD PRIMARY KEY (results_id, domains_id),
  ADD CONSTRAINT r2d_results FOREIGN KEY (results_id) REFERENCES results (id) ON DELETE CASCADE,
  ADD CONSTRAINT r2d_domains FOREIGN KEY (domains_id) REFERENCES domains (id) ON DELETE CASCADE;

ALTER TABLE domains
  ADD COLUMN note TEXT NULL AFTER flag,
  ADD COLUMN max_bid INT UNSIGNED NULL AFTER note,
  ADD COLUMN score TINYINT UNSIGNED NULL AFTER word_length,
  ADD COLUMN segmented TINYINT(1) NOT NULL DEFAULT 0 AFTER score,
  ADD COLUMN segments VARCHAR(255) NULL AFTER segmented,
  ADD COLUMN kinds SET('common','fr','place','name','tech') NOT NULL DEFAULT '' AFTER segments,
  -- Rebuilt with the new filter columns; same name, so running code keeps working.
  DROP INDEX listed_filter,
  ADD INDEX listed_filter (listed, flag, domain_length, word_length, score, segmented, kinds, date_tbr, date_added, date_removed, date_auctioned, domain),
  ADD INDEX listed_score (listed, score),
  -- Superseded by listed_filter / the unique (domain, date_tbr) key.
  DROP INDEX listed_flag,
  DROP INDEX listed_word_length,
  DROP INDEX domain,
  DROP INDEX flag,
  DROP INDEX domain_length,
  DROP INDEX has_dashes,
  DROP INDEX has_numbers;
