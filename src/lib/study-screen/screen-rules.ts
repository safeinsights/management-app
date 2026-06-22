import { Routes } from '@/lib/routes'
import type { StudyState } from './state.types'
import type { ScreenDescriptor } from './screens'

export type ScreenRuleCtx = { orgSlug: string; studyId: string }
export type ScreenRule = {
    when: (s: StudyState) => boolean
    screen: (s: StudyState, ctx: ScreenRuleCtx) => ScreenDescriptor
}

const dashboard = (): ScreenDescriptor['forward'] => ({
    title: 'Go to dashboard',
    target: { kind: 'route', href: Routes.dashboard },
})

// Researcher Tier-2 rules. Order = display precedence (see spec §6). First match wins.
export const SCREEN_RULES: ScreenRule[] = [
    { when: (s) => s.hasResults, screen: () => ({ screen: 'study-results' }) },

    {
        when: (s) => s.codeDecision === 'CODE-APPROVED' || s.isExecuting,
        screen: () => ({ screen: 'code-approved', forward: dashboard() }),
    },
    {
        when: (s) => s.codeDecision === 'CODE-CHANGES-REQUESTED',
        screen: (_s, ctx) => ({
            screen: 'code-feedback',
            forward: { title: 'Edit and resubmit', target: { kind: 'route', href: Routes.studyResubmit(ctx) } },
        }),
    },
    {
        when: (s) => s.codeDecision === 'CODE-REJECTED',
        screen: () => ({ screen: 'code-feedback', forward: dashboard() }),
    },

    { when: (s) => s.codeAwaitingDecision, screen: () => ({ screen: 'code-under-review', forward: dashboard() }) },

    {
        when: (s) => s.status === 'APPROVED' && !s.hasSubmittedCode,
        screen: (s, ctx) =>
            s.researcherAgreementsAcked
                ? {
                      screen: 'code-upload',
                      back: { title: 'Previous Step', target: { kind: 'route', href: Routes.studyAgreements(ctx) } },
                  }
                : {
                      screen: 'agreements',
                      forward: { title: 'Proceed to Step 4', target: { kind: 'route', href: Routes.studyCode(ctx) } },
                  },
    },

    {
        when: (s) => s.status === 'PENDING-REVIEW',
        screen: () => ({ screen: 'proposal-submitted', forward: dashboard() }),
    },
    {
        when: (s) => s.status === 'CHANGE-REQUESTED',
        screen: (_s, ctx) => ({
            screen: 'proposal-feedback',
            forward: { title: 'Edit and resubmit', target: { kind: 'route', href: Routes.studyEditAndResubmit(ctx) } },
        }),
    },
    {
        when: (s) => s.status === 'REJECTED' || s.status === 'APPROVED',
        screen: () => ({ screen: 'proposal-feedback', back: dashboard() }),
    },

    {
        when: (s) => s.isDraft,
        screen: (_s, ctx) => ({
            screen: 'proposal-edit',
            step: 'data-org',
            forward: { title: 'Proceed to step 2', target: { kind: 'route', href: Routes.studyProposal(ctx) } },
        }),
    },

    { when: () => true, screen: () => ({ screen: 'study-overview' }) },
]
