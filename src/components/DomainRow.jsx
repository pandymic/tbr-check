import React, { useState } from 'react';
import { Button, Checkbox, Form, Icon, Label, Popup, TableCell, TableRow } from 'semantic-ui-react';
import { send } from '../api.js';
import { auctionOdds, KINDS, relative, scoreColor, shortDate } from '../format.js';

// "app|nest" → app·nest with words in bold; "~" pieces aren't words.
const Segments = ( { segments, name } ) => {
  if ( !segments ) return name;
  const pieces = segments.split( '|' );
  return (
    <span className="segments">
      { pieces.map( ( piece, i ) => '~' === piece[ 0 ] ?
        <span key={ i } className="filler">{ piece.slice( 1 ) }</span> :
        <strong key={ i } className={ i > 0 && '~' !== pieces[ i - 1 ][ 0 ] ? 'joined' : undefined }>{ piece }</strong>
      ) }
      <span className="tld">.ca</span>
    </span>
  );
};

const WatchEditor = ( { domain, onChange } ) => {
  const [ open, setOpen ] = useState( false );
  const [ note, setNote ] = useState( domain.note ?? '' );
  const [ maxBid, setMaxBid ] = useState( domain.maxBid ?? '' );
  const [ saving, setSaving ] = useState( false );

  const save = () => {
    const changes = { note: note.trim() || null, maxBid: '' === maxBid ? null : parseInt( maxBid, 10 ) };
    setSaving( true );
    send( 'PATCH', `/domains/${domain.id}`, changes ).then( () => {
      onChange( domain.id, changes );
      setOpen( false );
    } ).catch( error => console.error( 'Failed to save notes:', error ) ).finally( () => setSaving( false ) );
  };

  return (
    <Popup
      on="click"
      open={ open }
      onOpen={ () => { setNote( domain.note ?? '' ); setMaxBid( domain.maxBid ?? '' ); setOpen( true ); } }
      onClose={ () => setOpen( false ) }
      position="bottom left"
      wide
      trigger={ <Icon link name={ domain.note || null !== domain.maxBid ? 'sticky note' : 'sticky note outline' } title="Notes and max bid" /> }
      content={
        <Form onSubmit={ save } className="watch-editor">
          <Form.TextArea label="Note" rows={ 3 } value={ note } onChange={ ( e, { value } ) => setNote( value ) } />
          <Form.Input label="Max bid" type="number" min="0" icon="dollar" iconPosition="left" value={ maxBid } onChange={ ( e, { value } ) => setMaxBid( value ) } />
          <Button primary size="small" type="submit" loading={ saving } content="Save" />
        </Form>
      }
    />
  );
};

const DomainRow = React.memo( ( { domain, onFlag, onChange, onWord } ) => {

  let rowProps = {};
  if ( domain.removed ) {
    rowProps = domain.auctioned ? { negative: true } : { warning: true };
  } else if ( domain.flag ) {
    rowProps.positive = true;
  }

  return (
  <TableRow { ...rowProps }>
    <TableCell data-label="Watch" textAlign="center" verticalAlign="middle" className="watch">
      <Checkbox checked={ !!domain.flag } onChange={ ( e, { checked } ) => onFlag( domain, checked ) } title="Watch this domain" />
      <WatchEditor domain={ domain } onChange={ onChange } />
    </TableCell>
    <TableCell data-label="Domain">
      <Segments segments={ domain.segments } name={ domain.name } />
      <a className="whois" href={ `https://www.whois.com/whois/${domain.name}` } target="_blank" rel="noopener noreferrer" title="WHOIS lookup"><Icon name="external alternate" /></a>
      { ( domain.note || null !== domain.maxBid ) && (
        <div className="note">
          { null !== domain.maxBid && <Label size="mini" basic content={ `max $${domain.maxBid.toLocaleString()}` } /> }
          { domain.note }
        </div>
      ) }
    </TableCell>
    <TableCell data-label="Score">
      { null !== domain.score && (
        <Label
          size="small"
          color={ scoreColor( domain.score ) }
          content={ domain.score }
          title={ `About ${Math.round( auctionOdds( domain.score ) * 100 )}% of released names like this sold at auction` }
        />
      ) }
    </TableCell>
    <TableCell data-label="Words" className="words">
      { domain.words.map( ( { word, kind } ) => (
        <Label key={ word } as="a" size="tiny" basic color={ KINDS[ kind ]?.color } title={ `${KINDS[ kind ]?.text} — show domains containing “${word}”` } onClick={ () => onWord( word ) } content={ word } />
      ) ) }
    </TableCell>
    <TableCell data-label="Session" title={ domain.tbr }>
      { shortDate( domain.tbr ) } <span className="relative">{ relative( domain.tbr ) }</span>
    </TableCell>
    <TableCell data-label="Added" title={ domain.added }>{ relative( domain.added ) }</TableCell>
    <TableCell data-label="Status" title={ domain.status }>
      { domain.auctioned ? `Auctioned ${shortDate( domain.auctioned )}` : domain.removed ? `Released ${shortDate( domain.removed )}` : 'To Be Released' }
    </TableCell>
  </TableRow>
  );
} );

export default DomainRow;
