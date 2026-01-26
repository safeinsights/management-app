import { z } from 'zod'

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const trimmedRequired = (label: string) => z.string().trim().min(1, `${label} is a required field.`)

const httpUrl = (label: string) =>
    z
        .string()
        .trim()
        .min(1, `${label} is a required field.`)
        .url(`Please enter a valid URL (e.g., must start with http:// or https://).`)
        .refine((v) => v.startsWith('http://') || v.startsWith('https://'), {
            message: `Please enter a valid URL (e.g., must start with http:// or https://).`,
        })

const httpUrlOptional = (label: string) =>
    z
        .string()
        .trim()
        .optional()
        .refine((v) => !v || v.startsWith('http://') || v.startsWith('https://'), {
            message: `Please enter a valid URL (e.g., must start with http:// or https://).`,
        })
        .refine((v) => !v || z.string().url().safeParse(v).success, {
            message: `Please enter a valid URL (e.g., must start with http:// or https://).`,
        })

// -----------------------------------------------------------------------------
// Personal information
// - Email is required but NOT editable (source of truth is Clerk).
// -----------------------------------------------------------------------------

export const personalInfoSchema = z.object({
    firstName: z
        .string()
        .trim()
        .min(2, 'First name must be 2-50 characters')
        .max(50, 'First name must be 2-50 characters'),
    lastName: z
        .string()
        .trim()
        .min(2, 'Last name must be 2-50 characters')
        .max(50, 'Last name must be 2-50 characters'),
})

export type PersonalInfoValues = z.infer<typeof personalInfoSchema>

// -----------------------------------------------------------------------------
// Highest level of education
// -----------------------------------------------------------------------------

export const educationSchema = z.object({
    educationalInstitution: trimmedRequired('Educational institution'),
    degree: trimmedRequired('Degree'),
    fieldOfStudy: trimmedRequired('Field of study'),
    isCurrentlyPursuing: z.boolean().default(false),
})

export type EducationValues = z.infer<typeof educationSchema>

// -----------------------------------------------------------------------------
// Current institutional information
// -----------------------------------------------------------------------------

export const currentPositionSchema = z.object({
    affiliation: trimmedRequired('Institution or organization affiliation'),
    position: trimmedRequired('Position'),
    profileUrl: httpUrlOptional('Link to your profile page'),
})

export type CurrentPositionValues = z.infer<typeof currentPositionSchema>

export const currentPositionsSchema = z.object({
    positions: z.array(currentPositionSchema).min(1, 'At least one current position is required.'),
})

export type CurrentPositionsValues = z.infer<typeof currentPositionsSchema>

// -----------------------------------------------------------------------------
// Research details
// -----------------------------------------------------------------------------

export const researchDetailsSchema = z.object({
    researchInterests: z
        .array(z.string().trim().min(1))
        .min(1, 'Research interests is required.')
        .max(5, 'You can include up to five area(s) of research interest.'),
    detailedPublicationsUrl: httpUrl('Detailed publications URL'),
    featuredPublicationsUrls: z
        .array(httpUrl('Featured publications URL'))
        .max(2, 'You can include up to two featured publications URLs.')
        .default([]),
})

export type ResearchDetailsValues = z.infer<typeof researchDetailsSchema>

