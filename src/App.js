import React, { useEffect, useReducer, useState } from 'react';
import { 
  Container,
  Divider,
  Table,
  TableRow,
  TableHeaderCell,
  TableHeader,
  TableCell,
  TableBody,
  Checkbox,
  Form
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
    case 'LOAD_DATA':
      return {
        ...state,
        data: action.data
      }
    default:
      throw new Error();
  }
}

function App() {

  const [ tableState, dispatch ] = useReducer( TableReducer, {
    column: null,
    data: null,
    direction: null,
  } );

  const [searchQuery, setSearchQuery] = useState('');
  const [filterFlag, setFilterFlag] = useState( 'all' ); // null means show all
  const [filterAdded, setFilterAdded] = useState( 'all' ); // null means show all
  const [filterSession, setFilterSession] = useState( 'all' ); // null means show all
  const [filterStatus, setFilterStatus] = useState( 'all' ); // null means show all
  const [filterWordLength, setFilterWordLength] = useState( 'any' ); // null means show all

  useEffect( () => {

    fetch( `${domainsApi}/domains` ).then( ( response ) => {
      return response.json();
    } ).then( ( data ) => {
      if ( data ) {
        console.log( `Loaded from \`${domainsApi}/domains\`...` );
        dispatch({ type: 'LOAD_DATA', data: data });
      }
    } ).catch( ( error ) => {
      console.error( error );
    } );

  }, [] ); // eslint-disable-line

  const { column, data, direction } = tableState;

  return (
    <Container className="App" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
      {
        data && (
          <Table sortable celled>
            <TableHeader>
              <TableRow>
                <TableHeaderCell 
                  verticalAlign="top"
                  sorted={ column === 'flag' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'flag' } ) }>Flag</TableHeaderCell>
                <TableHeaderCell 
                  verticalAlign="top"
                  sorted={ column === 'id' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'id' } ) }>ID</TableHeaderCell>
                <TableHeaderCell 
                  verticalAlign="top"
                  sorted={ column === 'name' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'name' } ) }>Domain</TableHeaderCell>
                <TableHeaderCell 
                  verticalAlign="top"
                  sorted={ column === 'added' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'added' } ) }>Added</TableHeaderCell>
                <TableHeaderCell 
                  verticalAlign="top"
                  sorted={ column === 'tbr' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'tbr' } ) }>Session</TableHeaderCell>
                <TableHeaderCell 
                  verticalAlign="top"
                  sorted={ column === 'status' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'status' } ) }>Status</TableHeaderCell>
                <TableHeaderCell 
                  verticalAlign="top"
                  sorted={ column === 'words' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'words' } ) }>Words</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Form.Dropdown
                    options={[
                      { key: 'all', text: 'All', value: 'all' },
                      { key: 'flagged', text: '☑', value: 1 },
                      { key: 'unflagged', text: '☐', value: 0 },
                    ]}
                    value={filterFlag}
                    onChange={(e, { value }) => setFilterFlag(value)}
                  />
                </TableCell>
                <TableCell></TableCell>
                <TableCell>
                  <Form.Input
                    icon="search"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Form.Dropdown
                    options={( () => {
                      const options = [ { key: 'all', text: 'All', value: 'all' } ];
                      data.forEach( domain => {
                        const value = domain.added.substring( 0, 10 );
                        const option = { key: value, text: value, value: value };
                        if ( !options.find( o => o.value === value ) ) options.push( option );
                      } );
                      return options;
                    } )()}
                    value={filterAdded}
                    onChange={(e, { value }) => setFilterAdded(value)}
                  />
                </TableCell>
                <TableCell>
                  <Form.Dropdown
                    options={( () => {
                      const options = [ { key: 'all', text: 'All', value: 'all' } ];
                      data.forEach( domain => {
                        const option = { key: domain.tbr, text: domain.tbr, value: domain.tbr };
                        if ( !options.find( o => o.value === domain.tbr ) ) options.push( option );
                      } );
                      return options;
                    } )()}
                    value={filterSession}
                    onChange={(e, { value }) => setFilterSession(value)}
                  />
                </TableCell>
                <TableCell>
                  <Form.Dropdown
                    options={[
                      { key: 'all', text: 'All', value: 'all' },
                      { key: 'tbr', text: 'To Be Released', value: 'To Be Released' },
                      { key: 'released', text: 'Released', value: 'Released' },
                      { key: 'auctioned', text: 'Auctioned', value: 'Auctioned' },
                    ]}
                    value={filterStatus}
                    onChange={(e, { value }) => setFilterStatus(value)}
                  />
                </TableCell>
                <TableCell>
                  <Form.Dropdown
                    options={[
                      { key: 'any', text: 'Any Length', value: 'any' },
                      { key: '3', text: '3 Letters', value: '3' },
                      { key: '4', text: '4 Letters', value: '4' },
                      { key: '5', text: '5 Letters', value: '5' },
                      { key: '6+', text: 'Over 5 Letters', value: '6+' },
                    ]}
                    value={filterWordLength}
                    onChange={(e, { value }) => setFilterWordLength(value)}
                  />
                </TableCell>
              </TableRow>
            {
              data.filter( ( domain ) => {

                if (searchQuery && !domain.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                  return false;
                }
                if (filterFlag !== 'all' && domain.flag !== filterFlag) {
                  return false;
                }
                if (filterAdded !== 'all' && 0 !== domain.added.indexOf( filterAdded )) {
                  return false;
                }
                if (filterSession !== 'all' && domain.tbr !== filterSession) {
                  return false;
                }
                if (filterStatus !== 'all' && 0 !== domain.status.indexOf( filterStatus ) ) {
                  return false;
                }
                if (filterWordLength !== 'any' ) {

                  if ( !domain.words ) return false;
                  
                  if ( filterWordLength === '6+' && 6 > domain.words[0].length ) return false;
                  if ( parseInt( filterWordLength ) !== domain.words[0].length ) return false;
                }

                return true;
              } ).map( ( domain ) => {

                let displayName = domain.name;
                if ( domain.words ) {
                  displayName = [
                    domain.name.substring( 0, domain.name.indexOf( domain.words[ 0 ] ) ),
                    ( <strong>{ domain.words[ 0 ] }</strong>),
                    domain.name.substring( domain.name.indexOf( domain.words[ 0 ] ) + domain.words[ 0 ].length )
                  ];
                }

                return (
                  <TableRow key={ domain.id }>
                    <TableCell>
                      <Checkbox checked={ domain.flag ? true : false } onChange={ ( event, props ) =>  {

                        const domainUpdated = { ...domain, flag: props.checked ? 1 : 0 };

                        fetch(`${domainsApi}/domains/${domain.id}`, {
                          method: 'PUT',
                          headers: {
                              'Content-Type': 'application/json'
                          },
                          body: JSON.stringify( domainUpdated )
                        } ).then(response => {
                          if (response.ok) {

                              console.log("Domain flag updated");
                              dispatch({ type: 'LOAD_DATA', data: data.map( d => 
                                d.id === domain.id ? domainUpdated : d
                              ) } );
                      
                          } else {
                            console.error("Failed to update domain flag:", response.status, response.statusText);
                            props.checked = !props.checked; // Revert checkbox if update fails
                          }
                        } ).catch(error => {
                          console.error("Error updating domain flag:", error);
                          props.checked = !props.checked; // Revert checkbox on network error
                        } );

                      } } />
                    </TableCell>
                    <TableCell>{ domain.id }</TableCell>
                    <TableCell>{ displayName }</TableCell>
                    <TableCell>{ domain.added }</TableCell>
                    <TableCell>{ domain.tbr }</TableCell>
                    <TableCell>{ domain.status }</TableCell>
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
