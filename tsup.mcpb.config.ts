import { defineConfig } from 'tsup';

/**
 * The server inside the MCP Bundle (`npm run bundle`). Unlike `dist/cli.js`,
 * which npm installs next to its dependencies, the bundle ships one
 * self-contained file: every dependency is inlined, so the `.mcpb` carries no
 * `node_modules` and runs on the Node.js that Claude Desktop ships.
 */
export default defineConfig({
  entry: { index: 'src/cli.ts' },
  outDir: 'mcpb/server',
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  target: 'node20',
  platform: 'node',
  noExternal: [/.*/],
  clean: true,
  sourcemap: false,
  dts: false,
  minify: false,
});
