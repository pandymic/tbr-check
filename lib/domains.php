<?php

// Shared helpers for the API, the update agent and the backfill script.

const TBR_KINDS = [ 'common', 'fr', 'place', 'name', 'tech' ];
const TBR_WORDS = __DIR__ . '/../var/words.tsv';

// Load var/words.tsv (built by bin/build-dictionary.py) as
// word => [ 'kind' => …, 'zipf' => float ].
function tbr_load_words( $path = TBR_WORDS ) {
  $index = [];
  foreach ( file( $path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES ) as $line ) {
    if ( '#' === $line[0] ) continue;
    [ $word, $kind, $zipf ] = explode( "\t", $line );
    $index[ $word ] = [ 'kind' => $kind, 'zipf' => (float)$zipf ];
  }
  return $index;
}

// Domain name without ".ca", lowercased.
function tbr_name( $domain ) {
  return trim( preg_replace( '/\.ca$/', '', trim( strtolower( $domain ) ) ) );
}

// Two-letter words (ai, ev, bc…) only count at the start or end of a name;
// anywhere else they're almost always an accident.
function tbr_word_fits( $word, $at, $nameLength ) {
  return strlen( $word ) > 2 || 0 === $at || $at + strlen( $word ) === $nameLength;
}

// Every dictionary word contained in the name: word => first position.
// Longest first, then most common.
function tbr_match_words( $domain, array $wordIndex ) {
  $name = tbr_name( $domain );
  $n = strlen( $name );
  $found = [];
  for ( $len = $n; $len >= 2; $len-- ) {
    for ( $i = 0; $i + $len <= $n; $i++ ) {
      $sub = substr( $name, $i, $len );
      if ( !isset( $found[ $sub ] ) && isset( $wordIndex[ $sub ] ) && tbr_word_fits( $sub, $i, $n ) ) $found[ $sub ] = $i;
    }
  }
  uksort( $found, function( $a, $b ) use ( $wordIndex ) {
    return ( strlen( $b ) - strlen( $a ) ) ?: ( $wordIndex[ $b ]['zipf'] <=> $wordIndex[ $a ]['zipf'] ) ?: strcmp( $a, $b );
  } );
  return $found;
}

// Best split of the name into dictionary words: covers the most characters,
// then uses the fewest words, then the most common ones.
// Returns a list of [ text, isWord ] pieces in order.
function tbr_segment( $name, array $wordIndex ) {
  $n = strlen( $name );
  // $best[ $i ] = [ covered, -parts, zipfSum, pieces ] for the suffix starting at $i.
  $best = [ $n => [ 0, 0, 0.0, [] ] ];
  for ( $i = $n - 1; $i >= 0; $i-- ) {
    $next = $best[ $i + 1 ];
    $pieces = $next[3];
    if ( $pieces && !$pieces[0][1] ) {
      $pieces[0][0] = $name[ $i ] . $pieces[0][0];
    } else {
      array_unshift( $pieces, [ $name[ $i ], false ] );
    }
    $candidate = [ $next[0], $next[1], $next[2], $pieces ];
    for ( $len = 2; $i + $len <= $n; $len++ ) {
      $word = substr( $name, $i, $len );
      if ( !isset( $wordIndex[ $word ] ) || !tbr_word_fits( $word, $i, $n ) ) continue;
      $rest = $best[ $i + $len ];
      $option = [ $rest[0] + $len, $rest[1] - 1, $rest[2] + $wordIndex[ $word ]['zipf'], array_merge( [ [ $word, true ] ], $rest[3] ) ];
      if ( array_slice( $option, 0, 3 ) > array_slice( $candidate, 0, 3 ) ) $candidate = $option;
    }
    $best[ $i ] = $candidate;
  }
  return $best[0][3];
}

// Estimated chance (0–1) that a released domain with this shape sells at
// auction, from CIRA auction history (bin/calibrate.php prints the source table):
//   one whole word        ~65% (≤4 letters), ~49% (5), ~38% (6+)
//   two words             2–7%, higher when both words are common, ×2.5 if ≤5 letters
//   three or more words   ~1%
//   not all words         by length: 3 letters ~42%, 4 ~7%, 5 ~4% … 9 ~1.5%
function tbr_auction_odds( $name, array $pieces, array $wordIndex ) {
  $n = strlen( $name );
  $words = array_values( array_filter( $pieces, function( $p ) { return $p[1]; } ) );
  $whole = $words && count( $words ) === count( $pieces );
  if ( !$whole ) {
    return [ 0, 1, 1, 0.415, 0.069, 0.039, 0.025, 0.020, 0.014 ][ $n ] ?? 0.015;
  }
  if ( 1 === count( $words ) ) return $n <= 4 ? 0.65 : ( 5 === $n ? 0.49 : 0.38 );
  if ( count( $words ) >= 3 ) return 0.011;
  $minZipf = min( array_map( function( $p ) use ( $wordIndex ) { return $wordIndex[ $p[0] ]['zipf']; }, $words ) );
  $odds = $minZipf >= 5 ? 0.068 : ( $minZipf >= 4 ? 0.042 : 0.022 );
  return $odds * ( $n <= 5 ? 2.5 : ( 6 === $n ? 1.5 : 1 ) );
}

