import { z } from 'zod'
import type { Route } from 'next'
import { makeRoute } from './builder'
import { safeRedirectUrl } from '@/lib/utils'

// ============================================================================
// Parameter Schemas
// ============================================================================

/**
 * Schema for routes that require an organization slug
 */
export const OrgParams = z.object({
    orgSlug: z.string().min(1, 'Organization slug is required'),
})

/**
 * Schema for routes that require both org slug and study ID
 */
export const StudyParams = z.object({
    orgSlug: z.string().min(1, 'Organization slug is required'),
    studyId: z.string().uuid('Study ID must be a valid UUID'),
})

/**
 * Schema for routes with no parameters
 */
export const NoParams = z.object({})

/**
 * Schema for routes that require an invite ID
 */
export const InviteParams = z.object({
    inviteId: z.string().uuid('Invite ID must be a valid UUID'),
})

// ============================================================================
// Search Parameter Schemas
// ============================================================================

/**
 * Dashboard search params (for handling invitations)
 */
export const DashboardSearchParams = z.object({
    skip: z.string().optional(),
    decline: z.string().optional(),
})

/**
 * Common redirect URL pattern
 */
export const RedirectSearchParams = z.object({
    redirect_url: z
        .string()
        .optional()
        .transform((val) => (val ? safeRedirectUrl(val, '/' as Route) : undefined)),
})

/**
 * Invitation link params
 */
export const InviteSearchParams = z.object({
    invite_id: z.string().uuid().optional(),
    redirect_url: z
        .string()
        .optional()
        .transform((val) => (val ? safeRedirectUrl(val, '/' as Route) : undefined)),
})

// ============================================================================
// Route Definitions
// based on https://www.flightcontrol.dev/blog/fix-nextjs-routing-to-have-full-type-safety
// ============================================================================

export const Routes = {
    // -------------------------------------------------------------------------
    // Public / Root Routes (Simple routes - no parameters)
    // -------------------------------------------------------------------------

    home: '/' as Route,

    dashboard: '/dashboard' as Route,

    about: '/about' as Route,

    notFound: '/404' as Route,

    editorDemo: '/editor-demo' as Route,

    // -------------------------------------------------------------------------
    // Organization Routes
    // -------------------------------------------------------------------------

    orgDashboard: makeRoute(({ orgSlug }) => `/${orgSlug}/dashboard`, OrgParams),

    // -------------------------------------------------------------------------
    // Study Routes
    // -------------------------------------------------------------------------

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

    // Read-only post-decision code view: lets a researcher walk back to the code step from a results
    // study (whose /view resolves to the results screen). The page 404s if code isn't reached yet.
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

    // Read-only post-decision code view for the reviewer (DO), the counterpart to studyViewCode: lets a
    // reviewer walk back to the code step from a results study (whose /review resolves to results). No
    // returnTo — the reviewer flow is always org-scoped via the path. The page 404s if code isn't reached.
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

    // Agreements is split into role-specific sibling routes so the page never has to guess which
    // flow a dual-role user (reviewer via the enclave, researcher via their own lab) is in: the URL
    // is the role. Researcher carries returnTo (org-scoped entry); reviewer does not.
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
        ({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/researcher-profile`,
        StudyParams,
    ),

    // -------------------------------------------------------------------------
    // Account Routes (Simple routes - no parameters)
    // -------------------------------------------------------------------------

    accountKeys: '/account/keys' as Route,

    accountMfa: '/account/mfa' as Route,

    accountMfaApp: '/account/mfa/app' as Route,

    accountMfaSms: '/account/mfa/sms' as Route,

    accountResetPassword: '/account/reset-password' as Route,

    accountSignin: '/account/signin' as Route,

    accountInvitationSignup: makeRoute(({ inviteId }) => `/account/invitation/${inviteId}/signup`, InviteParams),

    accountInvitationJoinTeam: makeRoute(({ inviteId }) => `/account/invitation/${inviteId}/join-team`, InviteParams),

    // -------------------------------------------------------------------------
    // Researcher Routes (Simple routes - no parameters)
    // -------------------------------------------------------------------------

    researcherStudies: '/researcher/studies' as Route,

    researcherProfile: '/researcher/profile' as Route,

    userKey: '/user-key' as Route,

    // -------------------------------------------------------------------------
    // Admin Routes
    // -------------------------------------------------------------------------

    adminSettings: makeRoute(({ orgSlug }) => `/${orgSlug}/admin/settings`, OrgParams),
    adminTeam: makeRoute(({ orgSlug }) => `/${orgSlug}/admin/team`, OrgParams),

    adminSafeinsights: '/admin/safeinsights' as Route,
} as const

// ============================================================================
// External Links (not Next.js routes)
// ============================================================================

export const ExternalLinks = {
    dataCatalog: 'https://dev-docs.sandbox.safeinsights.org/data-catalog/',
    resourceCenter: 'https://dev-docs.sandbox.safeinsights.org/data-organizations/',
} as const

// ============================================================================
// Type Exports
// ============================================================================

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
