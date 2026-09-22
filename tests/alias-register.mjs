// Registers the @shared/* resolver for plain `node --test` runs (Vite handles the alias in the browser).
import { register } from 'node:module';

register(new URL('./alias-loader.mjs', import.meta.url));
