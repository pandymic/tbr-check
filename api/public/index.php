<?php

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../../lib/domains.php';

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Factory\AppFactory;
use Slim\Routing\RouteCollectorProxy;

$config = include __DIR__ . '/../../etc/config.php';
$config->now = date( 'Y-m-d H:i:s', $config->time );
$config->today = date( 'Y-m-d', $config->time );

$db = new PDO( 'mysql:host=' . $config->db->host . ';dbname=' . $config->db->name, $config->db->user, $config->db->pass );
$db->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );

// The dictionary is ~42k lines; only load it for the routes that need it.
$wordIndex = function() {
  static $index = null;
  return $index ?? $index = tbr_load_words();
};

function json( Response $response, $data, $status = 200 ) {
  $response->getBody()->write( json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) );
  return $response->withHeader( 'Content-Type', 'application/json' )->withStatus( $status );
}

function body( Request $request ) {
  $body = $request->getParsedBody();
  return is_array( $body ) ? $body : [];
}

// Rows as returned by the listing, with each word's kind attached.
function present_domains( PDO $db, array $rows ) {
  if ( !$rows ) return [];
  $ids = implode( ',', array_map( function( $row ) { return (int)$row->id; }, $rows ) );
  $words = [];
  foreach ( $db->query( "SELECT dw.domain_id, w.word, w.kind FROM domain_words dw JOIN words w ON w.id = dw.word_id WHERE dw.domain_id IN ({$ids}) ORDER BY CHAR_LENGTH( w.word ) DESC, w.zipf DESC", PDO::FETCH_OBJ ) as $w ) {
    $words[ $w->domain_id ][] = [ 'word' => $w->word, 'kind' => $w->kind ];
  }
  return array_map( function( $row ) use ( $words ) {
    return [
      'id' => (int)$row->id,
      'name' => $row->name,
      'tbr' => $row->tbr,
      'added' => $row->added,
      'removed' => $row->removed,
      'auctioned' => $row->auctioned,
      'status' => tbr_status( $row ),
      'flag' => (int)$row->flag,
      'note' => $row->note,
      'maxBid' => null === $row->max_bid ? null : (int)$row->max_bid,
      'score' => null === $row->score ? null : (int)$row->score,
      'segmented' => (bool)$row->segmented,
      'segments' => $row->segments,
      'words' => $words[ $row->id ] ?? [],
    ];
  }, $rows );
}

const DOMAIN_COLUMNS = 'd.id, d.domain as name, d.date_tbr as tbr, d.date_added as added, d.date_removed as removed, d.date_auctioned as auctioned, d.flag, d.note, d.max_bid, d.score, d.segmented, d.segments';

const SORT_SQL = [
  'id' => [ 'd.id' ],
  'flag' => [ 'd.flag' ],
  'name' => [ 'd.domain' ],
  'added' => [ 'd.date_added' ],
  'tbr' => [ 'd.date_tbr' ],
  'score' => [ 'd.score' ],
  // Same order as sorting the status labels: Auctioned…, Released…, To Be Released.
  'status' => [ 'CASE WHEN d.date_auctioned IS NOT NULL THEN 0 WHEN d.date_removed IS NOT NULL THEN 1 ELSE 2 END', 'COALESCE( d.date_auctioned, d.date_removed )' ],
  'words' => [ 'd.word_length' ],
];

function order_by( array $params ) {
  $sort = $params['sort'] ?? '';
  if ( !isset( SORT_SQL[ $sort ] ) ) return 'd.date_removed ASC, d.date_added DESC, d.date_tbr ASC, d.domain ASC, d.id ASC';
  $dir = 'desc' === strtolower( $params['dir'] ?? '' ) ? 'DESC' : 'ASC';
  return implode( ', ', array_map( function( $col ) use ( $dir ) { return "{$col} {$dir}"; }, array_merge( SORT_SQL[ $sort ], [ 'd.id' ] ) ) );
}

