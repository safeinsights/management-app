/**
 * Type-safe routing utilities for Next.js
 *
 * This module provides compile-time and runtime type safety for routes,
 * route parameters, and search parameters.
 *
 * @example
 * ```tsx
 * import { Routes, useTypedParams } from '@/lib/routes'
 *
 * // Build type-safe routes
 * const route = Routes.studyView.build({ orgSlug: 'acme', studyId: '123' })
 *
 * // Use type-safe params
 * const params = useTypedParams(Routes.studyView.schema)
 * ```
 */

export { makeRoute } from './builder'
export {
    Routes,
    ExternalLinks,
    OrgParams,
    StudyParams,
    NoParams,
    InviteParams,
    DashboardSearchParams,
    RedirectSearchParams,
    InviteSearchParams,
    type RouteParams,
} from './definitions'
export { useTypedParams, useTypedSearchParams } from './hooks'
