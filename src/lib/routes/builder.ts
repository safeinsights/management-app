import type { Route } from 'next'
import type { z, ZodSchema } from 'zod'
// based on https://www.flightcontrol.dev/blog/fix-nextjs-routing-to-have-full-type-safety

export type RouteBuilder<T extends ZodSchema> = {
    (params: z.infer<T>): Route

    schema: T
    parse: (params: unknown) => z.infer<T>
}

// Optional query params are dropped rather than emitted empty, so a route given none stays a bare
// path. Shared because every route carrying `returnTo` built this by hand.
export function withQuery(base: string, params: Record<string, string | undefined>): string {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
        if (value) search.set(key, value)
    }
    const qs = search.toString()
    return qs ? `${base}?${qs}` : base
}

export function makeRoute<T extends ZodSchema>(
    pathFn: (params: z.infer<T>) => string,
    paramsSchema: T,
): RouteBuilder<T> {
    const routeFn = (params: z.infer<T>): Route => {
        const validated = paramsSchema.parse(params)
        return pathFn(validated) as Route
    }

    routeFn.schema = paramsSchema
    routeFn.parse = (params: unknown): z.infer<T> => {
        return paramsSchema.parse(params)
    }

    return routeFn as RouteBuilder<T>
}
