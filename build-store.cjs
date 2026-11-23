const fs = require('node:fs');
const path = require('node:path');

const root = fs.realpathSync(__dirname);
const output = path.join(root, 'dist-store');

// Keep this list in sync with the storefront, manifest and service worker.
const files = [
  'index.html',
  'catalogo.html',
  'styles.css',
  'alpha-data.js',
  'supabaseClient.js',
  'store-core.js',
  'product-metadata.js',
  'decant-pricing.js',
  'app.js',
  'manifest.webmanifest',
  'sw.js',
  'assets/alpha-logo.jpeg',
  'assets/hero-decants-pexels.jpg',
  'assets/icon-192.png',
  'assets/icon-512.png'
];

function validatePublicCredentials(file, content) {
  const source = content.toString('utf8');
  if (/\bsb_secret_[\w-]+/.test(source)) {
    throw new Error(`Clave privada de Supabase en ${file}.`);
  }

  for (const [, payload] of source.matchAll(/\beyJ[\w-]+\.([\w-]+)\.[\w-]+/g)) {
    const { role } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (role !== 'anon') {
      throw new Error(`JWT sin rol público anon en ${file}.`);
    }
  }
}

try {
  const sources = files.map(file => {
    const source = path.join(root, file);
    if (fs.realpathSync(source) !== source || !fs.statSync(source).isFile()) {
      throw new Error(`Se esperaba un archivo local sin enlaces: ${file}.`);
    }
    const content = fs.readFileSync(source);
    if (!file.startsWith('assets/')) validatePublicCredentials(file, content);
    return [file, content];
  });

  const previous = fs.lstatSync(output, { throwIfNoEntry: false });
  if (previous) {
    if (!previous.isDirectory() || previous.isSymbolicLink() || fs.realpathSync(output) !== output) {
      throw new Error('dist-store debe ser un directorio local sin enlaces.');
    }
    fs.rmSync(output, { recursive: true });
  }

  for (const [file, content] of sources) {
    const destination = path.join(output, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
  console.log(`dist-store generado con ${files.length} archivos públicos.`);
} catch (error) {
  console.error(`Error al generar dist-store: ${error.message}`);
  process.exitCode = 1;
}
