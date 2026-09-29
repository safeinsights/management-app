'use client'

import { useParams, useSearchParams as useNextSearchParams } from 'next/navigation'
import type { z, ZodSchema } from 'zod'

export function useTypedParams<T extends ZodSchema>(schema: T): z.infer<T> {
    const params = useParams()
    return schema.parse(params)
}

// A `z.coerce` schema turns the string values into numbers and booleans.
export function useTypedSearchParams<T extends ZodSchema>(schema: T): z.infer<T> {
    const searchParams = useNextSearchParams()
    const obj = Object.fromEntries(searchParams.entries())
    return schema.parse(obj)
}
