import React from 'react';
import { Icon } from 'semantic-ui-react';
import { LogoMark } from './Logo.jsx';
import { relative, shortDate } from '../format.js';

// Data freshness comes from /domains/facets (updated, nextSession, lastAuction).
const Footer = ( { facets } ) => (
  <footer className="site-footer">
    <div className="site-footer-main">
      <div className="brand">
        <LogoMark size={ 24 } />
        <span><b>TBR</b> Check</span>
        <span className="version">v{ __APP_VERSION__ }</span>
      </div>
      <dl className="freshness">
        { facets.updated && <div><dt>Updated</dt><dd title={ facets.updated }>{ relative( facets.updated ) }</dd></div> }
        { facets.nextSession && <div><dt>Next session</dt><dd title={ facets.nextSession }>{ shortDate( facets.nextSession ) } · { relative( facets.nextSession ) }</dd></div> }
        { facets.lastAuction && <div><dt>Last auction</dt><dd title={ facets.lastAuction }>{ shortDate( facets.lastAuction ) }</dd></div> }
      </dl>
      <nav className="links">
        <a href="#top" onClick={ e => { e.preventDefault(); window.scrollTo( { top: 0, behavior: 'smooth' } ); } }><Icon name="arrow up" />Top</a>
        <a href="https://pandymic.com">pandymic.com</a>
      </nav>
    </div>
    <p className="credits">
      Domain data from CIRA's <a href="https://www.cira.ca/" rel="noopener noreferrer">To Be Released</a> list and auction results; not affiliated with CIRA.
      Scores estimate auction odds from past results and aren't valuations.
      Word frequencies from <a href="https://github.com/rspeer/wordfreq" rel="noopener noreferrer">wordfreq</a> (CC BY-SA 4.0).
    </p>
  </footer>
);

export default Footer;