// One page of a listing. listed_filter covers every filter and sort column, so filtered lookups never
// touch table rows; MySQL tends to pick a narrower index, so it's named. Unfiltered pages keep the
// sorted indexes. Deferred join: page through ids (index-only), then read just those rows.
function list_domains( PDO $db, array $params, $offset, $limit ) {
  [ $where, $bind ] = tbr_domain_filters( $db, $params );
  $whereSql = implode( ' AND ', $where );
  $index = count( $where ) > 1 ? 'FORCE INDEX ( listed_filter )' : '';
  $orderBy = order_by( $params );
  $stmt = $db->prepare( 'SELECT ' . DOMAIN_COLUMNS . " FROM domains d JOIN ( SELECT d.id FROM domains d {$index} WHERE {$whereSql} ORDER BY {$orderBy} LIMIT {$limit} OFFSET {$offset} ) page ON page.id = d.id ORDER BY {$orderBy}" );
  $stmt->execute( $bind );
  return $stmt->fetchAll( PDO::FETCH_OBJ );
}

function count_domains( PDO $db, array $params ) {
  [ $where, $bind ] = tbr_domain_filters( $db, $params );
  $stmt = $db->prepare( 'SELECT COUNT(*) FROM domains d FORCE INDEX ( listed_filter ) WHERE ' . implode( ' AND ', $where ) );
  $stmt->execute( $bind );
  return (int)$stmt->fetchColumn();
}

$app = AppFactory::create();
// Served as /tbr/api.php (rewritten from /tbr/api/…), so the base path is the script's directory.
$app->setBasePath( rtrim( str_replace( '\\', '/', dirname( $_SERVER['SCRIPT_NAME'] ?? '/' ) ), '/' ) );
$app->addBodyParsingMiddleware();
$app->addRoutingMiddleware();
$slimSettings = (array)( $config->slim->config ?? [] );
$app->addErrorMiddleware( !empty( $slimSettings['settings']['displayErrorDetails'] ?? $slimSettings['displayErrorDetails'] ?? false ), true, true );

// Writes need $config->apiToken (if set) in X-Api-Token. CORS is only for local dev servers;
// the production client is same-origin and needs none.
$app->add( function( Request $request, Handler $handler ) use ( $config ) {
  $origin = $request->getHeaderLine( 'Origin' );
  $cors = preg_match( '#^https?://(localhost|127\.0\.0\.1|192\.168\.16\.\d{1,3})(:\d+)?$#', $origin );

  if ( 'OPTIONS' === $request->getMethod() ) {
    $response = new Slim\Psr7\Response( 204 );
  } else if ( !in_array( $request->getMethod(), [ 'GET', 'HEAD' ] ) && !empty( $config->apiToken ) && !hash_equals( (string)$config->apiToken, $request->getHeaderLine( 'X-Api-Token' ) ) ) {
    $response = json( new Slim\Psr7\Response(), [ 'error' => 'Token required' ], 401 );
  } else {
    $response = $handler->handle( $request );
  }

  if ( $cors ) {
    $response = $response
      ->withHeader( 'Access-Control-Allow-Origin', $origin )
      ->withHeader( 'Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS' )
      ->withHeader( 'Access-Control-Allow-Headers', 'Content-Type, X-Api-Token' )
      ->withHeader( 'Vary', 'Origin' );
  }
  return $response;
} );

