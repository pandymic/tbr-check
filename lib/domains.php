<?php

// Shared helpers for the API, the update agent and the backfill script.

// Load the dictionary as a lookup of lowercase word => position in the file.
// Position is kept so ties in match length sort the same way the old
// per-request strpos() scan did.
function tbr_load_words( $path ) {
  $index = [];
  foreach ( preg_split( '/[\r\n]+/', file_get_contents( $path ) ) as $word ) {
    if ( strlen( trim( $word ) ) <= 2 ) continue;
    $word = strtolower( trim( $word ) );
    if ( !isset( $index[ $word ] ) ) $index[ $word ] = count( $index );
  }
  return $index;
}

// Every dictionary word contained in the domain name, longest first.
// Checks each substring against the lookup instead of every word against the
// name, so it costs O(name length²) rather than O(dictionary size).
function tbr_match_words( $domain, array $wordIndex ) {
  $name = trim( preg_replace( '/\.ca$/', '', trim( strtolower( $domain ) ) ) ); // Strip bullshit.
  $found = [];
  for ( $len = strlen( $name ); $len > 2; $len-- ) {
    for ( $i = 0; $i + $len <= strlen( $name ); $i++ ) {
      $sub = substr( $name, $i, $len );
      if ( isset( $wordIndex[ $sub ] ) ) $found[ $sub ] = $wordIndex[ $sub ];
    }
  }
  uksort( $found, function( $a, $b ) use ( $found ) {
    return ( strlen( $b ) - strlen( $a ) ) ?: ( $found[ $a ] - $found[ $b ] );
  } );
  return array_keys( $found );
}

// Derived columns stored alongside a domain name.
function tbr_domain_fields( $domain, array $wordIndex ) {
  $domain = strtolower( $domain );
  $words = tbr_match_words( $domain, $wordIndex );
  return (object)[
    'domain' => $domain,
    'domain_length' => strlen( $domain ),
    'has_dashes' => false !== strpos( $domain, '-' ) ? 1 : 0,
    'has_numbers' => 1 === preg_match( '/[\d]/', $domain ) ? 1 : 0,
    'words' => $words ? implode( ',', $words ) : null,
    'word_length' => $words ? strlen( $words[0] ) : null,
  ];
}

// Port of the client's length filter: tokens like "5", "5-" (or less) and
// "5+" (or more) are OR'd, except a "+" and "-" pair forms a range.
function tbr_length_matches( $length, array $filters ) {
  usort( $filters, function( $a, $b ) { return (int)$a - (int)$b; } );
  $hasMatch = false;
  foreach ( $filters as $f ) {
    $n = (int)$f;
    if ( ( false !== strpos( $f, '+' ) && $length >= $n ) || ( false !== strpos( $f, '-' ) && $length <= $n ) || $length === $n ) {
      $hasMatch = true;
      break;
    }
  }
  if ( $hasMatch ) {
    $plus = array_values( array_map( 'intval', array_filter( $filters, function( $f ) { return false !== strpos( $f, '+' ); } ) ) );
    $minus = array_values( array_map( 'intval', array_filter( $filters, function( $f ) { return false !== strpos( $f, '-' ); } ) ) );
    if ( $plus && $minus ) {
      $min = $plus[0];
      $max = $minus[ count( $minus ) - 1 ];
      if ( $min < $max && ( $length < $min || $length > $max ) ) $hasMatch = false;
    }
  }
  return $hasMatch;
}

// The lengths in [$from, $to] that satisfy a filter, for use in an IN () list.
function tbr_length_set( array $filters, $from, $to ) {
  $filters = array_values( array_filter( $filters, function( $f ) { return is_string( $f ) && preg_match( '/^\d+[+-]?$/', $f ); } ) );
  if ( !$filters ) return null;
  return array_values( array_filter( range( $from, $to ), function( $n ) use ( $filters ) { return tbr_length_matches( $n, $filters ); } ) );
}
