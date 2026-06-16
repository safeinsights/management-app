import type { GlobalProvider } from '@ladle/react'
import { Box, MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
// Import the EXACT same stylesheets, in the same order, as src/app/layout.tsx so
// Ladle renders through the app's real styling pipeline (Panda globals + Mantine
// layer CSS) — not a separate, non-real stylesheet. Keep this list in sync with
// layout.tsx. Ladle uses Vite, not Next, so layout.tsx's imports are never seen here.
import './fonts.css'
import '../src/app/globals.css'
import '@mantine/core/styles.layer.css'
import 'mantine-datatable/styles.layer.css'
import '@mantine/dropzone/styles.layer.css'
import './ladle.css'
// The REAL app theme + resolver — the single source of truth shared with the app.
import { cssVariablesResolver, theme } from '@/theme'
// Global default for Ladle's background control (white surface). Page/panel story files override
// it to the app-canvas grey on their meta via `pageBackgroundArgTypes`.
import { backgroundArgTypes } from './backgrounds'

export const argTypes = backgroundArgTypes

export const Provider: GlobalProvider = ({ children }) => (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <ModalsProvider>
            {/* Fill the story area via flex (the host is a flex column — see ladle.css) rather than
                `min-height: 100vh`, which overflows Ladle's normal-mode padding and adds a scrollbar.
                No background here — Ladle's background control paints the canvas (default white). */}
            <Box style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
                {children}
            </Box>
        </ModalsProvider>
    </MantineProvider>
)
