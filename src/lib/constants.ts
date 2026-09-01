export const OPENSTAX_ORG_SLUG = 'openstax'
export const OPENSTAX_LAB_ORG_SLUG = 'openstax-lab'
export const OPENSTAX_ORG_SLUGS = [OPENSTAX_ORG_SLUG, OPENSTAX_LAB_ORG_SLUG] as const

export const PROPOSAL_GRID_SPAN = {
    titleSpan: { base: 12, sm: 4, lg: 2 },
    inputSpan: { base: 12, sm: 8, lg: 4 },
}

export const ENCLAVE_BG = 'purple.6'
export const LAB_BG = 'green.10'

// Exported so Ladle's canvas shares the app's source of truth.
export const APP_MAIN_BG = 'grey.10'

// Shared by the real shell and Ladle's AppShell decorator so the two can't drift.
export const APP_SHELL = {
    navbarWidth: 260,
    headerHeight: 60,
    footerHeight: 60,
    navbarBreakpoint: 'sm',
    padding: 'md',
    mainMaxWidth: 1600,
    headerBg: 'purple.8',
} as const

export const NOTIFICATION_DISPLAY_MS = 8000

export const POSTHOG_HOST = 'https://us.i.posthog.com'
