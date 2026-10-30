<?php

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../../lib/domains.php';

use Slim\App;

$config = include __DIR__ . '/../../etc/config.php';
$config->now = date( 'Y-m-d H:i:s', $config->time );
$config->today = date( 'Y-m-d', $config->time );

// The dictionary is ~48k lines; only load it for the routes that need it.
$wordIndex = function() use ( $config ) {
  static $index = null;
  return $index ?? $index = tbr_load_words( $config->words );
};

$config->db = new PDO( 'mysql:host=' . $config->db->host . ';dbname=' . $config->db->name, $config->db->user, $config->db->pass );
$config->db->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );

$slim = new App( $config->slim->config );

$slim->group( '/api/v1', function( $slim ) use ( $config, $wordIndex ) {

  $slim->get( '', function( $request, $response, $args ) {
    return $response->withStatus( 200 )->getBody()->write( 'Hello world!' );
  } );

  $slim->get( '/words', function( $request, $response, $args ) use ( $wordIndex ) {
    return $response->withJson( array_keys( $wordIndex() ) );
  } );

  // Filtered, sorted, paginated listing.
  //
  //   q           Substring search (2+ characters).
  //   flag        1 = flagged only.
  //   length      Comma list of domain length tokens: 5, 5- (or less), 5+ (or more).
  //   wordLength  Same, applied to the longest matched word.
  //   added       Comma list of YYYY-MM-DD dates added.
  //   session     Comma list of YYYY-MM-DD TBR session dates.
  //   status      Comma list of tbr, released, auctioned.
  //   sort, dir   id|flag|name|added|tbr|status|words, asc|desc. Omit for the default order.
  //   offset, limit
  //   count       0 to skip the total (for follow-up pages).
  $slim->get( '/domains', function( $request, $response, $args ) use ( $config ) {

    $params = $request->getQueryParams();
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

    $q = trim( $params['q'] ?? '' );
    if ( strlen( $q ) >= 2 ) {
      $where[] = 'd.domain LIKE :q';
      $bind[':q'] = '%' . addcslashes( $q, '%_\\' ) . '%';
    }

    // Lengths are expanded to an IN () list of integers, so they're safe to inline.
    if ( null !== $lengths = tbr_length_set( $list( 'length' ), 0, 63 ) ) {
      $where[] = $lengths ? 'd.domain_length IN (' . implode( ',', array_map( function( $n ) { return $n + 3; }, $lengths ) ) . ')' : '0'; // + ".ca"
    }
    if ( null !== $lengths = tbr_length_set( $list( 'wordLength' ), 3, 63 ) ) {
      $where[] = $lengths ? 'd.word_length IN (' . implode( ',', $lengths ) . ')' : '0';
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

    $statusSql = [
      'tbr' => '( d.date_auctioned IS NULL AND d.date_removed IS NULL )',
      'released' => '( d.date_auctioned IS NULL AND d.date_removed IS NOT NULL )',
      'auctioned' => 'd.date_auctioned IS NOT NULL',
    ];
    if ( $status = array_intersect_key( $statusSql, array_flip( $list( 'status' ) ) ) ) {
      $where[] = '( ' . implode( ' OR ', $status ) . ' )';
    }

    $sortSql = [
      'id' => [ 'd.id' ],
      'flag' => [ 'd.flag' ],
      'name' => [ 'd.domain' ],
      'added' => [ 'd.date_added' ],
      'tbr' => [ 'd.date_tbr' ],
      // Same order as sorting the status labels: Auctioned…, Released…, To Be Released.
      'status' => [ 'CASE WHEN d.date_auctioned IS NOT NULL THEN 0 WHEN d.date_removed IS NOT NULL THEN 1 ELSE 2 END', 'COALESCE( d.date_auctioned, d.date_removed )' ],
      'words' => [ 'd.word_length' ],
    ];
    $sort = $params['sort'] ?? '';
    if ( isset( $sortSql[ $sort ] ) ) {
      $dir = 'desc' === strtolower( $params['dir'] ?? '' ) ? 'DESC' : 'ASC';
      $orderBy = implode( ', ', array_map( function( $col ) use ( $dir ) { return "{$col} {$dir}"; }, array_merge( $sortSql[ $sort ], [ 'd.id' ] ) ) );
    } else {
      $orderBy = 'd.date_removed ASC, d.date_added DESC, d.date_tbr ASC, d.domain ASC, d.id ASC';
    }

    $offset = max( 0, (int)( $params['offset'] ?? 0 ) );
    $limit = min( 500, max( 1, (int)( $params['limit'] ?? 100 ) ) );
    $whereSql = implode( ' AND ', $where );

    // listed_filter covers every filter and sort column, so filtered lookups never touch table rows. MySQL
    // tends to pick the narrower listed_flag instead, so name it. Unfiltered pages keep the sorted indexes.
    $filterIndex = 'FORCE INDEX ( listed_filter )';
    $pageIndex = count( $where ) > 1 ? $filterIndex : '';

    // Deferred join: page through ids (index-only), then read just those rows.
    $selectStmt = $config->db->prepare( "SELECT d.id, d.domain as name, d.date_tbr as tbr, d.date_added as added, d.date_removed as removed, d.date_auctioned as auctioned, d.flag, d.words FROM domains d JOIN ( SELECT d.id FROM domains d {$pageIndex} WHERE {$whereSql} ORDER BY {$orderBy} LIMIT {$limit} OFFSET {$offset} ) page ON page.id = d.id ORDER BY {$orderBy}" );
    $selectStmt->execute( $bind );
    $domainList = $selectStmt->fetchAll( PDO::FETCH_OBJ );

    foreach ( $domainList as $domain ) {
      $domain->id = (int)$domain->id;
      $domain->flag = (int)$domain->flag;
      if ( null !== $domain->words ) {
        $domain->words = explode( ',', $domain->words );
      } else {
        unset( $domain->words );
      }
      if ( !empty( $domain->auctioned ) ) {
        $domain->status = 'Auctioned ' . $domain->auctioned;
      } else if ( !empty( $domain->removed ) ) {
        $domain->status = 'Released ' . $domain->removed;
      } else {
        $domain->status = 'To Be Released';
      }
    }

    $total = null;
    if ( '0' !== ( $params['count'] ?? '1' ) ) {
      $countStmt = $config->db->prepare( "SELECT COUNT(*) FROM domains d {$filterIndex} WHERE {$whereSql}" );
      $countStmt->execute( $bind );
      $total = (int)$countStmt->fetchColumn();
    }

    return $response->withJson( [ 'total' => $total, 'offset' => $offset, 'limit' => $limit, 'items' => $domainList ] );
  } );

  // Option lists for the date filters. Changes at most a few times a day.
  $slim->get( '/domains/facets', function( $request, $response, $args ) use ( $config ) {
    return $response
      ->withHeader( 'Cache-Control', 'public, max-age=300' )
      ->withJson( [
        'added' => $config->db->query( 'SELECT DISTINCT DATE( date_added ) FROM domains WHERE listed = 1 ORDER BY 1 DESC' )->fetchAll( PDO::FETCH_COLUMN ),
        'session' => $config->db->query( 'SELECT DISTINCT date_tbr FROM domains WHERE listed = 1 ORDER BY 1 DESC' )->fetchAll( PDO::FETCH_COLUMN ),
      ] );
  } );

  $slim->get( '/domains/{id:[0-9]+}/words', function( $request, $response, $args ) use ( $config, $wordIndex ) {

    $domainId = $args['id'];

    $selectStmt = $config->db->prepare('SELECT id, domain as name FROM domains WHERE id = :id');
    $selectStmt->bindParam(':id', $domainId, PDO::PARAM_INT);
    $selectStmt->execute();
    $domain = $selectStmt->fetch(PDO::FETCH_OBJ);

    if ( $domain ) {
      if ( $words = tbr_match_words( $domain->name, $wordIndex() ) ) $domain->words = $words;
      return $response->withJson( $domain );
    }
    return $response->withStatus(404, 'Domain not found');
  } );

  $slim->map( [ 'GET', 'PATCH', 'PUT', 'DELETE' ], '/domains/{id:[0-9]+}', function( $request, $response, $args ) use ( $config, $wordIndex ) {

    $method = $request->getMethod();
    $domainId = $args['id'];

    switch ( $method ) {
      case 'GET':

        $selectStmt = $config->db->prepare('SELECT id, domain as name, date_tbr as tbr, date_added as added, date_removed as removed, flag FROM domains WHERE id = :id');
        $selectStmt->bindParam(':id', $domainId, PDO::PARAM_INT);
        $selectStmt->execute();
        $domain = $selectStmt->fetch(PDO::FETCH_OBJ);

        if ( $domain ) {
          return $response->withJson( $domain );
        }
        return $response->withStatus(404, 'Domain not found');
      case 'PATCH':

        // Flag toggle only; doesn't need the rest of the record.
        $parsedBody = $request->getParsedBody();

        if ( isset( $parsedBody['flag'] ) ) {
          $flag = $parsedBody['flag'] ? 1 : 0;
          $updateStmt = $config->db->prepare('UPDATE domains SET flag = :flag WHERE id = :id');
          $updateStmt->bindParam(':flag', $flag, PDO::PARAM_INT);
          $updateStmt->bindParam(':id', $domainId, PDO::PARAM_INT);
          $updateStmt->execute();
          return $response->withStatus(204);
        }
        return $response->withStatus(400, 'Bad Request');
      case 'PUT':

        $parsedBody = $request->getParsedBody();

        if ( !empty( $parsedBody['name'] ) && !empty( $parsedBody['tbr'] )  ) {

          $fields = tbr_domain_fields( $parsedBody['name'], $wordIndex() );

          $updateStmt = $config->db->prepare('UPDATE domains SET domain = :domain, domain_length = :domain_length, has_dashes = :has_dashes, has_numbers = :has_numbers, words = :words, word_length = :word_length, date_tbr = :date_tbr, date_added = :date_added, date_removed = :date_removed, flag = :flag WHERE id = :id');
          $updateStmt->bindParam(':domain', $fields->domain);
          $updateStmt->bindParam(':domain_length', $fields->domain_length, PDO::PARAM_INT);
          $updateStmt->bindParam(':has_dashes', $fields->has_dashes, PDO::PARAM_INT);
          $updateStmt->bindParam(':has_numbers', $fields->has_numbers, PDO::PARAM_INT);
          $updateStmt->bindParam(':words', $fields->words);
          $updateStmt->bindParam(':word_length', $fields->word_length, PDO::PARAM_INT);
          $updateStmt->bindParam(':date_tbr', $parsedBody['tbr']);
          $updateStmt->bindParam(':date_added', $parsedBody['added']);
          $updateStmt->bindParam(':date_removed', $parsedBody['removed']);
          $updateStmt->bindParam(':flag', $parsedBody['flag'], PDO::PARAM_INT);
          $updateStmt->bindParam(':id', $domainId, PDO::PARAM_INT);
          $updateStmt->execute();
          return $response->withStatus(204); // 204 No Content on successful update
        }
        return $response->withStatus(400, 'Bad Request');
      case 'DELETE':

        $deleteStmt = $config->db->prepare('DELETE FROM domains WHERE id = :id');
        $deleteStmt->bindParam(':id', $domainId, PDO::PARAM_INT);
        $deleteStmt->execute();
        return $response->withStatus(204); // 204 No Content on successful delete
    }

    return $response->withStatus(405, 'Method Not Allowed'); // Handle unsupported methods
  } );

} );

if ( preg_match( '/^192\.168\.16\.[\d]{1,3}$/', $_SERVER['REMOTE_ADDR'] ) ) {
  header( 'Access-Control-Allow-Origin: *' );
  header( 'Access-Control-Allow-Methods: *' );
  header( 'Access-Control-Allow-Headers: *' );
}

$slim->run();
