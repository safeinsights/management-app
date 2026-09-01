import type { Route } from 'next'
import type { z, ZodSchema } from 'zod'
// based on https://www.flightcontrol.dev/blog/fix-nextjs-routing-to-have-full-type-safety

export type RouteBuilder<T extends ZodSchema> = {
    (params: z.infer<T>): Route

    schema: T
    parse: (params: unknown) => z.infer<T>
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
