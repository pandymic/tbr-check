// Filters + sort <-> query string. The same string is used for the page URL,
// API requests and saved views.

export const DEFAULT_QUERY = 'status=tbr&sort=score&dir=desc';

export const emptyFilters = {
  q: '',
  flag: false,
  segmented: false,
  minScore: '',
  length: [],
  wordLength: [],
  kind: [],
  word: [],
  added: [],
  session: [],
  status: [],
};

const LISTS = [ 'length', 'wordLength', 'kind', 'word', 'added', 'session', 'status' ];

export const parseQuery = search => {
  const params = new URLSearchParams( search );
  const filters = { ...emptyFilters };
  filters.q = params.get( 'q' ) ?? '';
  filters.flag = '1' === params.get( 'flag' );
  filters.segmented = '1' === params.get( 'segmented' );
  filters.minScore = params.get( 'minScore' ) ?? '';
  LISTS.forEach( key => { filters[ key ] = ( params.get( key ) ?? '' ).split( ',' ).filter( Boolean ); } );
  const column = params.get( 'sort' ) || null;
  const sort = { column, direction: column ? ( 'desc' === params.get( 'dir' ) ? 'descending' : 'ascending' ) : null };
  return { filters, sort };
};

export const buildQuery = ( filters, sort, search = filters.q ) => {
  const params = new URLSearchParams();
  if ( 2 <= search.trim().length ) params.set( 'q', search.trim() );
  if ( filters.flag ) params.set( 'flag', '1' );
  if ( filters.segmented ) params.set( 'segmented', '1' );
  if ( '' !== filters.minScore ) params.set( 'minScore', filters.minScore );
  LISTS.forEach( key => { if ( filters[ key ].length ) params.set( key, filters[ key ].join( ',' ) ); } );
  if ( sort.column ) {
    params.set( 'sort', sort.column );
    params.set( 'dir', 'descending' === sort.direction ? 'desc' : 'asc' );
  }
  return params.toString();
};

// Number of active filters, for the mobile "Filters" toggle.
export const countFilters = filters => [ filters.flag, filters.segmented, '' !== filters.minScore, ...LISTS.map( key => filters[ key ].length > 0 ) ].filter( Boolean ).length;
