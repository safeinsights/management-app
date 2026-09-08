// Mirrors the Figma design-system semantic tokens (OTTER-652). Change-requested differs by
// perspective: the reviewer sees the warning tint, the researcher the brand tint.
export const STATUS_BANNER_BG = {
    approved: 'green.0',
    rejected: 'red.0',
    changesRequestedReviewer: 'yellow.0',
    changesRequestedResearcher: 'purple.0',
} as const
