// Read-only wizard steps that live on /view (OTTER-614); agreements (Step 3) is its own route and
// so is absent. See resolveScreen for how `step` walks a researcher back through earlier screens.
export const WIZARD_STEPS = ['proposal', 'code', 'results'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

// `step` arrives from the URL as an untrusted string. Narrow it to a known WizardStep (or undefined
// for absent/unknown values) so the rest of the pipeline can rely on the union.
export const asWizardStep = (step: string | undefined): WizardStep | undefined =>
    WIZARD_STEPS.includes(step as WizardStep) ? (step as WizardStep) : undefined
