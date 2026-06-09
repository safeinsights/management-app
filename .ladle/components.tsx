import type { GlobalProvider } from '@ladle/react'
import { MantineProvider } from '@mantine/core'
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
// The REAL app theme + resolver — the single source of truth shared with the app.
import { cssVariablesResolver, theme } from '@/theme'

export const Provider: GlobalProvider = ({ children }) => (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <ModalsProvider>{children}</ModalsProvider>
    </MantineProvider>
)
