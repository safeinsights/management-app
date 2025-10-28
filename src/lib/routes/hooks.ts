'use client'

import { useParams, useSearchParams as useNextSearchParams } from 'next/navigation'
import type { z, ZodSchema } from 'zod'

/**
 * Type-safe wrapper for Next.js useParams hook with runtime validation.
 *
 * @param schema - Zod schema for validating route parameters
 * @returns Validated and typed route parameters
 * @throws {ZodError} If params don't match the schema
 *
 * @example
 * ```tsx
 * import { Routes } from '@/lib/routes'
 *
 * function StudyPage() {
 *   const params = useTypedParams(Routes.studyView.schema)
 *   //    ^? { orgSlug: string; studyId: string }
 *
 *   // params.orgSlug and params.studyId are guaranteed to exist and be valid
 * }
 * ```
 */
export function useTypedParams<T extends ZodSchema>(schema: T): z.infer<T> {
    const params = useParams()
    return schema.parse(params)
}

/**
 * Type-safe wrapper for Next.js useSearchParams hook with runtime validation.
 * Automatically handles type coercion for numbers and booleans.
 *
 * @param schema - Zod schema for validating search parameters
 * @returns Validated and typed search parameters
 * @throws {ZodError} If search params don't match the schema
 *
 * @example
 * ```tsx
 * import { z } from 'zod'
 *
 * const SearchParams = z.object({
 *   page: z.coerce.number().default(1),
 *   filter: z.string().optional(),
 *   enabled: z.coerce.boolean().default(false)
 * })
 *
 * function DataTable() {
 *   const search = useTypedSearchParams(SearchParams)
 *   //    ^? { page: number; filter?: string; enabled: boolean }
 *
 *   // search.page is a number, not a string!
 *   // search.enabled is a boolean, not a string!
 * }
 * ```
 */
export function useTypedSearchParams<T extends ZodSchema>(schema: T): z.infer<T> {
    const searchParams = useNextSearchParams()
    const obj = Object.fromEntries(searchParams.entries())
    return schema.parse(obj)
}
