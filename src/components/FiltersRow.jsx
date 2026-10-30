import React, { useEffect, useState } from 'react';
import { Checkbox, Dropdown, TableCell, TableRow } from 'semantic-ui-react';
import { getJson } from '../api.js';
import { useDebouncedValue } from '../hooks.js';
import { KINDS } from '../format.js';

const lengthOptions = ( min, max ) => {
  const options = [];
  for ( let i = min; i <= max; i++ ) {
    options.push( { key: `${i}-`, text: `${i} letters or less`, value: `${i}-` } );
    options.push( { key: `${i}`, text: `${i} letters`, value: `${i}` } );
    options.push( { key: `${i}+`, text: `${i} letters or more`, value: `${i}+` } );
  }
  return options;
};

const domainLengthOptions = lengthOptions( 2, 6 );
const wordLengthOptions = lengthOptions( 3, 8 );
const kindOptions = Object.entries( KINDS ).map( ( [ value, { text } ] ) => ( { key: value, text, value } ) );
const scoreOptions = [ 80, 60, 40, 20 ].map( n => ( { key: n, text: `${n}+`, value: String( n ) } ) );
const statusOptions = [
  { key: 'tbr', text: 'To Be Released', value: 'tbr' },
  { key: 'released', text: 'Released', value: 'released' },
  { key: 'auctioned', text: 'Auctioned', value: 'auctioned' },
];
const dateOptions = dates => dates.map( date => ( { key: date, text: date, value: date } ) );

// Multi-select of dictionary words, searched on the server as you type.
const WordFilter = ( { value, onChange } ) => {
  const [ search, setSearch ] = useState( '' );
  const [ found, setFound ] = useState( [] );
  const prefix = useDebouncedValue( search.trim().toLowerCase(), 200 );

  useEffect( () => {
    if ( !prefix ) return setFound( [] );
    const abort = new AbortController();
    getJson( `/words?prefix=${encodeURIComponent( prefix )}&limit=15`, abort.signal ).then( setFound ).catch( () => {} );
    return () => abort.abort();
  }, [ prefix ] );

  const options = [
    ...value.map( word => ( { key: word, text: word, value: word } ) ),
    ...found.filter( w => !value.includes( w.word ) ).map( w => ( { key: w.word, text: w.word, value: w.word, description: w.domains.toLocaleString() } ) ),
  ];

  return (
    <Dropdown
      placeholder="Contains word"
      fluid multiple search selection
      options={ options }
      value={ value }
      searchQuery={ search }
      onSearchChange={ ( e, { searchQuery } ) => setSearch( searchQuery ) }
      onChange={ ( e, { value } ) => { onChange( value ); setSearch( '' ); } }
      noResultsMessage={ prefix ? 'No matching words' : 'Type to search' }
    />
  );
};

const FiltersRow = ( { filters, setFilter, facets } ) => (
  <TableRow className="ui form filters">
    <TableCell data-label="Filters" textAlign="center" verticalAlign="middle">
      <Checkbox checked={ filters.flag } label={ <label className="mobile-only">Watched only</label> } title="Watched only" onChange={ ( e, { checked } ) => setFilter( 'flag', checked ) } />
    </TableCell>
    <TableCell data-label="Domain" verticalAlign="middle">
      <Dropdown placeholder="Length" fluid selection multiple options={ domainLengthOptions } value={ filters.length } onChange={ ( e, { value } ) => setFilter( 'length', value ) } />
    </TableCell>
    <TableCell data-label="Score" verticalAlign="middle">
      <Dropdown placeholder="Any score" fluid selection clearable options={ scoreOptions } value={ filters.minScore } onChange={ ( e, { value } ) => setFilter( 'minScore', value ?? '' ) } />
      <Checkbox className="stacked" label="Real words only" checked={ filters.segmented } onChange={ ( e, { checked } ) => setFilter( 'segmented', checked ) } />
    </TableCell>
    <TableCell data-label="Words" verticalAlign="middle" className="stack">
      <WordFilter value={ filters.word } onChange={ value => setFilter( 'word', value ) } />
      <Dropdown placeholder="Word type" fluid selection multiple options={ kindOptions } value={ filters.kind } onChange={ ( e, { value } ) => setFilter( 'kind', value ) } />
      <Dropdown placeholder="Longest word" fluid selection multiple options={ wordLengthOptions } value={ filters.wordLength } onChange={ ( e, { value } ) => setFilter( 'wordLength', value ) } />
    </TableCell>
    <TableCell data-label="Session" verticalAlign="middle">
      <Dropdown placeholder="Any" fluid selection multiple search options={ dateOptions( facets.session ) } value={ filters.session } onChange={ ( e, { value } ) => setFilter( 'session', value ) } />
    </TableCell>
    <TableCell data-label="Added" verticalAlign="middle">
      <Dropdown placeholder="Any" fluid selection multiple search options={ dateOptions( facets.added ) } value={ filters.added } onChange={ ( e, { value } ) => setFilter( 'added', value ) } />
    </TableCell>
    <TableCell data-label="Status" verticalAlign="middle">
      <Dropdown placeholder="Any" fluid selection multiple options={ statusOptions } value={ filters.status } onChange={ ( e, { value } ) => setFilter( 'status', value ) } />
    </TableCell>
  </TableRow>
);

export default FiltersRow;
