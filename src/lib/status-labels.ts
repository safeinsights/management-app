import { semanticColor } from '@/theme/tokens'

export type PillColors = {
    bg: string
    c: string
}

// Who is looking, plus the organization display names the tooltips address the other side by. Six
// badges serve both roles and say something different to each, so the role travels with the names.
export type PillContext = {
    role: 'researcher' | 'reviewer'
    dataPartner: string
    researchLab: string
}

export type PillPresentation = {
    label: string
    tooltip?: (ctx: PillContext) => string
    colors: PillColors
}

// The five families of the "Study status badges" frame in the SI UI Component Library. Yellow is the
// only one that fills with a saturated shade instead of a light tint, so it pairs with body text
// rather than a tinted text.
//
// yellow.4 is Figma's `status/warning/bg-dark`. The semantic token of that name resolves to yellow.5
// here, one shade darker; the badge follows Figma and leaves the shared token alone, because other
// components already paint from it.
const COLORS = {
    gray: { bg: 'grey.0', c: semanticColor('text.secondary') },
    blue: { bg: semanticColor('info.bg.light'), c: semanticColor('info.text') },
    yellow: { bg: 'yellow.4', c: semanticColor('text.primary') },
    green: { bg: semanticColor('success.bg.light'), c: semanticColor('success.text') },
    red: { bg: semanticColor('error.bg.light'), c: semanticColor('error.text') },
} as const satisfies Record<string, PillColors>

// One id per badge in the design. Both roles draw from this set; several badges serve both, which is
// why the ids name the state rather than the audience.
export type PillId =
    | 'proposal-draft'
    | 'proposal-submitted'
    | 'proposal-needs-review'
    | 'proposal-needs-revision'
    | 'proposal-revision-requested'
    | 'proposal-approved'
    | 'proposal-declined'
    | 'code-draft'
    | 'code-awaiting'
    | 'code-submitted'
    | 'code-needs-review'
    | 'code-needs-revision'
    | 'code-revision-requested'
    | 'code-approved'
    | 'code-declined'
    | 'code-processing'
    | 'code-preparing'
    | 'code-queued'
    | 'code-running'
    | 'code-errored'
    | 'outputs-awaiting'
    | 'outputs-need-review'
    | 'outputs-reviewed'

const isResearcher = (ctx: PillContext) => ctx.role === 'researcher'

