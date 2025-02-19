import React, { useEffect, useReducer, useState } from 'react';
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
  Form
} from 'semantic-ui-react';
import _ from 'lodash';
import 'semantic-ui-css/semantic.min.css'
import './App.css';


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
  const [filterNameLength, setFilterNameLength] = useState( 'any' );
  const [filterFlag, setFilterFlag] = useState( false );
  const [filterAdded, setFilterAdded] = useState( 'all' );
  const [filterSession, setFilterSession] = useState( 'all' );
  const [filterStatus, setFilterStatus] = useState( 'all' );
  const [filterWordLength, setFilterWordLength] = useState( 'any' );

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
  
  let domainsCount = data?.length ?? 0;

  return (
    <Container className="App">
      {
        data && (
          <Table sortable celled>
            <TableHeader>
              <TableRow>
                <TableHeaderCell 
                  verticalAlign="top"
                  sorted={ column === 'id' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'id' } ) }>ID</TableHeaderCell>
                <TableHeaderCell 
                  verticalAlign="top"
                  textAlign="center" 
                  sorted={ column === 'flag' ? direction : null } 
                  onClick={ () => dispatch( { type: 'CHANGE_SORT', column: 'flag' } ) }>Flag</TableHeaderCell>
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
              <TableRow style={{ backgroundColor: 'rgba( 249, 250, 251, 0.5 )' }} className="ui form small filters">
                <TableCell verticalAlign="middle">
                  <Button basic content="Reset"
                    size="small"
                    onClick={ () => {
                      setSearchQuery('');
                      setFilterNameLength('any');
                      setFilterFlag(false);
                      setFilterAdded('all');
                      setFilterSession('all');
                      setFilterStatus('all');
                      setFilterWordLength('any');
                    } }
                  />
                </TableCell>
                <TableCell textAlign="center" verticalAlign="middle">
                  <Checkbox
                    checked={filterFlag}
                    onChange={(e, { checked }) => setFilterFlag( checked )}
                  />
                </TableCell>
                <TableCell verticalAlign="middle">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.78571429em' }}>
                    <Form.Input
                      size="small"
                      icon="search"
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <Form.Dropdown
                      wrapSelection={false}
                      selection
                      compact
                      options={[
                        { key: 'any', text: 'Any Length', value: 'any' },
                        { key: '3', text: '3 Letters', value: '3' },
                        { key: '3+', text: '3+ Letters', value: '3+' },
                        { key: '4', text: '4 Letters', value: '4' },
                        { key: '4+', text: '4+ Letters', value: '4+' },
                        { key: '5', text: '5 Letters', value: '5' },
                        { key: '5+', text: '5+ Letters', value: '5+' },
                        { key: '6+', text: 'Over 5 Letters', value: '6+' },
                      ]}
                      value={filterNameLength}
                      onChange={(e, { value }) => setFilterNameLength(value)}
                    />
                  </div>
                </TableCell>
                <TableCell verticalAlign="middle">
                  <Form.Dropdown
                    selection
                    fluid
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
                <TableCell verticalAlign="middle">
                  <Form.Dropdown
                    selection
                    fluid
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
                <TableCell verticalAlign="middle">
                  <Form.Dropdown
                    selection
                    fluid
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
                <TableCell verticalAlign="middle">
                  <Form.Dropdown
                    selection
                    fluid
                    options={[
                      { key: 'any', text: 'Any Length', value: 'any' },
                      { key: '3', text: '3 Letters', value: '3' },
                      { key: '3+', text: '3+ Letters', value: '3+' },
                      { key: '4', text: '4 Letters', value: '4' },
                      { key: '4+', text: '4+ Letters', value: '4+' },
                      { key: '5', text: '5 Letters', value: '5' },
                      { key: '5+', text: '5+ Letters', value: '5+' },
                      { key: '6+', text: 'Over 5 Letters', value: '6+' },
                    ]}
                    value={filterWordLength}
                    onChange={(e, { value }) => setFilterWordLength(value)}
                  />
                </TableCell>
              </TableRow>
            {
              ( () => {
                const dataVisible = data.filter( ( domain ) => {

                  if ( searchQuery && 2 <= searchQuery.length && !domain.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                    return false;
                  }
                  if ( filterNameLength !== 'any' ) {
  
                    const filterLength = parseInt(filterNameLength, 10) + 3;
                    
                    if (filterNameLength.includes('+')) {
                      if (domain.name.length < filterLength) return false;
                    } else if (domain.name.length !== filterLength) {
                      return false;
                    }
                  }
                  if (filterFlag !== false && domain.flag !== 1 ) {
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
  
                    if (!domain.words || domain.words.length === 0) return false;

                    const firstWordLength = domain.words[0].length;
                    const filterLength = parseInt(filterWordLength, 10);
                    
                    if (filterWordLength.includes('+')) {
                      if (firstWordLength < filterLength) return false;
                    } else if (firstWordLength !== filterLength) {
                      return false;
                    }
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

                  let rowProps = {};
                  if ( domain.removed) {

                    if ( domain.auctioned ) {
                      rowProps.negative = true;
                    } else {
                      rowProps.warning = true;
                    }

                  } else if ( domain.flag ) {
                    rowProps.positive = true;
                  }
  
                  return (

                    <TableRow key={ domain.id } {...rowProps}>
                      <TableCell>{ domain.id }</TableCell>
                      <TableCell textAlign="center" verticalAlign="middle">
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
                      <TableCell>{ displayName }</TableCell>
                      <TableCell>{ domain.added }</TableCell>
                      <TableCell>{ domain.tbr }</TableCell>
                      <TableCell>{ domain.status }</TableCell>
                      <TableCell>{ domain.words && domain.words.join( ', ' ) }</TableCell>
                    </TableRow>
                  );
                } );

                domainsCount = dataVisible.length;

                return dataVisible;
              } )()
            }
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableHeaderCell colSpan="7" textAlign="right">{ `Domains: ${domainsCount}` }</TableHeaderCell>
              </TableRow>
            </TableFooter>
          </Table>
        )
      }
    </Container>
  );
}

export default App;
