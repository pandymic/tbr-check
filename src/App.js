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
  Form,
  Pagination,
  Grid,
  GridColumn,
} from 'semantic-ui-react';
import _ from 'lodash';
import 'semantic-ui-css/semantic.min.css'
import './App.css';

const domainsApi = process.env.REACT_APP_BACKEND_API ?? '';

const TableReducer = ( state, action) => {
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

const App = () => {

  const [ tableState, dispatch ] = useReducer( TableReducer, {
    column: null,
    data: null,
    direction: null,
  } );

  const perPage = 100;
  const [ page, setPage ] = useState( 1 );

  const [ filters, setFilters ] = useState( {
    domain: '',
    flag: false,
    domainLength: [],
    added: [],
    session: [],
    status: [],
    wordLength: [],
  } );

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
    <Container fluid className="App">
      {
        data && (
          <>
            <Grid verticalAlign="middle" columns="equal">
              <GridColumn textAlign="left"><b>TBR Check</b></GridColumn>
              <GridColumn textAlign="right">
                <Form.Input
                  icon="search"
                  placeholder="Search..."
                  value={ filters.domain ?? '' }
                  onChange={ e => {
                    setFilters( { ...filters, domain: e.target.value ?? '' } );
                  } }
                />
              </GridColumn>
            </Grid>
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
                <TableRow style={{ backgroundColor: 'rgba( 249, 250, 251, 0.5 )' }} className="ui form filters">
                  <TableCell data-label="" className="reset" verticalAlign="middle">
                    <Button basic content="Reset"
                      onClick={ () => {
                        setFilters( {
                          domain: '',
                          flag: false,
                          domainLength: [],
                          added: [],
                          session: [],
                          status: [],
                          wordLength: [],
                        } );
                      } }
                    />
                  </TableCell>
                  <TableCell data-label="Filters" textAlign="center" verticalAlign="middle">
                    <Checkbox 
                      checked={ filters.flag }
                      onChange={ ( e, { checked } ) => {
                        setFilters( { ...filters, flag: checked } );
                      } }
                    />
                  </TableCell>
                  <TableCell data-label="" verticalAlign="middle">
                    <Form.Dropdown
                      wrapSelection={false}
                      selection multiple
                      options={ LengthOptions() }
                      value={ filters.domainLength }
                      onChange={ ( e, { value } ) => {
                        setFilters( { ...filters, domainLength: value } );
                      } }
                    />
                  </TableCell>
                  <TableCell data-label="" verticalAlign="middle">
                    <Form.Dropdown
                      selection multiple
                      fluid
                      options={( () => {
                        const options = [];
                        data.forEach( domain => {
                          const value = domain.added;
                          // if ( !options.find( o => o.value === value ) ) options.push( { key: value, text: value, value: value } );
                          if ( !options.find( o => o.value === value.substring( 0, 10 ) ) ) options.push( { key: `${value.substring( 0, 10 )} 23:59:59`, text: value.substring( 0, 10 ), value: value.substring( 0, 10 ) } );
                        } );
                        options.sort( ( a, b ) => {
                          const dateA = new Date( a.key ), dateB = new Date( b.key );
                          return dateB - dateA;
                        } );
                        return options;
                      } )()}
                      value={ filters.added }
                      onChange={ ( e, { value } ) => {
                        setFilters( { ...filters, added: value } );
                      } }
                    />
                  </TableCell>
                  <TableCell data-label="" verticalAlign="middle">
                    <Form.Dropdown
                      selection multiple
                      fluid
                      options={( () => {
                        const options = [];
                        data.forEach( domain => {
                          const value = domain.tbr.substring( 0, 10 );
                          if ( !options.find( o => o.key === value ) ) options.push( { key: value, text: value, value: value } );
                        } );
                        options.sort( ( a, b ) => {
                          const dateA = new Date( a.key ), dateB = new Date( b.key );
                          return dateB - dateA;
                        } );
                        return options;
                      } )()}
                      value={ filters.session }
                      onChange={ ( e, { value } ) => {
                        setFilters( { ...filters, session: value } );
                      } }
                    />
                  </TableCell>
                  <TableCell data-label="" verticalAlign="middle">
                    <Form.Dropdown
                      selection multiple
                      fluid
                      options={[
                        { key: 'tbr', text: 'To Be Released', value: 'To Be Released' },
                        { key: 'released', text: 'Released', value: 'Released' },
                        { key: 'auctioned', text: 'Auctioned', value: 'Auctioned' },
                      ]}
                      value={ filters.status }
                      onChange={ ( e, { value } ) => {
                        setFilters( { ...filters, status: value } );
                      } }
                    />
                  </TableCell>
                  <TableCell data-label="" verticalAlign="middle">
                    <Form.Dropdown
                      selection multiple
                      fluid
                      options={ LengthOptions( 3, 8 ) }
                      value={ filters.wordLength }
                      onChange={ ( e, { value } ) => {
                        setFilters( { ...filters, wordLength: value } );
                      } }
                    />
                  </TableCell>
                </TableRow>
              {
                ( () => {

                  domainsCount = 0;

                  const dataVisible = data.filter( ( domain ) => {

                    if ( filters.flag !== false && domain.flag !== 1 ) {
                      return false;
                    }

                    if ( filters.domain && 2 <= filters.domain.length && !domain.name.toLowerCase().includes( filters.domain.toLowerCase() ) ) {
                      return false;
                    }

                    if ( filters.domainLength?.length ) {

                      const domainLength = domain.name.length - 3;
                      const filterSorted = filters.domainLength.sort( ( a, b ) => parseInt( a, 10 ) - parseInt( b, 10 ) );

                      let hasMatch = false;
                      for ( let i = 0; i < filterSorted.length; i++ ) {
                        const filterLength = parseInt( filterSorted[i], 10 );
                        if (
                          ( filterSorted[i].includes('+') && domainLength >= filterLength ) 
                          || ( filterSorted[i].includes('-') && domainLength <= filterLength ) 
                          || domainLength === filterLength
                        ) {
                          hasMatch = true;
                          break;
                        }
                      }

                      if ( hasMatch ) {

                        const filtersPlus = filterSorted.filter(f => f.includes('+')).map(f => parseInt(f, 10));
                        const filtersMinus = filterSorted.filter(f => f.includes('-')).map(f => parseInt(f, 10));
    
                        if ( filtersPlus.length > 0 && filtersMinus.length > 0 ) {

                          const min = filtersPlus[0];
                          const max = filtersMinus[filtersMinus.length -1];
                        
                          if ( 
                            ( min < max  )
                            && ( domainLength < min || domainLength > max )
                          ) {
                            hasMatch = false;
                          }
                        }
                      }
                      
                      if ( !hasMatch ) return false;
                    }

                    if ( filters.added?.length ) {
                      for ( let i = 0; i < filters.added.length; i++ ) {
                        if ( 0 !== domain.added.indexOf( filters.added[i] ) ) return false;
                      }
                    }

                    if ( filters.session?.length ) {
                      if ( !filters.session.includes( domain.tbr.substring( 0, 10 ) ) ) return false;
                    }

                    if ( filters.status?.length ) {
                      let hasMatch = false;
                      for ( let i = 0; i < filters.status.length; i++ ) {
                        if ( 0 === domain.status.indexOf( filters.status[i] ) ) {
                          hasMatch = true;
                          break;
                        }
                      }
                      if ( !hasMatch ) return false;
                    }

                    if ( filters.wordLength?.length ) {

                      if ( !domain.words || 0 === domain.words.length ) return false;

                      const wordLength = domain.words[0].length;
                      const filterSorted = filters.wordLength.sort( ( a, b ) => parseInt( a, 10 ) - parseInt( b, 10 ) );

                      let hasMatch = false;
                      for ( let i = 0; i < filterSorted.length; i++ ) {
                        const filterLength = parseInt( filterSorted[i], 10 );
                        if (
                          ( filterSorted[i].includes('+') && wordLength >= filterLength ) 
                          || ( filterSorted[i].includes('-') && wordLength <= filterLength ) 
                          || wordLength === filterLength
                        ) {
                          hasMatch = true;
                          break;
                        }
                      }

                      if ( hasMatch ) {

                        const filtersPlus = filterSorted.filter(f => f.includes('+')).map(f => parseInt(f, 10));
                        const filtersMinus = filterSorted.filter(f => f.includes('-')).map(f => parseInt(f, 10));
    
                        if ( filtersPlus.length > 0 && filtersMinus.length > 0 ) {

                          const min = filtersPlus[0];
                          const max = filtersMinus[filtersMinus.length -1];
                        
                          if ( 
                            ( min < max  )
                            && ( wordLength < min || wordLength > max )
                          ) {
                            hasMatch = false;
                          }
                        }
                      }
                      
                      if ( !hasMatch ) return false;
                    }
    
                    domainsCount++;
                    return true;
                  } ).slice( ( page - 1 ) * perPage, page * perPage ).map( ( domain ) => {
    
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
                        <TableCell data-label="ID">{ domain.id }</TableCell>
                        <TableCell data-label="Flag" textAlign="center" verticalAlign="middle">
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
    
                                  console.log( "Domain flag set." );
                                  dispatch({ type: 'LOAD_DATA', data: data.map( d => 
                                    d.id === domain.id ? domainUpdated : d
                                  ) } );
                          
                              } else {
                                console.error( "Failed to set domain flag:", response.status, response.statusText );
                                props.checked = !props.checked;
                              }
                            } ).catch(error => {
                              console.error( "Error setting domain flag:", error );
                              props.checked = !props.checked;
                            } );
    
                          } } />
                        </TableCell>
                        <TableCell data-label="Domain">{ displayName }</TableCell>
                        <TableCell data-label="Added">{ domain.added }</TableCell>
                        <TableCell data-label="Session">{ domain.tbr }</TableCell>
                        <TableCell data-label="Status">{ domain.status }</TableCell>
                        <TableCell data-label="Words">{ domain.words && domain.words.join( ', ' ) }</TableCell>
                      </TableRow>
                    );
                  } );

                  const totalPages = Math.ceil( Math.max( 1, domainsCount / ( perPage || 1 ) ) );
                  if ( totalPages < page ) setPage( totalPages );

                  return dataVisible;
                } )()
              }
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableHeaderCell colSpan="7">
                    <Grid verticalAlign="middle" columns="equal">
                      <GridColumn textAlign="left">
                        <Pagination
                          activePage={page}
                          totalPages={Math.ceil( domainsCount / perPage )}
                          onPageChange={ ( e, { activePage } ) => setPage( activePage ) }
                          secondary
                          ellipsisItem={null}
                          firstItem={null}
                          lastItem={null}
                          prevItem="«"
                          nextItem="»"
                          siblingRange={1}
                          size="small"
                        />
                      </GridColumn>
                      <GridColumn textAlign="right">Page {page} of {Math.ceil( Math.max( 1, domainsCount / ( perPage || 1 ) ) )}</GridColumn>
                    </Grid>
                  </TableHeaderCell>
                </TableRow>
              </TableFooter>
            </Table>
            <Grid verticalAlign="middle" columns="equal">
              <GridColumn textAlign="left">{domainsCount} Domains</GridColumn>
              <GridColumn textAlign="right">Hello World!</GridColumn>
            </Grid>
          </>
        )
      }
    </Container>
  );
}

export default App;
