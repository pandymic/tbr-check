import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Keeps the Create React App conventions the deployment relies on: PUBLIC_URL and
// REACT_APP_* variables from .env*, output in build/ with assets under static/
// (the web root symlinks build/static).
export default defineConfig( ( { mode } ) => {
  const env = loadEnv( mode, process.cwd(), '' );
  return {
    base: `${ ( env.PUBLIC_URL || '' ).replace( /\/$/, '' ) }/`,
    envPrefix: [ 'VITE_', 'REACT_APP_' ],
    plugins: [ react() ],
    server: { port: 3000, host: true },
    build: { outDir: 'build', assetsDir: 'static', emptyOutDir: true },
    test: {
      environment: 'jsdom',
      setupFiles: './src/setupTests.js',
    },
  };
} );
