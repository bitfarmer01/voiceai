// Make `tsc --noEmit` aware of Vite's `import.meta.glob`, which convex-test uses
// to load Convex function modules in tests. Vitest bundles Vite but does not hoist
// `node_modules/vite`, so `/// <reference types="vite/client" />` won't resolve;
// this minimal ambient augmentation covers the only Vite import-meta API we use.
interface ImportMeta {
  glob: (
    pattern: string | string[],
    options?: {
      eager?: boolean;
      import?: string;
      query?: string | Record<string, string>;
    },
  ) => Record<string, () => Promise<Record<string, unknown>>>;
}
