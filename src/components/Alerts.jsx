import React, { useCallback, useEffect, useState } from 'react';
import { Button, Icon, Label, List, Popup } from 'semantic-ui-react';
import { getJson, send } from '../api.js';
import { relative } from '../format.js';

const REFRESH = 5 * 60 * 1000;

// Bell with the unseen count; alerts come from the update agent (watchlist changes, saved-view matches).
const Alerts = ( { onApply } ) => {
  const [ alerts, setAlerts ] = useState( { unseen: 0, items: [] } );

  const load = useCallback( () => getJson( '/alerts' ).then( setAlerts ).catch( error => console.error( error ) ), [] );
  useEffect( () => {
    load();
    const timer = setInterval( load, REFRESH );
    return () => clearInterval( timer );
  }, [ load ] );

  const markSeen = () => send( 'POST', '/alerts/seen' ).then( load ).catch( error => console.error( error ) );

  return (
    <Popup
      on="click"
      position="bottom right"
      wide="very"
      onOpen={ load }
      trigger={
        <Button basic icon className="alerts" title="Alerts">
          <Icon name={ alerts.unseen ? 'bell' : 'bell outline' } />
          { alerts.unseen > 0 && <Label color="red" floating circular size="mini" content={ alerts.unseen } /> }
        </Button>
      }
      content={
        <div className="alerts-list">
          { alerts.items.length ? (
            <List divided relaxed>
              { alerts.items.map( alert => (
                <List.Item key={ alert.id } className={ alert.seen ? 'seen' : 'unseen' }>
                  <List.Icon name={ 'match' === alert.type ? 'search' : 'eye' } />
                  <List.Content>
                    { alert.query ? <a href="#view" onClick={ e => { e.preventDefault(); onApply( alert.query ); } }>{ alert.message }</a> : alert.message }
                    <List.Description title={ alert.created }>{ relative( alert.created ) }</List.Description>
                  </List.Content>
                </List.Item>
              ) ) }
            </List>
          ) : <p>No alerts yet. Save a view with alerts on, or watch a domain.</p> }
          { alerts.unseen > 0 && <Button fluid basic size="small" content="Mark all read" onClick={ markSeen } /> }
        </div>
      }
    />
  );
};

export default Alerts;
