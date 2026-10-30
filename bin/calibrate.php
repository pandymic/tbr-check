#!/usr/bin/env php
<?php

// Prints auction rates of released, listed domains by name length, word count
// and word frequency: the source for the odds table in tbr_auction_odds().

require __DIR__ . '/../lib/domains.php';

$config = include __DIR__ . '/../etc/config.php';
$db = new PDO( 'mysql:host=' . $config->db->host . ';dbname=' . $config->db->name, $config->db->user, $config->db->pass );
$wordIndex = tbr_load_words();

$cells = [];
foreach ( $db->query( 'SELECT domain_length - 3, segments, date_auctioned IS NOT NULL FROM domains WHERE listed = 1 AND date_removed IS NOT NULL', PDO::FETCH_NUM ) as [ $length, $segments, $sold ] ) {
  $pieces = explode( '|', (string)$segments );
  $words = array_filter( $pieces, function( $p ) { return '' !== $p && '~' !== $p[0]; } );
  $parts = count( $words ) === count( $pieces ) ? min( count( $words ), 3 ) : 0;
  $zipf = $parts ? min( array_map( function( $w ) use ( $wordIndex ) { return $wordIndex[ $w ]['zipf'] ?? 0; }, $words ) ) : null;
  $band = null === $zipf ? '-' : ( $zipf >= 5 ? 'zipf 5+' : ( $zipf >= 4 ? 'zipf 4-5' : 'zipf <4' ) );
  $key = sprintf( 'length %d, %s, %s', $length, $parts ? "{$parts} word(s)" : 'not all words', $band );
  $cells[ $key ][0] = ( $cells[ $key ][0] ?? 0 ) + 1;
  $cells[ $key ][1] = ( $cells[ $key ][1] ?? 0 ) + $sold;
}
ksort( $cells, SORT_NATURAL );
foreach ( $cells as $key => [ $n, $sold ] ) {
  if ( $n >= 30 ) printf( "%-40s %7d released %6.1f%% auctioned\n", $key, $n, 100 * $sold / $n );
}
