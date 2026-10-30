import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Container,
  Dimmer,
  Input,
  Loader,
  Table,
  TableBody,
  TableFooter,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from 'semantic-ui-react';
import { API, getJson, send } from './api.js';
import { buildQuery, countFilters, DEFAULT_QUERY, parseQuery } from './query.js';
import { useDomains, useNearViewport, useStats } from './hooks.js';
import DomainRow from './components/DomainRow.jsx';
import FiltersRow from './components/FiltersRow.jsx';
import Views from './components/Views.jsx';
import Alerts from './components/Alerts.jsx';
import Logo from './components/Logo.jsx';
import './App.css';

const SEARCH_DELAY = 300;

const columns = [
  { key: 'flag', label: 'Watch', textAlign: 'center' },
  { key: 'name', label: 'Domain' },
  { key: 'score', label: 'Score' },
  { key: 'words', label: 'Words' },
  { key: 'tbr', label: 'Session' },
  { key: 'added', label: 'Added' },
  { key: 'status', label: 'Status' },
];

const fromLocation = () => parseQuery( window.location.search.slice( 1 ) || DEFAULT_QUERY );

const StatsBar = ( { stats } ) => {
  if ( !stats ) return <div className="stats">&nbsp;</div>;
  const past = stats.released + stats.auctioned;
  return (
    <div className="stats">
      <span><b>{ stats.upcoming.toLocaleString() }</b> upcoming</span>
      <span><b>{ stats.released.toLocaleString() }</b> released</span>
      <span><b>{ stats.auctioned.toLocaleString() }</b> auctioned</span>
      { past > 0 && <span title="Share of released domains matching these filters that sold at auction"><b>{ ( stats.auctionRate * 100 ).toFixed( 1 ) }%</b> auction rate</span> }
    </div>
  );
};

const App = () => {

  const initial = useMemo( fromLocation, [] );
  const [ filters, setFilters ] = useState( initial.filters );
  const [ sort, setSort ] = useState( initial.sort );
  // Search text applied to the query; trails the input by SEARCH_DELAY.
  const [ search, setSearch ] = useState( initial.filters.q );
  const [ facets, setFacets ] = useState( { added: [], session: [] } );
  const [ showFilters, setShowFilters ] = useState( false );

  const query = useMemo( () => buildQuery( filters, sort, search ), [ filters, sort, search ] );
  const { items, total, status, loadingMore, hasMore, loadMore, updateItem } = useDomains( query );
  const stats = useStats( query );
  const sentinel = useNearViewport( loadMore, hasMore );

  useEffect( () => {
    const timer = setTimeout( () => setSearch( filters.q ), SEARCH_DELAY );
    return () => clearTimeout( timer );
  }, [ filters.q ] );

  // Keep the URL in step so views can be bookmarked and the back button works.
  useEffect( () => {
    if ( window.location.search.slice( 1 ) !== query ) window.history.pushState( null, '', `?${query}` );
  }, [ query ] );

  const apply = useCallback( queryString => {
    const next = parseQuery( queryString );
    setFilters( next.filters );
    setSort( next.sort );
    setSearch( next.filters.q );
  }, [] );

  useEffect( () => {
    const onPop = () => apply( window.location.search.slice( 1 ) || DEFAULT_QUERY );
    window.addEventListener( 'popstate', onPop );
    return () => window.removeEventListener( 'popstate', onPop );
  }, [ apply ] );

  useEffect( () => {
    const abort = new AbortController();
    getJson( '/domains/facets', abort.signal ).then( setFacets ).catch( () => {} );
    return () => abort.abort();
  }, [] );

  const setFilter = useCallback( ( key, value ) => setFilters( filters => ( { ...filters, [ key ]: value } ) ), [] );

  const addWord = useCallback( word => setFilters( filters => filters.word.includes( word ) ? filters : { ...filters, word: [ ...filters.word, word ] } ), [] );

  const changeSort = column => setSort( sort => ( {
    column,
    direction: sort.column === column ? ( 'ascending' === sort.direction ? 'descending' : 'ascending' ) : ( [ 'score', 'flag', 'added', 'words' ].includes( column ) ? 'descending' : 'ascending' ),
  } ) );

  // Optimistic; reverts if the request fails.
  const onFlag = useCallback( ( domain, checked ) => {
    updateItem( domain.id, { flag: checked ? 1 : 0 } );
    send( 'PATCH', `/domains/${domain.id}`, { flag: checked ? 1 : 0 } ).catch( error => {
      console.error( 'Failed to set domain flag:', error );
      updateItem( domain.id, { flag: domain.flag } );
    } );
  }, [ updateItem ] );

  const ready = 'Initializing' !== status && 'Error' !== status;
  const activeFilters = countFilters( filters );

  return (
    <Container fluid className={ `App${ showFilters ? ' filters-open' : '' }` }>
      <header className="toolbar">
        <Logo />
        <div className="actions">
          <Views query={ query } onApply={ apply } />
          <Button basic inverted icon="undo" content="Reset" title="Back to upcoming, best first" onClick={ () => apply( DEFAULT_QUERY ) } />
          <Button basic inverted className="mobile-only" icon="filter" content={ `Filters${ activeFilters ? ` (${activeFilters})` : '' }` } active={ showFilters } onClick={ () => setShowFilters( show => !show ) } />
          <Button basic inverted icon="download" content="CSV" title="Export this view (up to 10,000 rows)" as="a" href={ `${API}/domains/export.csv?${query}` } />
          <Alerts onApply={ apply } />
          <Input
            className="search"
            inverted
            transparent
            icon="search"
            loading={ filters.q !== search }
            placeholder="Search..."
            value={ filters.q }
            onChange={ e => setFilter( 'q', e.target.value ?? '' ) }
          />
        </div>
      </header>
      <StatsBar stats={ stats } />
      {
        ready ?
        (
        <Dimmer.Dimmable dimmed={ 'Loading' === status }>
          <Dimmer active={ 'Loading' === status } inverted verticalAlign="top">
            <Loader active inline="centered" content="Loading…" />
          </Dimmer>
          <Table sortable celled className="domains">
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
              <FiltersRow filters={ filters } setFilter={ setFilter } facets={ facets } />
              { items.map( domain => <DomainRow key={ domain.id } domain={ domain } onFlag={ onFlag } onChange={ updateItem } onWord={ addWord } /> ) }
              { !items.length && (
                <TableRow><td colSpan={ columns.length } className="empty">No domains match these filters.</td></TableRow>
              ) }
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableHeaderCell colSpan={ columns.length }>
                  <div className="pager">
                    <div ref={ sentinel }>
                      { loadingMore && <Loader active inline size="small" /> }
                      { !loadingMore && hasMore && <Button basic size="small" content="Load more" onClick={ loadMore } /> }
                    </div>
                    <div>Showing { items.length.toLocaleString() } of { ( total ?? 0 ).toLocaleString() }</div>
                  </div>
                </TableHeaderCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Dimmer.Dimmable>
        )
        :
        (
        <div className="placeholder">
          {
            'Error' === status ?
            <Button basic icon="refresh" content="Couldn't load domains. Retry" onClick={ () => window.location.reload() } /> :
            <Loader active indeterminate content="Initializing…" />
          }
        </div>
        )
      }
      <footer className="footer">
        <span>{ ready && null !== total && `${total.toLocaleString()} domains` }</span>
        <a href="https://pandymic.com">pandymic.com</a>
      </footer>
    </Container>
  );
};

export default App;
