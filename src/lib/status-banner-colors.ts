// Single source of truth for the large status-banner background colors shown on the proposal and
// code feedback pages (OTTER-652). Values mirror the Figma design-system semantic tokens and resolve
// to the theme palette's lightest shade (index 0). Change-requested differs by perspective: the
// reviewer (DP) sees the warning tint, the researcher (RL) sees the brand tint.
//
// These are the "Light" counterparts of the semantic roles in @/theme/tokens — success/error/
// warning/brand — expressed as Mantine `color.shade` strings because they are passed straight to
// Mantine `bg` props. Keep the roles in step with `semanticShades` there.
export const STATUS_BANNER_BG = {
    approved: 'green.0', // #ECF4EE (Figma Color/Success/Light)
    rejected: 'red.0', // #FBECEB (Figma Color/Error/Light)
    changesRequestedReviewer: 'gold.0', // #FDF7EB (Figma Color/Warning/Light)
    changesRequestedResearcher: 'navy.0', // #E6E9EF (Figma Color/Brand/Light)
} as const
