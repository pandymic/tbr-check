#!/usr/bin/env php
<?php

// Syncs the words table with var/words.tsv and recomputes every domain's derived
// columns (words, word_length, score, segmented, segments, kinds) and, for listed
// domains, their domain_words rows. Safe to re-run, e.g. after rebuilding the dictionary.

require __DIR__ . '/../lib/domains.php';

$config = include __DIR__ . '/../etc/config.php';

$db = new PDO( 'mysql:host=' . $config->db->host . ';dbname=' . $config->db->name, $config->db->user, $config->db->pass );
$db->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );

print "Backfilling date_auctioned…\n";
$db->exec( 'UPDATE domains d JOIN ( SELECT r2d.domains_id, MAX( r.date_released ) AS released FROM results_to_domains r2d JOIN results r ON r.id = r2d.results_id GROUP BY r2d.domains_id ) x ON x.domains_id = d.id SET d.date_auctioned = x.released WHERE NOT ( d.date_auctioned <=> x.released )' );

print "Syncing words…\n";
$wordIndex = tbr_load_words();
$db->beginTransaction();
$upsert = $db->prepare( 'INSERT INTO words (word, kind, zipf) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE kind = VALUES(kind), zipf = VALUES(zipf)' );
foreach ( $wordIndex as $word => $info ) $upsert->execute( [ $word, $info['kind'], $info['zipf'] ] );
$stale = array_diff_key( tbr_word_ids( $db ), $wordIndex );
foreach ( array_chunk( array_values( $stale ), 1000 ) as $ids ) {
  $db->exec( 'DELETE FROM words WHERE id IN (' . implode( ',', array_map( 'intval', $ids ) ) . ')' ); // cascades to domain_words
}
$db->commit();
$wordIds = tbr_word_ids( $db );
printf( "%d words (%d removed).\n", count( $wordIds ), count( $stale ) );

print "Backfilling domains…\n";
$selectStmt = $db->prepare( 'SELECT id, domain, listed, words, word_length, score, segmented, segments, kinds FROM domains WHERE id > :after ORDER BY id LIMIT 5000' );
$updateStmt = $db->prepare( 'UPDATE domains SET words = :words, word_length = :word_length, score = :score, segmented = :segmented, segments = :segments, kinds = :kinds WHERE id = :id' );
$after = 0;
$updated = 0;
$links = 0;
do {
  $selectStmt->bindValue( ':after', $after, PDO::PARAM_INT );
  $selectStmt->execute();
  $rows = $selectStmt->fetchAll( PDO::FETCH_OBJ );
  if ( !$rows ) break;

  $db->beginTransaction();
  $listedIds = [];
  $values = [];
  foreach ( $rows as $row ) {
    $f = tbr_domain_fields( $row->domain, $wordIndex );
    $new = [ $f->words, $f->word_length, $f->score, $f->segmented, $f->segments, $f->kinds ];
    $old = [ $row->words, $row->word_length, $row->score, $row->segmented, $row->segments, $row->kinds ];
    if ( array_map( 'strval', $new ) !== array_map( 'strval', $old ) ) {
      $updateStmt->execute( [ ':words' => $f->words, ':word_length' => $f->word_length, ':score' => $f->score, ':segmented' => $f->segmented, ':segments' => $f->segments, ':kinds' => $f->kinds, ':id' => $row->id ] );
      $updated++;
    }
    if ( $row->listed ) {
      $listedIds[] = (int)$row->id;
      foreach ( $f->matches as $word => $position ) {
        if ( isset( $wordIds[ $word ] ) ) $values[] = sprintf( '(%d,%d,%d)', $row->id, $wordIds[ $word ], $position );
      }
    }
    $after = $row->id;
  }
  // Rebuild this chunk's word links in bulk.
  $db->exec( "DELETE FROM domain_words WHERE domain_id > {$rows[0]->id} - 1 AND domain_id <= {$after}" );
  foreach ( array_chunk( $values, 2000 ) as $chunk ) {
    $db->exec( 'INSERT INTO domain_words (domain_id, word_id, position) VALUES ' . implode( ',', $chunk ) );
  }
  $links += count( $values );
  $db->commit();
} while ( true );

print "Updated {$updated} domains, {$links} word links.\n";
