import { semanticColor } from '@/theme/tokens'

export const OPENSTAX_ORG_SLUG = 'openstax'
export const OPENSTAX_LAB_ORG_SLUG = 'openstax-lab'
export const OPENSTAX_ORG_SLUGS = [OPENSTAX_ORG_SLUG, OPENSTAX_LAB_ORG_SLUG] as const

export const PROPOSAL_GRID_SPAN = {
    titleSpan: { base: 12, sm: 4, lg: 2 },
    inputSpan: { base: 12, sm: 8, lg: 4 },
}

// surface/sidenav is scoped to frame fills, so the side nav and the focused (sign-in, error,
// not-found) shells all read it.
export const SIDENAV_BG = semanticColor('surface.sidenav')

// Exported so Ladle's canvas shares the app's source of truth.
export const APP_MAIN_BG = semanticColor('surface.page')

// Shared by the real shell and Ladle's AppShell decorator so the two can't drift. Geometry from
// the SideNav/TopNav specs: 240 nav (layout/nav-width), 64 bar; layout "alt" runs the nav the full
// viewport height with the bar and footer beside it.
export const APP_SHELL = {
    layout: 'alt',
    navbarWidth: 240,
    headerHeight: 64,
    navbarBreakpoint: 'sm',
    padding: 'md',
    mainMaxWidth: 1600,
} as const

// Spread onto each shell's <main> so useRouteFocus has one target. tabIndex -1 takes scripted
// focus without joining the tab order; the outline rule lives in globals.css.
export const MAIN_CONTENT_ID = 'main-content'
export const MAIN_CONTENT_PROPS = { id: MAIN_CONTENT_ID, tabIndex: -1 } as const

export const NOTIFICATION_DISPLAY_MS = 8000

export const POSTHOG_HOST = 'https://us.i.posthog.com'

// Clerk's signOut can hang instead of settling, which strands whatever awaits it. Shared so the
// bound is one decision rather than a copy per call site (OTTER-745).
export const SIGN_OUT_TIMEOUT_MS = 5_000
