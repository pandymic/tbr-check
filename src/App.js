import React, { useEffect, useState, useReducer } from 'react';
import { 
  Container,
  Table,
  TableRow,
  TableHeaderCell,
  TableHeader,
  TableCell,
  TableBody,
  Checkbox
} from 'semantic-ui-react';
import _ from 'lodash';
import 'semantic-ui-css/semantic.min.css'

const domainsApi = process.env.REACT_APP_BACKEND_API ?? '';

function TableReducer( state, action) {
  switch ( action.type ) {
    case 'CHANGE_SORT':

      if ( state.column === action.column ) {
        return {
          ...state,
          data: state.data.slice().reverse(),
          direction: state.direction === 'ascending' ? 'descending' : 'ascending',
        }
      }

      return {
        column: action.column,
        data: _.sortBy( state.data, [ action.column ] ),
        direction: 'ascending',
      }
    default:
      throw new Error();
  }
}

function App() {

  const [ domains, setDomains ] = useState( null );

  useEffect( () => {

    fetch( `${domainsApi}/domains` ).then( ( response ) => {
      return response.json();
    } ).then( ( data ) => {
      if ( data ) {
        console.log( `Loaded from \`${domainsApi}/domains\`...` );
        setDomains( data );
      }
    } ).catch( ( error ) => {
      console.error( error );
      if ( !domains ) {
        console.log( `Loaded from demo...` );
        setDomains( JSON.parse( process.env.REACT_APP_DEMO_DATA ) );
      }
    } );

  }, [] ); // eslint-disable-line

  const [ tableState, dispatch ] = useReducer( TableReducer, {
    column: null,
    data: domains,
    direction: null,
  } );

  useEffect( () => {
    console.log( 'Domains updated...' );
    if ( domains ) {
      tableState.data = domains;
    }
  }, [ domains ] ); // eslint-disable-line

  const { column, data, direction } = tableState;

  return (
    <Container className="App">
      {
        data && (
          <Table sortable celled>
            <TableHeader>
              <TableRow>
                <TableHeaderCell 
                  sorted={ column === 'flag' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'flag' } ) }>Flag</TableHeaderCell>
                <TableHeaderCell 
                  sorted={ column === 'id' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'id' } ) }>ID</TableHeaderCell>
                <TableHeaderCell 
                  sorted={ column === 'name' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'name' } ) }>Domain</TableHeaderCell>
                <TableHeaderCell 
                  sorted={ column === 'added' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'added' } ) }>Added</TableHeaderCell>
                <TableHeaderCell 
                  sorted={ column === 'words' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'words' } ) }>Words</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
            {
              data.filter( ( domain ) => {
                return domain.words?.length ?? false;
              } ).map( ( domain ) => {

                let displayName = [
                  domain.name.substring( 0, domain.name.indexOf( domain.words[ 0 ] ) ),
                  ( <strong>{ domain.words[ 0 ] }</strong>),
                  domain.name.substring( domain.name.indexOf( domain.words[ 0 ] ) + domain.words[ 0 ].length )
                ]

                console.log( domain.name, displayName );


                return (
                  <TableRow key={ domain.id }>
                    <TableCell>
                      <Checkbox checked={ domain.flag } onChange={ ( event, data ) => {

                        const domainUpdated = { ...domain, flag: data.checked ? 1 : 0 };

                        fetch(`${domainsApi}/domains/${domain.id}`, {
                          method: 'PUT',
                          headers: {
                              'Content-Type': 'application/json'
                          },
                          body: JSON.stringify( domainUpdated )
                        } ).then(response => {
                          if (response.ok) {

                              console.log("Domain flag updated");
                              setDomains( domains => domains.map(d => 
                                d.id === domain.id ? domainUpdated : d
                              ) );
                      
                          } else {
                            console.error("Failed to update domain flag:", response.status, response.statusText);
                            data.checked = !data.checked; // Revert checkbox if update fails
                          }
                        } ).catch(error => {
                          console.error("Error updating domain flag:", error);
                          data.checked = !data.checked; // Revert checkbox on network error
                        } );

                      } }toggle />
                    </TableCell>
                    <TableCell>{ domain.id }</TableCell>
                    <TableCell>{ displayName }</TableCell>
                    <TableCell>{ domain.added }</TableCell>
                    <TableCell>{ domain.words && domain.words.join( ', ' ) }</TableCell>
                  </TableRow>
                );
              } )
            }
            </TableBody>
          </Table>
        )
      }
    </Container>
  );
}

export default App;
