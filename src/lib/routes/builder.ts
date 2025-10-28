import type { Route } from 'next'
import type { z, ZodSchema } from 'zod'

/**
 * Type for a callable route builder with attached properties
 */
export type RouteBuilder<T extends ZodSchema> = {
    /**
     * Build a route by calling the function directly
     */
    (params: z.infer<T>): Route

    /**
     * Get the Zod schema for this route's parameters.
     * Useful for creating type-safe hooks.
     */
    schema: T

    /**
     * Parses and validates route parameters from unknown source.
     * Useful for extracting params from URL or query strings.
     * @throws {ZodError} If parameters don't match the schema
     */
    parse: (params: unknown) => z.infer<T>
}

/**
 * Creates a type-safe route builder with compile-time and runtime validation.
 *
 * @param pathFn - Function that builds the route path from params
 * @param paramsSchema - Zod schema for validating route parameters
 * @returns Callable function with `schema` and `parse` properties
 *
 * @example
 * ```ts
 * const StudyParams = z.object({ orgSlug: z.string(), studyId: z.string().uuid() })
 * const studyRoute = makeRoute(
 *   ({ orgSlug, studyId }) => `/${orgSlug}/study/${studyId}/view`,
 *   StudyParams
 * )
 *
 * // Type-safe route building (call directly)
 * const route = studyRoute({ orgSlug: 'acme', studyId: '123' })
 * //    ^? Route<'/${string}/study/${string}/view'>
 *
 * // Access schema for hooks
 * const { orgSlug } = useTypedParams(studyRoute.schema)
 * ```
 */
export function makeRoute<T extends ZodSchema>(
    pathFn: (params: z.infer<T>) => string,
    paramsSchema: T,
): RouteBuilder<T> {
    // Create the callable function
    const routeFn = (params: z.infer<T>): Route => {
        const validated = paramsSchema.parse(params)
        return pathFn(validated) as Route
    }

    // Attach properties to the function
    routeFn.schema = paramsSchema
    routeFn.parse = (params: unknown): z.infer<T> => {
        return paramsSchema.parse(params)
    }

    return routeFn as RouteBuilder<T>
}