$app->group( '/api/v1', function( RouteCollectorProxy $api ) use ( $db, $config, $wordIndex ) {

  $api->get( '', function( Request $request, Response $response ) {
    $response->getBody()->write( 'Hello world!' );
    return $response;
  } );

  // Whether writes need a token, and whether the one sent is valid.
  $api->get( '/auth', function( Request $request, Response $response ) use ( $config ) {
    $required = !empty( $config->apiToken );
    return json( $response, [ 'required' => $required, 'ok' => !$required || hash_equals( (string)$config->apiToken, $request->getHeaderLine( 'X-Api-Token' ) ) ] );
  } );

  // Dictionary lookup for the "contains word" filter: ?prefix=sho&limit=20.
  // Without a prefix, returns the full list as before.
  $api->get( '/words', function( Request $request, Response $response ) use ( $db, $wordIndex ) {
    $params = $request->getQueryParams();
    $prefix = strtolower( preg_replace( '/[^a-z]/i', '', $params['prefix'] ?? '' ) );
    if ( '' === $prefix ) return json( $response, array_keys( $wordIndex() ) );
    $limit = min( 50, max( 1, (int)( $params['limit'] ?? 20 ) ) );
    $stmt = $db->prepare( "SELECT w.word, w.kind, ( SELECT COUNT(*) FROM domain_words dw WHERE dw.word_id = w.id ) AS domains FROM words w WHERE w.word LIKE :prefix ORDER BY w.word = :exact DESC, w.zipf DESC LIMIT {$limit}" );
    $stmt->execute( [ ':prefix' => $prefix . '%', ':exact' => $prefix ] );
    return json( $response, array_map( function( $w ) { $w['domains'] = (int)$w['domains']; return $w; }, $stmt->fetchAll( PDO::FETCH_ASSOC ) ) );
  } );

  // Filtered, sorted, paginated listing. Parameters are documented in README.md.
  $api->get( '/domains', function( Request $request, Response $response ) use ( $db ) {
    $params = $request->getQueryParams();
    $offset = max( 0, (int)( $params['offset'] ?? 0 ) );
    $limit = min( 500, max( 1, (int)( $params['limit'] ?? 100 ) ) );
    $items = present_domains( $db, list_domains( $db, $params, $offset, $limit ) );
    $total = '0' === ( $params['count'] ?? '1' ) ? null : count_domains( $db, $params );
    return json( $response, [ 'total' => $total, 'offset' => $offset, 'limit' => $limit, 'items' => $items ] );
  } );

  // Status breakdown for the current filters (ignoring the status filter itself).
  $api->get( '/domains/stats', function( Request $request, Response $response ) use ( $db ) {
    [ $where, $bind ] = tbr_domain_filters( $db, $request->getQueryParams(), [ 'status' ] );
    $stmt = $db->prepare( 'SELECT SUM( d.date_removed IS NULL AND d.date_auctioned IS NULL ), SUM( d.date_removed IS NOT NULL AND d.date_auctioned IS NULL ), SUM( d.date_auctioned IS NOT NULL ) FROM domains d FORCE INDEX ( listed_filter ) WHERE ' . implode( ' AND ', $where ) );
    $stmt->execute( $bind );
    [ $upcoming, $released, $auctioned ] = array_map( 'intval', $stmt->fetch( PDO::FETCH_NUM ) );
    $past = $released + $auctioned;
    return json( $response, [ 'upcoming' => $upcoming, 'released' => $released, 'auctioned' => $auctioned, 'auctionRate' => $past ? round( $auctioned / $past, 4 ) : null ] );
  } );

  // The current view as CSV (up to 10,000 rows).
  $api->get( '/domains/export.csv', function( Request $request, Response $response ) use ( $db ) {
    $rows = present_domains( $db, list_domains( $db, $request->getQueryParams(), 0, 10000 ) );
    $out = fopen( 'php://temp', 'r+' );
    fputcsv( $out, [ 'domain', 'score', 'words', 'session', 'added', 'status', 'flag', 'max_bid', 'note' ], ',', '"', '' );
    foreach ( $rows as $row ) {
      fputcsv( $out, [ $row['name'], $row['score'], implode( ' ', array_column( $row['words'], 'word' ) ), $row['tbr'], $row['added'], $row['status'], $row['flag'], $row['maxBid'], $row['note'] ], ',', '"', '' );
    }
    rewind( $out );
    $response->getBody()->write( stream_get_contents( $out ) );
    return $response
      ->withHeader( 'Content-Type', 'text/csv; charset=utf-8' )
      ->withHeader( 'Content-Disposition', 'attachment; filename="tbr-domains-' . date( 'Y-m-d' ) . '.csv"' );
  } );

  // Option lists for the date filters. Changes at most a few times a day.
  $api->get( '/domains/facets', function( Request $request, Response $response ) use ( $db ) {
    return json( $response, [
      'added' => $db->query( 'SELECT DISTINCT DATE( date_added ) FROM domains WHERE listed = 1 ORDER BY 1 DESC' )->fetchAll( PDO::FETCH_COLUMN ),
      'session' => $db->query( 'SELECT DISTINCT date_tbr FROM domains WHERE listed = 1 ORDER BY 1 DESC' )->fetchAll( PDO::FETCH_COLUMN ),
    ] )->withHeader( 'Cache-Control', 'public, max-age=300' );
  } );

  $api->get( '/domains/{id:[0-9]+}/words', function( Request $request, Response $response, array $args ) use ( $db, $wordIndex ) {
    $stmt = $db->prepare( 'SELECT id, domain as name FROM domains WHERE id = :id' );
    $stmt->execute( [ ':id' => $args['id'] ] );
    $domain = $stmt->fetch( PDO::FETCH_OBJ );
    if ( !$domain ) return json( $response, [ 'error' => 'Domain not found' ], 404 );
    $index = $wordIndex();
    $domain->words = array_map( function( $word ) use ( $index ) { return [ 'word' => $word, 'kind' => $index[ $word ]['kind'] ]; }, array_keys( tbr_match_words( $domain->name, $index ) ) );
    return json( $response, $domain );
  } );

  $api->get( '/domains/{id:[0-9]+}', function( Request $request, Response $response, array $args ) use ( $db ) {
    $stmt = $db->prepare( 'SELECT ' . DOMAIN_COLUMNS . ' FROM domains d WHERE d.id = :id' );
    $stmt->execute( [ ':id' => $args['id'] ] );
    $rows = $stmt->fetchAll( PDO::FETCH_OBJ );
    return $rows ? json( $response, present_domains( $db, $rows )[0] ) : json( $response, [ 'error' => 'Domain not found' ], 404 );
  } );

  // Watchlist fields: any of { flag, note, maxBid }.
  $api->patch( '/domains/{id:[0-9]+}', function( Request $request, Response $response, array $args ) use ( $db ) {
    $body = body( $request );
    $set = [];
    $bind = [ ':id' => $args['id'] ];
    if ( array_key_exists( 'flag', $body ) ) { $set[] = 'flag = :flag'; $bind[':flag'] = $body['flag'] ? 1 : 0; }
    if ( array_key_exists( 'note', $body ) ) { $set[] = 'note = :note'; $bind[':note'] = '' === trim( (string)$body['note'] ) ? null : trim( (string)$body['note'] ); }
    if ( array_key_exists( 'maxBid', $body ) ) { $set[] = 'max_bid = :max_bid'; $bind[':max_bid'] = is_numeric( $body['maxBid'] ) && $body['maxBid'] >= 0 ? (int)$body['maxBid'] : null; }
    if ( !$set ) return json( $response, [ 'error' => 'Nothing to update' ], 400 );
    $db->prepare( 'UPDATE domains SET ' . implode( ', ', $set ) . ' WHERE id = :id' )->execute( $bind );
    return $response->withStatus( 204 );
  } );

  // Replace a domain's core fields; derived columns and word links are recomputed.
  $api->put( '/domains/{id:[0-9]+}', function( Request $request, Response $response, array $args ) use ( $db, $wordIndex ) {
    $body = body( $request );
    if ( empty( $body['name'] ) || empty( $body['tbr'] ) ) return json( $response, [ 'error' => 'name and tbr are required' ], 400 );
    $f = tbr_domain_fields( $body['name'], $wordIndex() );
    $db->beginTransaction();
    $db->prepare( 'UPDATE domains SET domain = :domain, domain_length = :domain_length, has_dashes = :has_dashes, has_numbers = :has_numbers, words = :words, word_length = :word_length, score = :score, segmented = :segmented, segments = :segments, kinds = :kinds, date_tbr = :date_tbr, date_added = :date_added, date_removed = :date_removed, flag = :flag WHERE id = :id' )->execute( [
      ':domain' => $f->domain, ':domain_length' => $f->domain_length, ':has_dashes' => $f->has_dashes, ':has_numbers' => $f->has_numbers,
      ':words' => $f->words, ':word_length' => $f->word_length, ':score' => $f->score, ':segmented' => $f->segmented, ':segments' => $f->segments, ':kinds' => $f->kinds,
      ':date_tbr' => $body['tbr'], ':date_added' => $body['added'] ?? null, ':date_removed' => $body['removed'] ?? null, ':flag' => empty( $body['flag'] ) ? 0 : 1, ':id' => $args['id'],
    ] );
    $listed = !$f->has_dashes && !$f->has_numbers && $f->domain_length < 13;
    tbr_store_domain_words( $db, (int)$args['id'], $listed ? $f->matches : [], tbr_word_ids( $db ) );
    $db->commit();
    return $response->withStatus( 204 );
  } );

  // Saved searches: { name, query (the listing's query string), alert }.
  $api->get( '/searches', function( Request $request, Response $response ) use ( $db ) {
    $rows = $db->query( 'SELECT id, name, query, alert, created FROM saved_searches ORDER BY name' )->fetchAll( PDO::FETCH_ASSOC );
    return json( $response, array_map( function( $s ) { $s['id'] = (int)$s['id']; $s['alert'] = (bool)$s['alert']; return $s; }, $rows ) );
  } );

  $api->post( '/searches', function( Request $request, Response $response ) use ( $db, $config ) {
    $body = body( $request );
    $name = trim( (string)( $body['name'] ?? '' ) );
    if ( '' === $name ) return json( $response, [ 'error' => 'name is required' ], 400 );
    $db->prepare( 'INSERT INTO saved_searches (name, query, alert, created) VALUES (?, ?, ?, ?)' )
      ->execute( [ mb_substr( $name, 0, 100 ), substr( (string)( $body['query'] ?? '' ), 0, 2000 ), empty( $body['alert'] ) ? 0 : 1, $config->now ] );
    return json( $response, [ 'id' => (int)$db->lastInsertId() ], 201 );
  } );

  $api->patch( '/searches/{id:[0-9]+}', function( Request $request, Response $response, array $args ) use ( $db ) {
    $body = body( $request );
    $set = [];
    $bind = [ ':id' => $args['id'] ];
    if ( isset( $body['name'] ) && '' !== trim( $body['name'] ) ) { $set[] = 'name = :name'; $bind[':name'] = mb_substr( trim( $body['name'] ), 0, 100 ); }
    if ( isset( $body['query'] ) ) { $set[] = 'query = :query'; $bind[':query'] = substr( (string)$body['query'], 0, 2000 ); }
    if ( array_key_exists( 'alert', $body ) ) { $set[] = 'alert = :alert'; $bind[':alert'] = $body['alert'] ? 1 : 0; }
    if ( !$set ) return json( $response, [ 'error' => 'Nothing to update' ], 400 );
    $db->prepare( 'UPDATE saved_searches SET ' . implode( ', ', $set ) . ' WHERE id = :id' )->execute( $bind );
    return $response->withStatus( 204 );
  } );

  $api->delete( '/searches/{id:[0-9]+}', function( Request $request, Response $response, array $args ) use ( $db ) {
    $db->prepare( 'DELETE FROM saved_searches WHERE id = ?' )->execute( [ $args['id'] ] );
    return $response->withStatus( 204 );
  } );

  // Recent alerts, newest first, plus the unseen count.
  $api->get( '/alerts', function( Request $request, Response $response ) use ( $db ) {
    $limit = min( 100, max( 1, (int)( $request->getQueryParams()['limit'] ?? 30 ) ) );
    $items = $db->query( "SELECT a.id, a.created, a.type, a.message, a.seen, a.search_id, s.query, d.domain FROM alerts a LEFT JOIN saved_searches s ON s.id = a.search_id LEFT JOIN domains d ON d.id = a.domain_id ORDER BY a.created DESC, a.id DESC LIMIT {$limit}" )->fetchAll( PDO::FETCH_ASSOC );
    $unseen = (int)$db->query( 'SELECT COUNT(*) FROM alerts WHERE seen = 0' )->fetchColumn();
    return json( $response, [ 'unseen' => $unseen, 'items' => array_map( function( $a ) {
      return [ 'id' => (int)$a['id'], 'created' => $a['created'], 'type' => $a['type'], 'message' => $a['message'], 'seen' => (bool)$a['seen'], 'query' => $a['query'], 'domain' => $a['domain'] ];
    }, $items ) ] );
  } );

  $api->post( '/alerts/seen', function( Request $request, Response $response ) use ( $db ) {
    $db->exec( 'UPDATE alerts SET seen = 1 WHERE seen = 0' );
    return $response->withStatus( 204 );
  } );

} );

$app->run();
