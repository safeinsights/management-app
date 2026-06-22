import { Routes } from '@/lib/routes'
import type { StudyState } from './state.types'
import type { ScreenDescriptor } from './screens'

export type ScreenRuleCtx = { orgSlug: string; studyId: string; returnTo?: 'org' }
export type ScreenRule = {
    when: (s: StudyState) => boolean
    screen: (s: StudyState, ctx: ScreenRuleCtx) => ScreenDescriptor
}

const dashboard = (ctx: ScreenRuleCtx): ScreenDescriptor['forward'] => ({
    title: 'Go to dashboard',
    target: {
        kind: 'route',
        href: ctx.returnTo === 'org' ? Routes.orgDashboard({ orgSlug: ctx.orgSlug }) : Routes.dashboard,
    },
})

// Researcher Tier-2 rules. Order = display precedence (see spec §6). First match wins.
export const SCREEN_RULES: ScreenRule[] = [
    { when: (s) => s.hasResults, screen: () => ({ screen: 'study-results' }) },

    {
        when: (s) => s.codeDecision === 'CODE-APPROVED' || s.isExecuting,
        screen: (_s, ctx) => ({
            screen: 'code-approved',
            back: {
                title: 'Previous Step',
                target: {
                    kind: 'route',
                    href: Routes.studyAgreements({
                        orgSlug: ctx.orgSlug,
                        studyId: ctx.studyId,
                        returnTo: ctx.returnTo,
                    }),
                },
            },
            forward: dashboard(ctx),
        }),
    },
    {
        when: (s) => s.codeDecision === 'CODE-CHANGES-REQUESTED',
        screen: (_s, ctx) => ({
            screen: 'code-feedback',
            forward: {
                title: 'Edit and resubmit',
                target: { kind: 'route', href: Routes.studyResubmit({ orgSlug: ctx.orgSlug, studyId: ctx.studyId }) },
            },
        }),
    },
    {
        when: (s) => s.codeDecision === 'CODE-REJECTED',
        screen: (_s, ctx) => ({ screen: 'code-feedback', forward: dashboard(ctx) }),
    },

    {
        when: (s) => s.codeAwaitingDecision,
        screen: (_s, ctx) => ({
            screen: 'code-under-review',
            back: {
                title: 'Previous Step',
                target: {
                    kind: 'route',
                    href: Routes.studyAgreements({
                        orgSlug: ctx.orgSlug,
                        studyId: ctx.studyId,
                        returnTo: ctx.returnTo,
                    }),
                },
            },
            forward: dashboard(ctx),
        }),
    },

    {
        when: (s) => s.status === 'APPROVED' && !s.hasSubmittedCode,
        screen: (s, ctx) =>
            s.researcherAgreementsAcked
                ? {
                      screen: 'code-upload',
                      back: {
                          title: 'Previous Step',
                          target: {
                              kind: 'route',
                              href: Routes.studyAgreements({ orgSlug: ctx.orgSlug, studyId: ctx.studyId }),
                          },
                      },
                  }
                : {
                      screen: 'agreements',
                      forward: {
                          title: 'Proceed to Step 4',
                          target: {
                              kind: 'route',
                              href: Routes.studyCode({ orgSlug: ctx.orgSlug, studyId: ctx.studyId }),
                          },
                      },
                  },
    },

    {
        when: (s) => s.status === 'PENDING-REVIEW',
        screen: (_s, ctx) => ({ screen: 'proposal-submitted', forward: dashboard(ctx) }),
    },
    {
        when: (s) => s.status === 'CHANGE-REQUESTED',
        screen: (_s, ctx) => ({ screen: 'proposal-feedback', back: dashboard(ctx) }),
    },
    // Decided proposal (read-only): REJECTED, or APPROVED that already has code (the no-code
    // APPROVED case is handled by the agreements/upload rule above).
    {
        when: (s) => s.status === 'REJECTED' || s.status === 'APPROVED',
        screen: (_s, ctx) => ({ screen: 'proposal-feedback', back: dashboard(ctx) }),
    },

    {
        when: (s) => s.isDraft,
        screen: (_s, ctx) => ({
            screen: 'proposal-edit',
            step: 'data-org',
            forward: {
                title: 'Proceed to step 2',
                target: { kind: 'route', href: Routes.studyProposal({ orgSlug: ctx.orgSlug, studyId: ctx.studyId }) },
            },
        }),
    },

    { when: () => true, screen: () => ({ screen: 'study-overview' }) },
]
