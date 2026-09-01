import { z } from 'zod'
import type { Route } from 'next'
import { makeRoute } from './builder'
import { safeRedirectUrl } from '@/lib/utils'

export const OrgParams = z.object({
    orgSlug: z.string().min(1, 'Organization slug is required'),
})

export const StudyParams = z.object({
    orgSlug: z.string().min(1, 'Organization slug is required'),
    studyId: z.string().uuid('Study ID must be a valid UUID'),
})

export const NoParams = z.object({})

export const InviteParams = z.object({
    inviteId: z.string().uuid('Invite ID must be a valid UUID'),
})

export const DashboardSearchParams = z.object({
    skip: z.string().optional(),
    decline: z.string().optional(),
})

export const RedirectSearchParams = z.object({
    redirect_url: z
        .string()
        .optional()
        .transform((val) => (val ? safeRedirectUrl(val, '/' as Route) : undefined)),
})

export const InviteSearchParams = z.object({
    invite_id: z.string().uuid().optional(),
    redirect_url: z
        .string()
        .optional()
        .transform((val) => (val ? safeRedirectUrl(val, '/' as Route) : undefined)),
})

// Route typing approach: https://www.flightcontrol.dev/blog/fix-nextjs-routing-to-have-full-type-safety
export const Routes = {
    home: '/' as Route,

    dashboard: '/dashboard' as Route,

    about: '/about' as Route,

    notFound: '/404' as Route,

    editorDemo: '/editor-demo' as Route,

    orgDashboard: makeRoute(({ orgSlug }) => `/${orgSlug}/dashboard`, OrgParams),

    studyRequest: makeRoute(({ orgSlug }) => `/${orgSlug}/study/request`, OrgParams),

    studyView: makeRoute(
        ({ orgSlug, studyId, returnTo }) => {
            const base = `/${orgSlug}/study/${studyId}/view`
            const params = new URLSearchParams()
            if (returnTo) params.set('returnTo', returnTo)
            const qs = params.toString()
            return qs ? `${base}?${qs}` : base
        },
        StudyParams.extend({ returnTo: z.string().optional() }),
    ),

    // 404s until the code step is reached; /view resolves to results once decided.
    studyViewCode: makeRoute(
        ({ orgSlug, studyId, returnTo }) => {
            const base = `/${orgSlug}/study/${studyId}/view/code`
            const params = new URLSearchParams()
            if (returnTo) params.set('returnTo', returnTo)
            const qs = params.toString()
            return qs ? `${base}?${qs}` : base
        },
        StudyParams.extend({ returnTo: z.string().optional() }),
    ),

    studyEdit: makeRoute(({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/edit`, StudyParams),

    studyReview: makeRoute(({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/review`, StudyParams),

    // Reviewer counterpart to studyViewCode; no returnTo, the path is always org-scoped.
    studyReviewCode: makeRoute(({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/review/code`, StudyParams),

    studyReviewProposal: makeRoute(
        ({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/review/proposal`,
        StudyParams,
    ),

    studyCode: makeRoute(({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/code`, StudyParams),

    studyResubmit: makeRoute(({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/resubmit`, StudyParams),

    studyEditAndResubmit: makeRoute(
        ({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/edit-and-resubmit`,
        StudyParams,
    ),

    // Split by role so a dual-role user's flow comes from the URL, not a guess.
    studyResearcherAgreements: makeRoute(
        ({ orgSlug, studyId, returnTo }) => {
            const base = `/${orgSlug}/study/${studyId}/agreements/researcher`
            const params = new URLSearchParams()
            if (returnTo) params.set('returnTo', returnTo)
            const qs = params.toString()
            return qs ? `${base}?${qs}` : base
        },
        StudyParams.extend({ returnTo: z.string().optional() }),
    ),

    studyReviewerAgreements: makeRoute(
        ({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/agreements/reviewer`,
        StudyParams,
    ),

    studyProposal: makeRoute(({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/proposal`, StudyParams),

    studySubmitted: makeRoute(
        ({ orgSlug, studyId, returnTo }) => {
            const base = `/${orgSlug}/study/${studyId}/submitted`
            const params = new URLSearchParams()
            if (returnTo) params.set('returnTo', returnTo)
            const qs = params.toString()
            return qs ? `${base}?${qs}` : base
        },
        StudyParams.extend({ returnTo: z.string().optional() }),
    ),

    researcherProfileView: makeRoute(
        ({ orgSlug, studyId, userId }) => {
            const base = `/${orgSlug}/study/${studyId}/researcher-profile`
            const params = new URLSearchParams()
            if (userId) params.set('userId', userId)
            const qs = params.toString()
            return qs ? `${base}?${qs}` : base
        },
        StudyParams.extend({ userId: z.string().optional() }),
    ),

    accountKeys: '/account/keys' as Route,

    accountMfa: '/account/mfa' as Route,

    accountMfaApp: '/account/mfa/app' as Route,

    accountMfaSms: '/account/mfa/sms' as Route,

    accountResetPassword: '/account/reset-password' as Route,

    accountSignin: '/account/signin' as Route,

    accountInvitationSignup: makeRoute(({ inviteId }) => `/account/invitation/${inviteId}/signup`, InviteParams),

    accountInvitationJoinTeam: makeRoute(({ inviteId }) => `/account/invitation/${inviteId}/join-team`, InviteParams),

    researcherStudies: '/researcher/studies' as Route,

    researcherProfile: '/researcher/profile' as Route,

    userKey: '/user-key' as Route,

    adminSettings: makeRoute(({ orgSlug }) => `/${orgSlug}/admin/settings`, OrgParams),
    adminTeam: makeRoute(({ orgSlug }) => `/${orgSlug}/admin/team`, OrgParams),
    adminLegal: makeRoute(({ orgSlug }) => `/${orgSlug}/admin/legal`, OrgParams),

    adminSafeinsights: '/admin/safeinsights' as Route,

    adminSafeinsightsLegal: '/admin/safeinsights/legal' as Route,
} as const

export const ExternalLinks = {
    dataCatalog: 'https://dev-docs.sandbox.safeinsights.org/data-catalog/',
    resourceCenter: 'https://dev-docs.sandbox.safeinsights.org/data-organizations/',
} as const

/**
 * Extract the parameter type from a route
 *
 * @example
 * ```ts
 * type StudyRouteParams = RouteParams<typeof Routes.studyView>
 * //   ^? { orgSlug: string; studyId: string }
 * ```
 */
export type RouteParams<T> = T extends { parse: (params: unknown) => infer P } ? P : never
