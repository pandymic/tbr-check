-- Covering index for the listing filters, so COUNT(*) and filtered/sorted page
-- lookups are answered from the index without reading table rows. Run as admin:
--
--   mysql -u root -p internal_tbr < api/migrations/002_filter_index.sql
--
-- Rollback:
--   ALTER TABLE domains DROP INDEX listed_filter;

ALTER TABLE domains
  ADD INDEX listed_filter (listed, flag, domain_length, word_length, date_tbr, date_added, date_removed, date_auctioned, domain);
