import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Container,
  Table,
  TableRow,
  TableHeaderCell,
  TableHeader,
  TableFooter,
  TableCell,
  TableBody,
  Checkbox,
  Button,
  Form,
  Grid,
  GridColumn,
  Loader,
  Dimmer
} from 'semantic-ui-react';
import './semantic.js';
import './App.css';

const domainsApi = process.env.REACT_APP_BACKEND_API ?? '';

const CHUNK_SIZE = 100;
const SEARCH_DELAY = 300;

const emptyFilters = {
  domain: '',
  flag: false,
  domainLength: [],
  added: [],
  session: [],
  status: [],
  wordLength: [],
};

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'flag', label: 'Flag', textAlign: 'center' },
  { key: 'name', label: 'Domain' },
  { key: 'added', label: 'Added' },
  { key: 'tbr', label: 'Session' },
  { key: 'status', label: 'Status' },
  { key: 'words', label: 'Words' },
];

const statusOptions = [
  { key: 'tbr', text: 'To Be Released', value: 'tbr' },
  { key: 'released', text: 'Released', value: 'released' },
  { key: 'auctioned', text: 'Auctioned', value: 'auctioned' },
];

const LengthOptions = ( min, max ) => {

  min = parseInt( min, 10 ) || 2;
  max = parseInt( max, 10 ) || 6;

  if ( min > max ) {
    [ min, max]  = [ max, min ];
  }

  let options = [];
  for ( let i = min; i <= max; i++ ) {
    options.push( { key: `${i}-`, text: `${i} Letters or less`, value: `${i}-` } );
    options.push( { key: `${i}`, text: `${i} Letters`, value: `${i}` } );
    options.push( { key: `${i}+`, text: `${i} Letters or more`, value: `${i}+` } );
  }
  return options;
}

const domainLengthOptions = LengthOptions();
const wordLengthOptions = LengthOptions( 3, 8 );
const dateOptions = dates => dates.map( date => ( { key: date, text: date, value: date } ) );

const useDebouncedValue = ( value, delay ) => {
  const [ debounced, setDebounced ] = useState( value );
  useEffect( () => {
    const timer = setTimeout( () => setDebounced( value ), delay );
    return () => clearTimeout( timer );
  }, [ value, delay ] );
  return debounced;
}

// Filter + sort state as API query parameters. Offset/limit/count are added per request.
const buildQuery = ( filters, search, sort ) => {
  const params = new URLSearchParams();
  if ( 2 <= search.length ) params.set( 'q', search );
  if ( filters.flag ) params.set( 'flag', '1' );
  if ( filters.domainLength.length ) params.set( 'length', filters.domainLength.join( ',' ) );
  if ( filters.wordLength.length ) params.set( 'wordLength', filters.wordLength.join( ',' ) );
  if ( filters.added.length ) params.set( 'added', filters.added.join( ',' ) );
  if ( filters.session.length ) params.set( 'session', filters.session.join( ',' ) );
  if ( filters.status.length ) params.set( 'status', filters.status.join( ',' ) );
  if ( sort.column ) {
    params.set( 'sort', sort.column );
    params.set( 'dir', 'descending' === sort.direction ? 'desc' : 'asc' );
  }
  return params.toString();
}

const fetchJson = ( url, signal ) => fetch( url, { signal } ).then( response => {
  if ( !response.ok ) throw new Error( `${response.status} ${response.statusText}` );
  return response.json();
} );

const DomainName = ( { domain } ) => {
  if ( !domain.words ) return domain.name;
  const word = domain.words[ 0 ];
  const at = domain.name.indexOf( word );
  return <>{ domain.name.substring( 0, at ) }<strong>{ word }</strong>{ domain.name.substring( at + word.length ) }</>;
}

const DomainRow = React.memo( ( { domain, onFlag } ) => {

  let rowProps = {};
  if ( domain.removed ) {

    if ( domain.auctioned ) {
      rowProps.negative = true;
    } else {
      rowProps.warning = true;
    }

  } else if ( domain.flag ) {
    rowProps.positive = true;
  }

  return (
  <TableRow {...rowProps}>
    <TableCell data-label="ID">{ domain.id }</TableCell>
    <TableCell data-label="Flag" textAlign="center" verticalAlign="middle">
      <Checkbox checked={ !!domain.flag } onChange={ ( e, { checked } ) => onFlag( domain, checked ) } />
    </TableCell>
    <TableCell data-label="Domain"><DomainName domain={ domain } /></TableCell>
    <TableCell data-label="Added">{ domain.added }</TableCell>
    <TableCell data-label="Session">{ domain.tbr }</TableCell>
    <TableCell data-label="Status">{ domain.status }</TableCell>
    <TableCell data-label="Words">{ domain.words && domain.words.join( ', ' ) }</TableCell>
  </TableRow>
  );
} );

