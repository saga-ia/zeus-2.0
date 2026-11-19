// Empacota a tela (web/app.tsx) em public/app.js com o esbuild do estúdio. React, Remotion e o componente de edição
// vêm de /opt/jeff-apps/jeff-video/estudio/node_modules: uma cópia só, igual à do render.
const path = require('path');
const ESTUDIO = '/opt/jeff-apps/jeff-video/estudio';
require(path.join(ESTUDIO, 'node_modules', 'esbuild')).build({
  entryPoints: [path.join(__dirname, 'app.tsx')],
  outfile: path.join(__dirname, '..', 'public', 'app.js'),
  bundle: true, minify: true, sourcemap: false, format: 'iife', target: ['chrome110', 'safari16', 'firefox115'],
  jsx: 'automatic', nodePaths: [path.join(ESTUDIO, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
}).then(() => console.log('ok: public/app.js')).catch(() => process.exit(1));
