import React, { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, Dropdown, Form, Icon, Modal } from 'semantic-ui-react';
import { getJson, send } from '../api.js';
import { DEFAULT_QUERY } from '../query.js';

export const PRESETS = [
  { key: 'upcoming', text: 'Upcoming — best first', query: DEFAULT_QUERY },
  { key: 'words', text: 'Upcoming — real words', query: 'status=tbr&segmented=1&sort=score&dir=desc' },
  { key: 'short', text: 'Upcoming — 4 letters or less', query: 'status=tbr&length=4-&sort=score&dir=desc' },
  { key: 'watch', text: 'Watchlist', query: 'flag=1&sort=tbr&dir=desc' },
  { key: 'sold', text: 'Recently auctioned', query: 'status=auctioned&sort=status&dir=asc' },
  { key: 'all', text: 'Everything', query: 'status=tbr,released,auctioned' },
];

// Preset and saved views, and saving the current one (optionally with alerts for new matches).
const Views = ( { query, onApply } ) => {
  const [ saved, setSaved ] = useState( [] );
  const [ saving, setSaving ] = useState( false );
  const [ name, setName ] = useState( '' );
  const [ alert, setAlert ] = useState( true );

  const load = useCallback( () => getJson( '/searches' ).then( setSaved ).catch( error => console.error( error ) ), [] );
  useEffect( () => { load(); }, [ load ] );

  const save = () => {
    send( 'POST', '/searches', { name, query, alert } ).then( () => {
      setSaving( false );
      setName( '' );
      load();
    } ).catch( error => console.error( error ) );
  };

  const toggleAlert = ( e, search ) => {
    e.stopPropagation();
    send( 'PATCH', `/searches/${search.id}`, { alert: !search.alert } ).then( load ).catch( error => console.error( error ) );
  };

  const remove = ( e, search ) => {
    e.stopPropagation();
    if ( window.confirm( `Delete the saved view “${search.name}”?` ) ) send( 'DELETE', `/searches/${search.id}` ).then( load ).catch( error => console.error( error ) );
  };

  const current = [ ...PRESETS, ...saved ].find( view => view.query === query );

  return (
    <>
      <Dropdown button basic className="icon views" labeled icon="bookmark outline" text={ current ? ( current.text ?? current.name ) : 'Views' } scrolling>
        <Dropdown.Menu>
          <Dropdown.Header content="Presets" />
          { PRESETS.map( preset => <Dropdown.Item key={ preset.key } text={ preset.text } active={ preset.query === query } onClick={ () => onApply( preset.query ) } /> ) }
          <Dropdown.Divider />
          <Dropdown.Header content="Saved" />
          { saved.length ? saved.map( search => (
            <Dropdown.Item key={ search.id } active={ search.query === query } onClick={ () => onApply( search.query ) }>
              <Icon link name={ search.alert ? 'bell' : 'bell slash outline' } title={ search.alert ? 'Alerts on' : 'Alerts off' } onClick={ e => toggleAlert( e, search ) } />
              { search.name }
              <Icon link name="trash alternate outline" className="right floated" title="Delete" onClick={ e => remove( e, search ) } />
            </Dropdown.Item>
          ) ) : <Dropdown.Item disabled text="Nothing saved yet" /> }
          <Dropdown.Divider />
          <Dropdown.Item icon="plus" text="Save current view…" onClick={ () => setSaving( true ) } />
        </Dropdown.Menu>
      </Dropdown>
      <Modal size="tiny" open={ saving } onClose={ () => setSaving( false ) }>
        <Modal.Header>Save current view</Modal.Header>
        <Modal.Content>
          <Form onSubmit={ save } id="save-view">
            <Form.Input label="Name" autoFocus value={ name } onChange={ ( e, { value } ) => setName( value ) } />
            <Form.Field>
              <Checkbox toggle label="Alert me when new domains match" checked={ alert } onChange={ ( e, { checked } ) => setAlert( checked ) } />
            </Form.Field>
          </Form>
        </Modal.Content>
        <Modal.Actions>
          <Button content="Cancel" onClick={ () => setSaving( false ) } />
          <Button primary content="Save" type="submit" form="save-view" disabled={ !name.trim() } />
        </Modal.Actions>
      </Modal>
    </>
  );
};

export default Views;
