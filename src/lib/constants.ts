export const OPENSTAX_ORG_SLUG = 'openstax'
export const OPENSTAX_LAB_ORG_SLUG = 'openstax-lab'
export const OPENSTAX_ORG_SLUGS = [OPENSTAX_ORG_SLUG, OPENSTAX_LAB_ORG_SLUG] as const

// Client sets this cookie when Pi (𝜋) “Spy Mode” is toggled.
// Used to persist the UI toggle across refresh/navigation.
export const SPY_MODE_COOKIE_NAME = 'spy_mode' as const

export const PROPOSAL_GRID_SPAN = {
    titleSpan: { base: 12, sm: 4, lg: 2 },
    inputSpan: { base: 12, sm: 8, lg: 4 },
}

export const ENCLAVE_BG = 'purple.6'
export const LAB_BG = 'green.10'
