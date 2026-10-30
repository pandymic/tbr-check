import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from './App.jsx';
import { buildQuery, DEFAULT_QUERY, parseQuery } from './query.js';
import { auctionOdds, relative } from './format.js';

const domain = id => ( {
  id,
  name: `example${id}.ca`,
  tbr: '2026-11-04',
  added: '2026-10-30 00:57:23',
  removed: null,
  auctioned: null,
  status: 'To Be Released',
  flag: 0,
  note: null,
  maxBid: null,
  score: 80,
  segmented: false,
  segments: `example|~${id}`,
  words: [ { word: 'example', kind: 'common' } ],
} );

const respond = body => Promise.resolve( { ok: true, status: 200, json: () => Promise.resolve( body ) } );

beforeEach( () => {
  window.history.replaceState( null, '', '/' );
  global.fetch = vi.fn( url => {
    const { pathname, searchParams } = new URL( url, 'http://localhost' );
    if ( pathname.endsWith( '/facets' ) ) return respond( { added: [ '2026-10-30' ], session: [ '2026-11-04' ] } );
    if ( pathname.endsWith( '/stats' ) ) return respond( { upcoming: 150, released: 900, auctioned: 100, auctionRate: 0.1 } );
    if ( pathname.endsWith( '/searches' ) ) return respond( [] );
    if ( pathname.endsWith( '/alerts' ) ) return respond( { unseen: 0, items: [] } );
    const offset = parseInt( searchParams.get( 'offset' ), 10 );
    return respond( {
      total: '0' === searchParams.get( 'count' ) ? null : 150,
      offset,
      limit: 100,
      items: Array.from( { length: offset ? 50 : 100 }, ( _, i ) => domain( offset + i + 1 ) ),
    } );
  } );
} );

afterEach( () => {
  cleanup();
  vi.useRealTimers();
} );

const listRequests = () => fetch.mock.calls.map( ( [ url ] ) => url ).filter( url => /\/domains\?/.test( url ) );

test( 'opens on upcoming domains, best first, and loads the rest on demand', async () => {
  render( <App /> );

  expect( await screen.findByText( 'Showing 100 of 150' ) ).toBeInTheDocument();
  expect( listRequests()[ 0 ] ).toContain( `${DEFAULT_QUERY}&offset=0&limit=100` );
  expect( window.location.search ).toBe( `?${DEFAULT_QUERY}` );
  expect( screen.getByText( '10.0%' ) ).toBeInTheDocument();

  fireEvent.click( screen.getByText( 'Load more' ) );

  expect( await screen.findByText( 'Showing 150 of 150' ) ).toBeInTheDocument();
  expect( listRequests()[ 1 ] ).toContain( 'offset=100&limit=100&count=0' );
} );

test( 'debounces search into a single request and keeps it in the URL', async () => {
  vi.useFakeTimers( { shouldAdvanceTime: true } );
  render( <App /> );
  await screen.findByText( 'Showing 100 of 150' );

  const input = screen.getByPlaceholderText( 'Search...' );
  fireEvent.change( input, { target: { value: 'ex' } } );
  fireEvent.change( input, { target: { value: 'exa' } } );
  await act( async () => { vi.advanceTimersByTime( 400 ); } );

  await waitFor( () => expect( listRequests() ).toHaveLength( 2 ) );
  expect( listRequests()[ 1 ] ).toContain( 'q=exa' );
  expect( window.location.search ).toContain( 'q=exa' );
} );

test( 'clicking a word filters by it', async () => {
  render( <App /> );
  await screen.findByText( 'Showing 100 of 150' );

  fireEvent.click( screen.getAllByText( 'example', { selector: 'a' } )[ 0 ] );

  await waitFor( () => expect( listRequests().at( -1 ) ).toContain( 'word=example' ) );
} );

test( 'query strings round-trip', () => {
  const query = 'q=shop&flag=1&segmented=1&minScore=60&length=4-%2C6&kind=tech%2Cplace&word=app&status=tbr&sort=score&dir=desc';
  const { filters, sort } = parseQuery( query );
  expect( filters.length ).toEqual( [ '4-', '6' ] );
  expect( sort ).toEqual( { column: 'score', direction: 'descending' } );
  expect( buildQuery( filters, sort ) ).toBe( query );
} );

test( 'formats relative dates and auction odds', () => {
  const now = new Date( 2026, 9, 30, 12 );
  expect( relative( '2026-11-04', now ) ).toBe( 'in 5 days' );
  expect( relative( '2026-10-29', now ) ).toBe( 'yesterday' );
  expect( relative( '2026-10-30 09:00:00', now ) ).toBe( '3 hours ago' );
  expect( auctionOdds( 80 ) ).toBeCloseTo( 0.398, 2 );
  expect( auctionOdds( 50 ) ).toBeCloseTo( 0.1, 3 );
} );
