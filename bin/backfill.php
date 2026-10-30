#!/usr/bin/env php
<?php

// Fills the derived columns added by api/migrations/001_listing.sql. Safe to
// re-run, e.g. after editing the dictionary.

require __DIR__ . '/../lib/domains.php';

$config = include __DIR__ . '/../etc/config.php';

$db = new PDO( 'mysql:host=' . $config->db->host . ';dbname=' . $config->db->name, $config->db->user, $config->db->pass );
$db->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );

print "Backfilling date_auctioned…\n";
$db->exec( 'UPDATE domains d JOIN ( SELECT r2d.domains_id, MAX( r.date_released ) AS released FROM results_to_domains r2d JOIN results r ON r.id = r2d.results_id GROUP BY r2d.domains_id ) x ON x.domains_id = d.id SET d.date_auctioned = x.released WHERE NOT ( d.date_auctioned <=> x.released )' );

print "Backfilling words…\n";
$wordIndex = tbr_load_words( $config->words );
$selectStmt = $db->prepare( 'SELECT id, domain, words FROM domains WHERE id > :after ORDER BY id LIMIT 5000' );
$updateStmt = $db->prepare( 'UPDATE domains SET words = :words, word_length = :word_length WHERE id = :id' );
$after = 0;
$updated = 0;
do {
  $selectStmt->bindValue( ':after', $after, PDO::PARAM_INT );
  $selectStmt->execute();
  $rows = $selectStmt->fetchAll( PDO::FETCH_OBJ );
  $db->beginTransaction();
  foreach ( $rows as $row ) {
    $fields = tbr_domain_fields( $row->domain, $wordIndex );
    if ( $fields->words !== $row->words ) {
      $updateStmt->execute( [ ':words' => $fields->words, ':word_length' => $fields->word_length, ':id' => $row->id ] );
      $updated++;
    }
    $after = $row->id;
  }
  $db->commit();
} while ( count( $rows ) );

print "Updated words on {$updated} rows.\n";