// 0–100 on a log scale of auction odds: 100 ≈ certain, 80 ≈ 40%, 50 ≈ 10%, 30 ≈ 4%, 0 ≤ 1%.
function tbr_score( $name, array $pieces, array $wordIndex ) {
  $odds = tbr_auction_odds( $name, $pieces, $wordIndex );
  return (int)max( 0, min( 100, round( 50 * ( log10( max( $odds, 0.0001 ) ) + 2 ) ) ) );
}

// Derived columns stored alongside a domain name, plus its word matches.
function tbr_domain_fields( $domain, array $wordIndex ) {
  $domain = strtolower( $domain );
  $name = tbr_name( $domain );
  $matches = tbr_match_words( $domain, $wordIndex );
  $pieces = tbr_segment( $name, $wordIndex );
  $words = array_keys( $matches );
  $kinds = array_values( array_unique( array_map( function( $w ) use ( $wordIndex ) { return $wordIndex[ $w ]['kind']; }, $words ) ) );
  $segmented = $pieces && !array_filter( $pieces, function( $p ) { return !$p[1]; } );
  return (object)[
    'domain' => $domain,
    'domain_length' => strlen( $domain ),
    'has_dashes' => false !== strpos( $domain, '-' ) ? 1 : 0,
    'has_numbers' => 1 === preg_match( '/[\d]/', $domain ) ? 1 : 0,
    'words' => $words ? implode( ',', $words ) : null,
    'word_length' => $words ? strlen( $words[0] ) : null,
    'score' => tbr_score( $name, $pieces, $wordIndex ),
    'segmented' => $segmented ? 1 : 0,
    // "app|nest", "~gt|muffler": pieces split by "|", "~" marks text that isn't a word.
    'segments' => implode( '|', array_map( function( $p ) { return ( $p[1] ? '' : '~' ) . $p[0]; }, $pieces ) ),
    'kinds' => implode( ',', $kinds ),
    'matches' => $matches,
  ];
}

// Replace a domain's rows in domain_words. $wordIds maps word => words.id.
function tbr_store_domain_words( PDO $db, $domainId, array $matches, array $wordIds ) {
  $db->prepare( 'DELETE FROM domain_words WHERE domain_id = ?' )->execute( [ $domainId ] );
  if ( !$matches ) return;
  $values = [];
  $bind = [];
  foreach ( $matches as $word => $position ) {
    if ( !isset( $wordIds[ $word ] ) ) continue;
    $values[] = '(?,?,?)';
    array_push( $bind, $domainId, $wordIds[ $word ], $position );
  }
  if ( $values ) $db->prepare( 'INSERT INTO domain_words (domain_id, word_id, position) VALUES ' . implode( ',', $values ) )->execute( $bind );
}

