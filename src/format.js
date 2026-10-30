const DAY = 86400000;
const rtf = new Intl.RelativeTimeFormat( 'en', { numeric: 'auto' } );

// "2026-10-21 12:48:42" or "2026-10-28" as local time.
export const parseDate = value => new Date( value.length > 10 ? value.replace( ' ', 'T' ) : `${value}T00:00:00` );

export const shortDate = ( value, now = new Date() ) => {
  const date = parseDate( value );
  return date.toLocaleDateString( 'en-CA', { month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' } );
};

// "3 hours ago", "yesterday", "in 5 days", "2 months ago".
export const relative = ( value, now = new Date() ) => {
  const date = parseDate( value );
  const diff = date - now;
  if ( value.length > 10 && Math.abs( diff ) < DAY ) {
    const hours = Math.round( diff / 3600000 );
    return 0 === hours ? 'just now' : rtf.format( hours, 'hour' );
  }
  const midnight = new Date( now.getFullYear(), now.getMonth(), now.getDate() );
  const day = new Date( date.getFullYear(), date.getMonth(), date.getDate() );
  const days = Math.round( ( day - midnight ) / DAY );
  if ( Math.abs( days ) < 45 ) return rtf.format( days, 'day' );
  return rtf.format( Math.round( days / 30 ), 'month' );
};

// Inverse of the server's score: 100 ≈ certain, 80 ≈ 40%, 50 ≈ 10%, 0 ≤ 1%.
export const auctionOdds = score => Math.min( 1, 10 ** ( score / 50 - 2 ) );

export const scoreColor = score => score >= 80 ? 'green' : score >= 60 ? 'olive' : score >= 40 ? 'yellow' : score >= 20 ? 'orange' : 'grey';

export const KINDS = {
  common: { text: 'English', color: 'grey' },
  fr: { text: 'French', color: 'blue' },
  place: { text: 'Canadian place', color: 'red' },
  tech: { text: 'Tech', color: 'teal' },
  name: { text: 'Name', color: 'purple' },
};
