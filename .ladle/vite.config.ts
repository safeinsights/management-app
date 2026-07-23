import { defineConfig } from 'vite'
import path from 'node:path'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Ladle runs components in isolation via Vite — NOT through Next.js. So `next/font`,
// `next/link`, `next/image`, and `next/navigation` are unavailable. We alias the
// next/* imports our components pull in to local shims under .ladle/shims/ so they
// still render. `@sentry/nextjs` is also aliased: its Next integration imports Next's
// client router (has-base-path.js) which references the Node `process` global —
// undefined under Vite — crashing any component whose import graph touches Sentry.
// `@clerk/nextjs` is aliased too: its hooks throw without a <ClerkProvider>, which Ladle
// has no session for — the shim makes them inert so e.g. <UserAvatar> renders from its prop.
// Styling is Mantine-only; Ladle gets the same Mantine pipeline as the app.
export default defineConfig({
    // STANDALONE build: inline all JS/CSS into a single self-contained index.html so the build
    // opens from a plain file:// double-click with no server (a normal Ladle build emits module
    // scripts + code-split chunks, which browsers block over file://). Off by default — only the
    // `ladle:build:standalone` script sets LADLE_STANDALONE, so normal serve/build keep
    // code-splitting and HMR. inlineDynamicImports merges Ladle's lazy-loaded story chunks into
    // the single entry so there are no runtime import() fetches (which also fail over file://).
    plugins: process.env.LADLE_STANDALONE ? [viteSingleFile()] : [],
    build: process.env.LADLE_STANDALONE
        ? { rollupOptions: { output: { inlineDynamicImports: true } } }
        : {},
    // Some deps read process.env.* at module load; Vite only defines NODE_ENV by
    // default, so make the whole env object safe to read (unknown keys → undefined).
    // NODE_ENV tracks the actual mode: the standalone build ships a production bundle
    // (minified, dev warnings stripped), while serve/HMR stays in development.
    define: {
        'process.env': JSON.stringify({ NODE_ENV: process.env.LADLE_STANDALONE ? 'production' : 'development' }),
    },
    resolve: {
        alias: {
            // Ladle-only modules (decorators, background config) — mirrors the tsconfig
            // "~ladle/*" path so stories import them without deep "../../../.ladle" chains.
            '~ladle': path.resolve(__dirname),
            // Order matters: the more specific '@/tests' must precede '@'.
            '@/tests': path.resolve(__dirname, '..', 'tests'),
            '@': path.resolve(__dirname, '..', 'src'),
            'next/link': path.resolve(__dirname, 'shims/next-link.tsx'),
            'next/image': path.resolve(__dirname, 'shims/next-image.tsx'),
            'next/navigation': path.resolve(__dirname, 'shims/next-navigation.ts'),
            '@sentry/nextjs': path.resolve(__dirname, 'shims/sentry.ts'),
            '@clerk/nextjs': path.resolve(__dirname, 'shims/clerk.tsx'),
        },
    },
})
