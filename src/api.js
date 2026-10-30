export const API = import.meta.env.REACT_APP_BACKEND_API ?? '';

const TOKEN_KEY = 'tbr-api-token';

export const getJson = ( path, signal ) => fetch( `${API}${path}`, { signal } ).then( response => {
  if ( !response.ok ) throw new Error( `${response.status} ${response.statusText}` );
  return response.json();
} );

// Writes. If the server wants a token (see README), ask once and remember it.
export const send = async ( method, path, body, retry = true ) => {
  const response = await fetch( `${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Api-Token': localStorage.getItem( TOKEN_KEY ) ?? '' },
    body: undefined === body ? undefined : JSON.stringify( body ),
  } );
  if ( 401 === response.status && retry ) {
    const token = window.prompt( 'Editing needs the API token:' );
    if ( token ) {
      localStorage.setItem( TOKEN_KEY, token );
      return send( method, path, body, false );
    }
  }
  if ( !response.ok ) throw new Error( `${response.status} ${response.statusText}` );
  return 204 === response.status ? null : response.json();
};
