#!/opt/remi/php82/root/bin/php
<?php

$wait = rand( 0, 300 );
print 'Waiting ' . $wait . ' seconds…' . "\n";
while( $wait > 0 ) {
  print '…';
  sleep( 10 );
  $wait = $wait - 10;
}
print "\n\n";

$time = time();

$now = date( 'Y-m-d H:i:s', $time );
$today = date( 'Y-m-d', $time );

$config = include __DIR__ . '/../etc/config.php';

try {

  $log = (object)[
    'added' => [],
    'removed' => [],
    'skipped' => [],
  ];

  $db = new PDO('mysql:host=' . $config->db->host . ';dbname=' . $config->db->name, $config->db->user, $config->db->pass);
  $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  $selectStmt = $db->prepare('SELECT * FROM domains WHERE date_released >= :today AND date_removed IS NULL');
  $selectStmt->bindParam(':today', $today);
  $selectStmt->execute();

  $results = $selectStmt->fetchAll(PDO::FETCH_OBJ);
  $upcoming_domains = array_map( function( $row ) {
    return (object)[ 'name' => $row->domain, 'date' => $row->date_released, 'id' => $row->id ];
  }, $results );

  $tbr_response = `lynx -dump https://www.cira.ca/en/wp-json/cira/v1/domains/tbr`;
  $tbr_domains = json_decode( $tbr_response );

  // Prepare insert statement
  $insertStmt = $db->prepare('INSERT IGNORE INTO domains (domain, date_released, date_added) VALUES (:domain, :date_released, :now)');
  $insertStmt->bindParam(':domain', $domain);
  $insertStmt->bindParam(':date_released', $date_released);
  $insertStmt->bindParam(':now', $now );

  // Prepare update statement
  $updateStmt = $db->prepare('UPDATE domains SET date_removed = :now WHERE id = :id');
  $updateStmt->bindParam(':now', $now);
  $updateStmt->bindParam(':id', $id);

  // Add new domains
  foreach ($tbr_domains as $tbr_domain) {
    foreach ($upcoming_domains as $upcoming_domain) {
      if ($tbr_domain->name == $upcoming_domain->name && $tbr_domain->date == $upcoming_domain->date) {
        continue 2; // Skip to the next $tbr_domain if a match is found
      }
    }
    // This code will only be reached if no $upcoming_domains match was found for the current $tbr_domain
    $domain = $tbr_domain->name;
    $date_released = $tbr_domain->date;
    $insertStmt->execute();
    $log->added[] = 'Added ' . $domain . ' - ' . $date_released;
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
  print 'Database updated successfully';
} catch(PDOException $e) {
  print 'Error: ' . $e->getMessage();
}

print_r( $domainList );
print_r( $log );
 
