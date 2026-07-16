// Single source of truth for the large status-banner background colors shown on the proposal and
// code feedback pages (OTTER-652). Values mirror the Figma design-system semantic tokens and resolve
// to the theme palette's lightest shade (index 0). Change-requested differs by perspective: the
// reviewer (DP) sees the warning tint, the researcher (RL) sees the brand tint.
export const STATUS_BANNER_BG = {
    approved: 'green.0', // #E8F8EB (Figma Color/Success/Light)
    rejected: 'red.0', // #FFE0E0 (Figma Color/Error/Light)
    changesRequestedReviewer: 'yellow.0', // #FFF9E5 (Figma Color/Warning/Light)
    changesRequestedResearcher: 'purple.0', // #EAE8FC (Figma Color/Brand/Light)
} as const
