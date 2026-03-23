/// <reference types="vite/client" />

declare module 'oab-client' {
  export { GameEngine, get_unit_templates, greet, run_sandbox_battle } from './wasm/oab_client';
  export { default } from './wasm/oab_client';
}
