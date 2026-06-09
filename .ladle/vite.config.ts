import { defineConfig } from 'vite'
import path from 'node:path'

// Ladle runs components in isolation via Vite — NOT through Next.js. So `next/font`,
// `next/link`, `next/image`, and `next/navigation` are unavailable. We alias the
// next/* imports our components pull in to local shims under .ladle/shims/ so they
// still render. `@sentry/nextjs` is also aliased: its Next integration imports Next's
// client router (has-base-path.js) which references the Node `process` global —
// undefined under Vite — crashing any component whose import graph touches Sentry.
// PostCSS (Panda) is picked up from the repo-root postcss.config.cjs automatically,
// so Ladle gets the SAME Panda + Mantine styling pipeline as the app.
export default defineConfig({
    // Some deps read process.env.* at module load; Vite only defines NODE_ENV by
    // default, so make the whole env object safe to read (unknown keys → undefined).
    define: {
        'process.env': '{"NODE_ENV":"development"}',
    },
    resolve: {
        alias: {
            // Order matters: the more specific '@/tests' must precede '@'.
            '@/tests': path.resolve(__dirname, '..', 'tests'),
            '@': path.resolve(__dirname, '..', 'src'),
            'next/link': path.resolve(__dirname, 'shims/next-link.tsx'),
            'next/image': path.resolve(__dirname, 'shims/next-image.tsx'),
            'next/navigation': path.resolve(__dirname, 'shims/next-navigation.ts'),
            '@sentry/nextjs': path.resolve(__dirname, 'shims/sentry.ts'),
        },
    },
})
