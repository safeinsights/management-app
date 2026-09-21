import { z } from 'zod'

// `z.url()` accepts any parseable URI, including `javascript:`, `data:` and `vbscript:`, which
// execute if they reach an `href` unsanitized.
export const isHttpUrl = (value: string) => value.startsWith('http://') || value.startsWith('https://')

export const httpUrl = (label: string) =>
    z
        .string()
        .trim()
        .min(1, `${label} is a required field.`)
        .url(`Please enter a valid URL (e.g., must start with http:// or https://).`)
        .refine(isHttpUrl, {
            message: `Please enter a valid URL (e.g., must start with http:// or https://).`,
        })

// For form fields that use empty string as "unset", e.g. array fields with fixed slots.
export const httpUrlOptionalItem = (label: string) =>
    z
        .string()
        .trim()
        .refine((v) => !v || isHttpUrl(v), {
            message: `${label}: please enter a valid URL (must start with http:// or https://).`,
        })
        .refine((v) => !v || z.string().url().safeParse(v).success, {
            message: `${label}: please enter a valid URL.`,
        })
