import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

const domain = id => ( {
  id,
  name: `example${id}.ca`,
  tbr: '2026-10-28',
  added: '2026-10-21 12:00:00',
  removed: null,
  auctioned: null,
  flag: 0,
  status: 'To Be Released',
  words: [ 'example' ],
} );

const respond = body => Promise.resolve( { ok: true, json: () => Promise.resolve( body ) } );

beforeEach( () => {
  global.fetch = jest.fn( url => {
    if ( url.includes( '/domains/facets' ) ) return respond( { added: [ '2026-10-21' ], session: [ '2026-10-28' ] } );
    const params = new URL( url, 'http://localhost' ).searchParams;
    const offset = parseInt( params.get( 'offset' ), 10 );
    return respond( {
      total: params.get( 'count' ) === '0' ? null : 150,
      offset,
      limit: 100,
      items: Array.from( { length: offset ? 50 : 100 }, ( _, i ) => domain( offset + i + 1 ) ),
    } );
  } );
} );

const listRequests = () => fetch.mock.calls.map( ( [ url ] ) => url ).filter( url => !url.includes( 'facets' ) );

test( 'loads the first chunk, then the rest on demand', async () => {
  render( <App /> );

  expect( await screen.findByText( 'Showing 100 of 150' ) ).toBeInTheDocument();
  expect( screen.getByText( '150 Domains' ) ).toBeInTheDocument();
  expect( listRequests()[ 0 ] ).toContain( 'offset=0&limit=100' );

  fireEvent.click( screen.getByText( 'Load more' ) );

  expect( await screen.findByText( 'Showing 150 of 150' ) ).toBeInTheDocument();
  expect( listRequests()[ 1 ] ).toContain( 'offset=100&limit=100&count=0' );
  expect( screen.queryByText( 'Load more' ) ).not.toBeInTheDocument();
} );

test( 'debounces search into a single request', async () => {
  jest.useFakeTimers();
  render( <App /> );
  await screen.findByText( 'Showing 100 of 150' );

  const input = screen.getByPlaceholderText( 'Search...' );
  fireEvent.change( input, { target: { value: 'ex' } } );
  fireEvent.change( input, { target: { value: 'exa' } } );
  await act( async () => { jest.advanceTimersByTime( 400 ); } );

  await waitFor( () => expect( listRequests() ).toHaveLength( 2 ) );
  expect( listRequests()[ 1 ] ).toContain( 'q=exa' );
  jest.useRealTimers();
} );
