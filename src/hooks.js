import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson } from './api.js';

export const CHUNK_SIZE = 100;

export const useDebouncedValue = ( value, delay ) => {
  const [ debounced, setDebounced ] = useState( value );
  useEffect( () => {
    const timer = setTimeout( () => setDebounced( value ), delay );
    return () => clearTimeout( timer );
  }, [ value, delay ] );
  return debounced;
};

const ignoreAbort = error => {
  if ( 'AbortError' !== error.name ) throw error;
};

// Domain rows for a query, loaded in chunks. Changing the query aborts anything in flight;
// follow-up chunks skip the count since the total is already known.
export const useDomains = query => {

  const [ items, setItems ] = useState( [] );
  const [ total, setTotal ] = useState( null );
  const [ status, setStatus ] = useState( 'Initializing' );
  const [ loadingMore, setLoadingMore ] = useState( false );
  const controller = useRef( null );

  useEffect( () => {
    controller.current?.abort();
    const abort = controller.current = new AbortController();
    setStatus( status => 'Initializing' === status ? status : 'Loading' );
    setLoadingMore( false );
    getJson( `/domains?${query && `${query}&`}offset=0&limit=${CHUNK_SIZE}`, abort.signal ).then( data => {
      setItems( data.items );
      setTotal( data.total );
      setStatus( 'Done' );
    } ).catch( ignoreAbort ).catch( error => {
      console.error( error );
      setStatus( 'Error' );
    } );
    return () => abort.abort();
  }, [ query ] );

  const hasMore = null !== total && items.length < total;

  const loadMore = useCallback( () => {
    if ( loadingMore || 'Done' !== status || !hasMore ) return;
    setLoadingMore( true );
    getJson( `/domains?${query && `${query}&`}offset=${items.length}&limit=${CHUNK_SIZE}&count=0`, controller.current.signal ).then( data => {
      setItems( items => items.concat( data.items ) );
      setLoadingMore( false );
    } ).catch( ignoreAbort ).catch( error => {
      console.error( error );
      setLoadingMore( false );
    } );
  }, [ loadingMore, status, hasMore, query, items.length ] );

  const updateItem = useCallback( ( id, changes ) => {
    setItems( items => items.map( item => item.id === id ? { ...item, ...changes } : item ) );
  }, [] );

  return { items, total, status, loadingMore, hasMore, loadMore, updateItem };
};

// Upcoming / released / auctioned counts for the current filters.
export const useStats = query => {
  const [ stats, setStats ] = useState( null );
  useEffect( () => {
    const abort = new AbortController();
    getJson( `/domains/stats?${query}`, abort.signal ).then( setStats ).catch( ignoreAbort ).catch( error => console.error( error ) );
    return () => abort.abort();
  }, [ query ] );
  return stats;
};

// Calls back when the element scrolls within 800px of the viewport.
export const useNearViewport = ( callback, enabled ) => {
  const ref = useRef( null );
  useEffect( () => {
    const node = ref.current;
    if ( !node || !enabled || !( 'IntersectionObserver' in window ) ) return;
    const observer = new IntersectionObserver( entries => {
      if ( entries[ 0 ].isIntersecting ) callback();
    }, { rootMargin: '800px 0px' } );
    observer.observe( node );
    return () => observer.disconnect();
  }, [ callback, enabled ] );
  return ref;
};