const App = () => {

  const [ sort, setSort ] = useState( { column: null, direction: null } ); // null = server default order
  const [ filters, setFilters ] = useState( emptyFilters );
  const [ facets, setFacets ] = useState( { added: [], session: [] } );

  const [ items, setItems ] = useState( [] );
  const [ total, setTotal ] = useState( null );
  const [ status, setStatus ] = useState( 'Initializing' );
  const [ loadingMore, setLoadingMore ] = useState( false );

  const search = useDebouncedValue( filters.domain.trim(), SEARCH_DELAY );
  const query = useMemo( () => buildQuery( filters, search, sort ), [ filters, search, sort ] );

  const controller = useRef( null );
  const sentinel = useRef( null );

  const hasMore = null !== total && items.length < total;

  // Dropdown options; cached server-side and only needed once.
  useEffect( () => {
    const abort = new AbortController();
    fetchJson( `${domainsApi}/domains/facets`, abort.signal ).then( setFacets ).catch( error => {
      if ( 'AbortError' !== error.name ) console.error( error );
    } );
    return () => abort.abort();
  }, [] );

  // First chunk (with total) whenever filters or sort change. Supersedes anything in flight.
  useEffect( () => {

    controller.current?.abort();
    const abort = controller.current = new AbortController();

    setStatus( status => 'Initializing' === status ? status : 'Loading' );
    setLoadingMore( false );

    fetchJson( `${domainsApi}/domains?${query && `${query}&`}offset=0&limit=${CHUNK_SIZE}`, abort.signal ).then( data => {
      setItems( data.items );
      setTotal( data.total );
      setStatus( 'Done' );
    } ).catch( error => {
      if ( 'AbortError' === error.name ) return;
      console.error( error );
      setStatus( 'Error' );
    } );

    return () => abort.abort();
  }, [ query ] );

  // Next chunk, appended. Skips the count query since the total is already known.
  const loadMore = useCallback( () => {

    if ( loadingMore || 'Done' !== status || !hasMore ) return;

    const abort = controller.current;
    setLoadingMore( true );

    fetchJson( `${domainsApi}/domains?${query && `${query}&`}offset=${items.length}&limit=${CHUNK_SIZE}&count=0`, abort.signal ).then( data => {
      setItems( items => items.concat( data.items ) );
      setLoadingMore( false );
    } ).catch( error => {
      if ( 'AbortError' === error.name ) return;
      console.error( error );
      setLoadingMore( false );
    } );
  }, [ loadingMore, status, hasMore, query, items.length ] );

  // Start loading before the end of the list is actually on screen.
  useEffect( () => {
    const node = sentinel.current;
    if ( !node || !hasMore || !( 'IntersectionObserver' in window ) ) return;
    const observer = new IntersectionObserver( entries => {
      if ( entries[ 0 ].isIntersecting ) loadMore();
    }, { rootMargin: '800px 0px' } );
    observer.observe( node );
    return () => observer.disconnect();
  }, [ hasMore, loadMore ] );

  const changeSort = column => setSort( sort => ( {
    column,
    direction: sort.column === column && 'ascending' === sort.direction ? 'descending' : 'ascending',
  } ) );

  const setFilter = ( key, value ) => setFilters( filters => ( { ...filters, [ key ]: value } ) );

  // Optimistic; reverts if the request fails.
  const onFlag = useCallback( ( domain, checked ) => {

    const setFlag = flag => setItems( items => items.map( d => d.id === domain.id ? { ...d, flag } : d ) );
    setFlag( checked ? 1 : 0 );

    fetch( `${domainsApi}/domains/${domain.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify( { flag: checked ? 1 : 0 } )
    } ).then( response => {
      if ( !response.ok ) throw new Error( `${response.status} ${response.statusText}` );
    } ).catch( error => {
      console.error( 'Failed to set domain flag:', error );
      setFlag( domain.flag );
    } );
  }, [] );

  const ready = 'Initializing' !== status && 'Error' !== status;

  return (
    <Container fluid className="App">
      <Grid verticalAlign="middle" columns="equal">
        <GridColumn textAlign="left"><b>TBR Check</b></GridColumn>
        {
          ready && (
          <GridColumn textAlign="right">
            <Form.Input
              icon="search"
              loading={ filters.domain.trim() !== search }
              placeholder="Search..."
              value={ filters.domain }
              onChange={ e => setFilter( 'domain', e.target.value ?? '' ) }
            />
          </GridColumn>
          )
        }
      </Grid>
      {
        ready ?
        (
        <Dimmer.Dimmable dimmed={ 'Loading' === status }>
          <Dimmer active={ 'Loading' === status } inverted verticalAlign="top">
            <Loader active inline="centered" content="Loading…" />
          </Dimmer>
          <Table sortable celled>
            <TableHeader>
              <TableRow>
                { columns.map( ( { key, label, textAlign } ) => (
                <TableHeaderCell
                  key={ key }
                  verticalAlign="top"
                  textAlign={ textAlign }
                  sorted={ sort.column === key ? sort.direction : null }
                  onClick={ () => changeSort( key ) }>{ label }</TableHeaderCell>
                ) ) }
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow style={{ backgroundColor: 'rgba( 249, 250, 251, 0.5 )' }} className="ui form filters">
                <TableCell data-label="" className="reset" verticalAlign="middle">
                  <Button basic content="Reset" onClick={ () => setFilters( emptyFilters ) } />
                </TableCell>
                <TableCell data-label="Filters" textAlign="center" verticalAlign="middle">
                  <Checkbox
                    checked={ filters.flag }
                    onChange={ ( e, { checked } ) => setFilter( 'flag', checked ) }
                  />
                </TableCell>
                <TableCell data-label="Domain" verticalAlign="middle">
                  <Form.Dropdown
                    wrapSelection={false}
                    selection multiple
                    options={ domainLengthOptions }
                    value={ filters.domainLength }
                    onChange={ ( e, { value } ) => setFilter( 'domainLength', value ) }
                  />
                </TableCell>
                <TableCell data-label="Added" verticalAlign="middle">
                  <Form.Dropdown
                    selection multiple search
                    fluid
                    options={ dateOptions( facets.added ) }
                    value={ filters.added }
                    onChange={ ( e, { value } ) => setFilter( 'added', value ) }
                  />
                </TableCell>
                <TableCell data-label="Session" verticalAlign="middle">
                  <Form.Dropdown
                    selection multiple search
                    fluid
                    options={ dateOptions( facets.session ) }
                    value={ filters.session }
                    onChange={ ( e, { value } ) => setFilter( 'session', value ) }
                  />
                </TableCell>
                <TableCell data-label="Status" verticalAlign="middle">
                  <Form.Dropdown
                    selection multiple
                    fluid
                    options={ statusOptions }
                    value={ filters.status }
                    onChange={ ( e, { value } ) => setFilter( 'status', value ) }
                  />
                </TableCell>
                <TableCell data-label="Words" verticalAlign="middle">
                  <Form.Dropdown
                    selection multiple
                    fluid
                    options={ wordLengthOptions }
                    value={ filters.wordLength }
                    onChange={ ( e, { value } ) => setFilter( 'wordLength', value ) }
                  />
                </TableCell>
              </TableRow>
              { items.map( domain => <DomainRow key={ domain.id } domain={ domain } onFlag={ onFlag } /> ) }
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableHeaderCell colSpan="7">
                  <Grid verticalAlign="middle" columns="equal">
                    <GridColumn className="pager-nav" textAlign="left">
                      <div ref={ sentinel }>
                        { loadingMore && <Loader active inline size="small" /> }
                        { !loadingMore && hasMore && <Button basic size="small" content="Load more" onClick={ loadMore } /> }
                      </div>
                    </GridColumn>
                    <GridColumn className="pager-count" textAlign="right">
                      <div>Showing { items.length.toLocaleString() } of { ( total ?? 0 ).toLocaleString() }</div>
                    </GridColumn>
                  </Grid>
                </TableHeaderCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Dimmer.Dimmable>
        )
        :
        (
        <div style={{ position: 'relative' }}>
          <Dimmer active inverted>
            {
              'Error' === status ?
              <Button basic icon="refresh" content="Couldn't load domains. Retry" onClick={ () => window.location.reload() } /> :
              <Loader indeterminate content="Initializing…"/>
            }
          </Dimmer>
          <Table celled sortable style={{ filter: 'blur(3px)' }}>
            <TableHeader>
              <TableRow>
                { columns.map( ( { key, label } ) => <TableHeaderCell key={ key } verticalAlign="top">{ label }</TableHeaderCell> ) }
              </TableRow>
            </TableHeader>
            <TableBody>
              { [ 0, 1 ].map( row => (
              <TableRow key={ row }>
                { columns.map( ( { key } ) => <TableCell key={ key }><br/>&nbsp;<br/></TableCell> ) }
              </TableRow>
              ) ) }
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableHeaderCell colSpan="7">&nbsp;</TableHeaderCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        )
      }
      <Grid verticalAlign="middle" columns="equal">
        {
          ready && null !== total && (
          <GridColumn textAlign="left">{ total.toLocaleString() } Domains</GridColumn>
          )
        }
        <GridColumn textAlign="right"><a href="https://pandymic.com">pandymic.com</a></GridColumn>
      </Grid>
    </Container>
  );
}

export default App;