// word => words.id
function tbr_word_ids( PDO $db ) {
  return $db->query( 'SELECT word, id FROM words' )->fetchAll( PDO::FETCH_KEY_PAIR );
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

// Build the WHERE clause for a listing from query parameters (see README).
// Returns [ conditions[], bind[] ]; the first condition is always "listed".
function tbr_domain_filters( PDO $db, array $params, array $skip = [] ) {

  $list = function( $key ) use ( $params ) {
    $value = $params[ $key ] ?? '';
    return array_values( array_filter( is_array( $value ) ? $value : explode( ',', $value ), 'strlen' ) );
  };
  $dates = function( $key ) use ( $list ) {
    return array_values( array_filter( $list( $key ), function( $d ) { return preg_match( '/^\d{4}-\d{2}-\d{2}$/', $d ); } ) );
  };

  $where = [ 'd.listed = 1' ];
  $bind = [];

  if ( !empty( $params['flag'] ) ) $where[] = 'd.flag = 1';
  if ( !empty( $params['segmented'] ) ) $where[] = 'd.segmented = 1';
  if ( isset( $params['minScore'] ) && '' !== $params['minScore'] ) $where[] = 'd.score >= ' . max( 0, min( 100, (int)$params['minScore'] ) );

  $q = trim( $params['q'] ?? '' );
  if ( strlen( $q ) >= 2 ) {
    $where[] = 'd.domain LIKE :q';
    $bind[':q'] = '%' . addcslashes( $q, '%_\\' ) . '%';
  }

  // Lengths are expanded to an IN () list of integers, so they're safe to inline.
  if ( null !== $lengths = tbr_length_set( $list( 'length' ), 0, 63 ) ) {
    $where[] = $lengths ? 'd.domain_length IN (' . implode( ',', array_map( function( $n ) { return $n + 3; }, $lengths ) ) . ')' : '0'; // + ".ca"
  }
  if ( null !== $lengths = tbr_length_set( $list( 'wordLength' ), 2, 63 ) ) {
    $where[] = $lengths ? 'd.word_length IN (' . implode( ',', $lengths ) . ')' : '0';
  }

  // Has at least one word of any of these kinds (SET column, so a bitmask test).
  if ( $kinds = array_values( array_intersect( TBR_KINDS, $list( 'kind' ) ) ) ) {
    $mask = 0;
    foreach ( $kinds as $kind ) $mask |= 1 << array_search( $kind, TBR_KINDS );
    $where[] = "( d.kinds & {$mask} ) <> 0";
  }

  // Contains every one of these dictionary words.
  foreach ( array_slice( $list( 'word' ), 0, 5 ) as $i => $word ) {
    $where[] = "d.id IN ( SELECT dw.domain_id FROM domain_words dw JOIN words w ON w.id = dw.word_id WHERE w.word = :word{$i} )";
    $bind[":word{$i}"] = strtolower( $word );
  }

  if ( $added = $dates( 'added' ) ) {
    $or = [];
    foreach ( $added as $i => $date ) {
      $or[] = "( d.date_added >= :addedFrom{$i} AND d.date_added < :addedTo{$i} + INTERVAL 1 DAY )";
      $bind[":addedFrom{$i}"] = $date;
      $bind[":addedTo{$i}"] = $date;
    }
    $where[] = '( ' . implode( ' OR ', $or ) . ' )';
  }

  if ( $sessions = $dates( 'session' ) ) {
    $in = [];
    foreach ( $sessions as $i => $date ) {
      $in[] = ":session{$i}";
      $bind[":session{$i}"] = $date;
    }
    $where[] = 'd.date_tbr IN (' . implode( ',', $in ) . ')';
  }

  if ( !in_array( 'status', $skip ) ) {
    $statusSql = [
      'tbr' => '( d.date_auctioned IS NULL AND d.date_removed IS NULL )',
      'released' => '( d.date_auctioned IS NULL AND d.date_removed IS NOT NULL )',
      'auctioned' => 'd.date_auctioned IS NOT NULL',
    ];
    if ( $status = array_intersect_key( $statusSql, array_flip( $list( 'status' ) ) ) ) {
      $where[] = '( ' . implode( ' OR ', $status ) . ' )';
    }
  }

  return [ $where, $bind ];
}

// Status label as shown in the client.
function tbr_status( $domain ) {
  if ( !empty( $domain->auctioned ) ) return 'Auctioned ' . $domain->auctioned;
  if ( !empty( $domain->removed ) ) return 'Released ' . $domain->removed;
  return 'To Be Released';
}

// Record an alert, and push it to $config->alertWebhook if set (e.g. an ntfy.sh topic URL).
function tbr_alert( PDO $db, $config, $type, $message, $domainId = null, $searchId = null ) {
  $db->prepare( 'INSERT INTO alerts (created, type, domain_id, search_id, message) VALUES (?, ?, ?, ?, ?)' )
    ->execute( [ $config->now, $type, $domainId, $searchId, mb_substr( $message, 0, 255 ) ] );
  if ( !empty( $config->alertWebhook ) ) {
    @file_get_contents( $config->alertWebhook, false, stream_context_create( [ 'http' => [
      'method' => 'POST',
      'header' => "Content-Type: text/plain\r\nTitle: TBR Check\r\n",
      'content' => $message,
      'timeout' => 10,
    ] ] ) );
  }
}

// Alert for each saved search (with alerts on) that matches domains added at $since.
function tbr_search_alerts( PDO $db, $config, $since ) {
  foreach ( $db->query( 'SELECT id, name, query FROM saved_searches WHERE alert = 1' )->fetchAll( PDO::FETCH_OBJ ) as $search ) {
    parse_str( $search->query, $params );
    [ $where, $bind ] = tbr_domain_filters( $db, $params );
    $where[] = 'd.date_added = :since';
    $bind[':since'] = $since;
    $stmt = $db->prepare( 'SELECT d.domain FROM domains d FORCE INDEX ( listed_filter ) WHERE ' . implode( ' AND ', $where ) . ' ORDER BY d.score DESC LIMIT 1000' );
    $stmt->execute( $bind );
    $names = $stmt->fetchAll( PDO::FETCH_COLUMN );
    if ( $names ) {
      $more = count( $names ) > 5 ? ' and ' . ( count( $names ) - 5 ) . ' more' : '';
      tbr_alert( $db, $config, 'match', count( $names ) . " new for “{$search->name}”: " . implode( ', ', array_slice( $names, 0, 5 ) ) . $more, null, $search->id );
    }
  }
}
