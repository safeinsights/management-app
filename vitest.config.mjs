import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tsconfigPaths(), vanillaExtractPlugin()],
    test: {
        mockReset: true,
        reporters: process.env.CI ? ['basic', 'github-actions'] : ['verbose'],
        environment: 'happy-dom',
        include: ['src/**/*.(test).{js,jsx,ts,tsx}'],
        coverage: {
            enabled: true,
            // skipFull: true,
            thresholds: { 100: true },
            include: ['src/**/*.{js,jsx,ts,tsx}'],
            exclude: [
                'src/styles/**/*.ts',
            ]
        },
    },
})
