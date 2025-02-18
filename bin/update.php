#!/opt/remi/php82/root/bin/php
<?php

$waitIncrement = 10;
$wait = rand( $waitIncrement, 300 );
print 'Waiting ' . $wait . ' seconds…' . "\n";
do {
  print '…';
  $wait = $wait - $waitIncrement;
  sleep( $wait < $waitIncrement ? $wait : $waitIncrement );
} while( $wait > $waitIncrement );
print "\n\n";

$config = include __DIR__ . '/../etc/config.php';
$config->now = date( 'Y-m-d H:i:s', $config->time );
$config->today = date( 'Y-m-d', $config->time );

try {

  $log = (object)[
    'added' => [],
    'removed' => [],
    'skipped' => [],
  ];

  $db = new PDO('mysql:host=' . $config->db->host . ';dbname=' . $config->db->name, $config->db->user, $config->db->pass);
  $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $selectStmt = $db->prepare('SELECT * FROM domains WHERE date_tbr >= :today AND date_removed IS NULL');
  $selectStmt->bindParam(':today', $config->today);
  $selectStmt->execute();

  $results = $selectStmt->fetchAll(PDO::FETCH_OBJ);
  $upcoming_domains = array_map( function( $row ) {
    return (object)[ 'name' => $row->domain, 'date' => $row->date_tbr, 'id' => $row->id ];
  }, $results );

  $url = $config->tbrUrl;

  $tbr_response = `lynx -dump $url`;
  $tbr_domains = json_decode( $tbr_response );

  // Prepare insert statement
  $insertStmt = $db->prepare('INSERT IGNORE INTO domains (domain, date_tbr, date_added) VALUES (:domain, :date_tbr, :now)');
  $insertStmt->bindParam(':domain', $domain);
  $insertStmt->bindParam(':date_tbr', $date_tbr);
  $insertStmt->bindParam(':now', $config->now );

  // Prepare update statement
  $updateStmt = $db->prepare('UPDATE domains SET date_removed = :now WHERE id = :id');
  $updateStmt->bindParam(':now', $config->now);
  $updateStmt->bindParam(':id', $id, PDO::PARAM_INT);

  // Add new domains
  foreach ($tbr_domains as $tbr_domain) {
    foreach ($upcoming_domains as $upcoming_domain) {
      if ($tbr_domain->name == $upcoming_domain->name && $tbr_domain->date == $upcoming_domain->date) {
        continue 2; // Skip to the next $tbr_domain if a match is found
      }
    }
    // This code will only be reached if no $upcoming_domains match was found for the current $tbr_domain
    $domain = $tbr_domain->name;
    $date_tbr = $tbr_domain->date;
    $insertStmt->execute();
    $log->added[] = 'Added ' . $domain . ' - ' . $date_tbr;
  }

  // Remove outdated domains
  foreach ($upcoming_domains as $upcoming_domain) {
    foreach ($tbr_domains as $tbr_domain) {
      if ($tbr_domain->name == $upcoming_domain->name && $tbr_domain->date == $upcoming_domain->date) {
        $log->skipped[] = 'Skipped ' . $upcoming_domain->name . ' - ' . $upcoming_domain->date;
        continue 2; // Skip to the next $upcoming_domain if a match is found
      }
    }
    // This code will only be reached if no $tbr_domains match was found for the current $upcoming_domain
    $id = $upcoming_domain->id; 
    $updateStmt->execute();
    
    $log->removed[] = 'Removed ' . $upcoming_domain->name . ' - ' . $upcoming_domain->date;
  }

  $url = $config->resultsUrl;

  $results_response = `lynx -dump $url`;
  $results = json_decode( $results_response );
  if ( null !== $results && is_object( $results ) && isset( $results->releaseDate ) ) {

    $releaseDate = new DateTime( $results->releaseDate );
    $releaseDate->setTimezone( new DateTimeZone( date_default_timezone_get() ) );
    $releaseDate = $releaseDate->format( 'Y-m-d H:i:s' );

    $checkStmt = $db->prepare('SELECT 1 FROM results WHERE date_released = :date_released');
    $checkStmt->bindParam(':date_released', $releaseDate );
    $checkStmt->execute();

    if ( !$checkStmt->fetchColumn() ) {

      $numberOfDomainNames = (int)$results->numberOfDomainNames;

      $insertStmt = $db->prepare('INSERT INTO results ( date_released, date_added, domains_count ) VALUES ( :date_released, :date_added, :domains_count )');
      $insertStmt->bindParam(':date_released', $releaseDate );
      $insertStmt->bindParam(':date_added', $config->now );
      $insertStmt->bindParam(':domains_count', $numberOfDomainNames );
      $insertStmt->execute();

      $insertId = $db->lastInsertId();

      if (isset($results->domains) && is_array($results->domains)) {
        foreach ($results->domains as $domain) {
            if (!isset($domain->domainName)) { // Check if domainName is set
                error_log("domainName not set in results->domains. Skipping.");
                continue;
            }

            try {
                // Check if the domain already exists in the 'domains' table
                $domainCheckStmt = $db->prepare('SELECT id FROM domains WHERE domain = :domain');
                $domainCheckStmt->bindParam(':domain', $domain->domainName);
                $domainCheckStmt->execute();

                $domainId = $domainCheckStmt->fetchColumn();

                if ($domainId) {
                    // Domain exists, insert into 'results_to_domains'
                    $linkInsertStmt = $db->prepare('INSERT INTO results_to_domains (results_id, domains_id) VALUES (:results_id, :domains_id)');
                    $linkInsertStmt->bindParam(':results_id', $insertId, PDO::PARAM_INT);
                    $linkInsertStmt->bindParam(':domains_id', $domainId, PDO::PARAM_INT);
                    $linkInsertStmt->execute();
                }

            } catch (PDOException $e) {
                error_log("Database error: " . $e->getMessage());  // Log the error for debugging
            }
        }
      } else {
        error_log("results->domains is not an array or is not set."); // Log if the domains data is not as expected.
      }

    }

  }

  print 'Database updated successfully';
} catch(PDOException $e) {
  print 'Error: ' . $e->getMessage();
}

print_r( $domainList );
print_r( $log );
 
