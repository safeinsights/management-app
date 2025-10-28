import { z } from 'zod'
import type { Route } from 'next'
import { makeRoute } from './builder'

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
    redirect_url: z.string().optional(),
})

/**
 * Invitation link params
 */
export const InviteSearchParams = z.object({
    invite_id: z.string().uuid().optional(),
    redirect_url: z.string().optional(),
})

// ============================================================================
// Route Definitions
// ============================================================================

export const Routes = {
    // -------------------------------------------------------------------------
    // Public / Root Routes (Simple routes - no parameters)
    // -------------------------------------------------------------------------

    home: '/' as Route,

    dashboard: '/dashboard' as Route,

    about: '/about' as Route,

    notFound: '/404' as Route,

    // -------------------------------------------------------------------------
    // Organization Routes
    // -------------------------------------------------------------------------

    orgDashboard: makeRoute(({ orgSlug }) => `/${orgSlug}/dashboard`, OrgParams),

    // -------------------------------------------------------------------------
    // Study Routes
    // -------------------------------------------------------------------------

    studyRequest: makeRoute(({ orgSlug }) => `/${orgSlug}/study/request`, OrgParams),

    studyView: makeRoute(({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/view`, StudyParams),

    studyEdit: makeRoute(({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/edit`, StudyParams),

    studyReview: makeRoute(({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/review`, StudyParams),

    studyResubmit: makeRoute(({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/resubmit`, StudyParams),

    // -------------------------------------------------------------------------
    // Account Routes (Simple routes - no parameters)
    // -------------------------------------------------------------------------

    accountKeys: '/account/keys' as Route,

    accountMfa: '/account/mfa' as Route,

    accountMfaApp: '/account/mfa/app' as Route,

    accountResetPassword: '/account/reset-password' as Route,

    accountSignin: '/account/signin' as Route,

    // -------------------------------------------------------------------------
    // Researcher Routes (Simple routes - no parameters)
    // -------------------------------------------------------------------------

    researcherStudies: '/researcher/studies' as Route,

    // -------------------------------------------------------------------------
    // Admin Routes
    // -------------------------------------------------------------------------

    adminTeamSettings: makeRoute(({ orgSlug }) => `/admin/team/${orgSlug}/settings`, OrgParams),

    adminSafeinsights: '/admin/safeinsights' as Route,
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