// Labels are complete strings, not a stage plus a fragment: "Awaiting outputs" and "Preparing code"
// do not decompose.
export const PILL_PRESENTATION: Record<PillId, PillPresentation> = {
    'proposal-draft': {
        label: 'Proposal draft',
        tooltip: () => 'Proposal draft in progress, not yet submitted.',
        colors: COLORS.gray,
    },
    'proposal-submitted': {
        label: 'Proposal submitted',
        tooltip: ({ dataPartner }) => `Waiting for ${dataPartner} to review proposal.`,
        colors: COLORS.blue,
    },
    'proposal-needs-review': {
        label: 'Proposal needs review',
        tooltip: ({ researchLab }) => `Review ${researchLab} proposal and share your decision.`,
        colors: COLORS.yellow,
    },
    'proposal-needs-revision': {
        label: 'Proposal needs revision',
        tooltip: ({ dataPartner }) => `${dataPartner} is requesting revisions to your proposal.`,
        colors: COLORS.yellow,
    },
    'proposal-revision-requested': {
        label: 'Proposal revision requested',
        tooltip: ({ researchLab }) => `Waiting for ${researchLab} to revise and resubmit their proposal.`,
        colors: COLORS.blue,
    },
    'proposal-approved': {
        label: 'Proposal approved',
        tooltip: (ctx) =>
            isResearcher(ctx)
                ? 'Proposal Approved. You can now submit your code.'
                : `Proposal Approved. Waiting for ${ctx.researchLab} to submit their code.`,
        colors: COLORS.green,
    },
    'proposal-declined': {
        label: 'Proposal declined',
        tooltip: (ctx) =>
            isResearcher(ctx)
                ? `${ctx.dataPartner} declined this proposal. The study has ended.`
                : 'Your organization declined this proposal. The study has ended.',
        colors: COLORS.red,
    },
    'code-draft': {
        label: 'Code draft',
        tooltip: () => 'Code draft in progress, not yet submitted.',
        colors: COLORS.gray,
    },
    'code-awaiting': {
        label: 'Awaiting code',
        tooltip: ({ researchLab }) => `Waiting for ${researchLab} to submit their code.`,
        colors: COLORS.blue,
    },
    'code-submitted': {
        label: 'Code submitted',
        tooltip: ({ dataPartner }) => `Waiting for ${dataPartner} to review code.`,
        colors: COLORS.blue,
    },
    'code-needs-review': {
        label: 'Code needs review',
        tooltip: ({ researchLab }) => `Review ${researchLab} code and share your decision.`,
        colors: COLORS.yellow,
    },
    'code-needs-revision': {
        label: 'Code needs revision',
        tooltip: ({ dataPartner }) => `${dataPartner} is requesting revisions to your code.`,
        colors: COLORS.yellow,
    },
    'code-revision-requested': {
        label: 'Code revision requested',
        tooltip: ({ researchLab }) => `Waiting for ${researchLab} to revise and resubmit their code.`,
        colors: COLORS.blue,
    },
    'code-approved': {
        label: 'Code approved',
        tooltip: (ctx) =>
            isResearcher(ctx)
                ? 'Code Approved. Code processing will begin shortly.'
                : 'Code Approved. Being prepared to run in the secure enclave.',
        colors: COLORS.green,
    },
    // The design names no badge for a declined code round, because the reject action is hidden from
    // reviewers (OTTER-650). Studies decided before it was hidden still carry CODE-REJECTED, so the
    // badge stays and follows the proposal-declined wording rather than falling back to a draft pill.
    'code-declined': {
        label: 'Code declined',
        tooltip: (ctx) =>
            isResearcher(ctx)
                ? `${ctx.dataPartner} declined this code. The study has ended.`
                : 'Your organization declined this code. The study has ended.',
        colors: COLORS.red,
    },
    'code-processing': {
        label: 'Code processing',
        tooltip: () => 'Code processing has started. This may take a while.',
        colors: COLORS.blue,
    },
    'code-preparing': {
        label: 'Preparing code',
        tooltip: () => 'Code is being packaged.',
        colors: COLORS.blue,
    },
    'code-queued': {
        label: 'Code queued',
        tooltip: () => 'Code is ready to be picked up by the secure enclave.',
        colors: COLORS.blue,
    },
    'code-running': {
        label: 'Code running',
        tooltip: () => 'Code is now running in the secure enclave.',
        colors: COLORS.blue,
    },
    'code-errored': {
        label: 'Code errored',
        tooltip: (ctx) =>
            isResearcher(ctx)
                ? `Code run failed. Review ${ctx.dataPartner} feedback and resubmit.`
                : 'Code run failed. Review the logs and share feedback.',
        colors: COLORS.yellow,
    },
    'outputs-awaiting': {
        label: 'Awaiting outputs',
        tooltip: ({ dataPartner }) => `Code processing complete. Waiting for ${dataPartner} to review the outputs.`,
        colors: COLORS.blue,
    },
    'outputs-need-review': {
        label: 'Outputs need review',
        tooltip: (ctx) =>
            isResearcher(ctx)
                ? 'A decision on the outputs has been shared with you.'
                : 'Outputs are now ready for your review.',
        colors: COLORS.yellow,
    },
    'outputs-reviewed': {
        label: 'Outputs reviewed',
        tooltip: (ctx) =>
            isResearcher(ctx)
                ? 'You have reviewed the decision on your outputs. You can resubmit code if needed.'
                : `A decision on the outputs has been shared with ${ctx.researchLab}.`,
        colors: COLORS.blue,
    },
}

// What the pill renders: the id the rule table picked, resolved against the viewer.
export type StatusLabel = {
    id: PillId
    label: string
    tooltip?: string
    colors: PillColors
}

export const resolvePillPresentation = (id: PillId, ctx: PillContext): StatusLabel => {
    const { label, tooltip, colors } = PILL_PRESENTATION[id]
    return { id, label, tooltip: tooltip?.(ctx), colors }
}
