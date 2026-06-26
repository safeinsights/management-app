// Read-only view steps that live on /view (OTTER-614); agreements (Step 3) is its own route and
// so is absent. See resolveScreen for how `step` walks a researcher back through earlier screens.
export const VIEW_STEPS = ['proposal', 'code', 'results'] as const
export type ViewStep = (typeof VIEW_STEPS)[number]

// `step` arrives from the URL as an untrusted string. Narrow it to a known ViewStep (or undefined
// for absent/unknown values) so the rest of the pipeline can rely on the union.
export const asViewStep = (step: string | undefined): ViewStep | undefined =>
    VIEW_STEPS.includes(step as ViewStep) ? (step as ViewStep) : undefined
