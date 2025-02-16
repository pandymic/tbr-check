<?php

require __DIR__ . '/../vendor/autoload.php';

use Slim\App;

$config = include __DIR__ . '/../../etc/config.php';
$config->now = date( 'Y-m-d H:i:s', $config->time );
$config->today = date( 'Y-m-d', $config->time );

$config->db = new PDO( 'mysql:host=' . $config->db->host . ';dbname=' . $config->db->name, $config->db->user, $config->db->pass );
$config->db->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );

$slim = new App( $config->slim->config );

$slim->group( '/api/v1', function( $slim ) use ( $config ) {

  $slim->get( '', function( $request, $response, $args ) {
    return $response->withStatus( 200 )->getBody()->write( 'Hello world!' );
  } );

  $slim->get( '/domains', function( $request, $response, $args ) use ( $config ) {

    $selectStmt = $config->db->prepare('SELECT id, domain as name, date_tbr as tbr, date_added as added, date_removed as removed FROM domains WHERE date_tbr >= :today AND date_removed IS NULL ORDER BY date_added DESC, date_tbr ASC, domain ASC');
    $selectStmt->bindParam(':today', $config->today);
    $selectStmt->execute();
    $domainList = $selectStmt->fetchAll(PDO::FETCH_OBJ);

    return $response->withJson( $domainList );
  } );

  $slim->map( [ 'GET', 'POST', 'PUT', 'DELETE' ], '/domains/{id:[0-9]+}', function( $request, $response, $args ) use ( $config ) {

    $method = $request->getMethod();
    $domainId = $args['id'];

    switch ( $method ) {
      case 'GET':

        $selectStmt = $config->db->prepare('SELECT id, domain as name, date_tbr as tbr, date_added as added, date_removed as removed FROM domains WHERE id = :id');
        $selectStmt->bindParam(':id', $domainId, PDO::PARAM_INT);
        $selectStmt->execute();
        $domain = $selectStmt->fetch(PDO::FETCH_OBJ);

        if ( $domain ) {
          return $response->withJson( $domain );
        }
        return $response->withStatus(404, 'Domain not found');
      case 'PUT':
        
        $parsedBody = $request->getParsedBody();

        if ( !empty( $parsedBody['name'] ) && !empty( $parsedBody['tbr'] )  ) {
          $updateStmt = $config->db->prepare('UPDATE domains SET domain = :domain, date_tbr = :date_tbr, date_added = :date_added, date_removed = :date_removed WHERE id = :id');
          $updateStmt->bindParam(':domain', $parsedBody['name']);
          $updateStmt->bindParam(':date_tbr', $parsedBody['tbr']);
          $updateStmt->bindParam(':date_added', $config->now);
          $updateStmt->bindParam(':date_removed', $parsedBody['removed'] ?? null);
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

$slim->run();
