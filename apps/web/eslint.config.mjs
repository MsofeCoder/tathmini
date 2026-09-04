import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // public/sw.js and its worker chunks are Serwist build output, not
    // source — linting the bundled worker reports on minified code.
    ignores: ['.next/**', 'node_modules/**', 'public/sw.js', 'public/swe-worker-*.js'],
  },
];

export default config;
