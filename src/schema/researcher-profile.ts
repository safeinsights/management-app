import { z } from 'zod'
import { httpUrl, httpUrlOptionalItem } from './url'

const trimmedRequired = (label: string) => z.string().trim().min(1, `${label} is a required field.`)

// Email is required but not editable; Clerk is the source of truth.
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

export const educationSchema = z.object({
    educationalInstitution: trimmedRequired('Educational institution'),
    degree: trimmedRequired('Degree'),
    fieldOfStudy: trimmedRequired('Field of study'),
    isCurrentlyPursuing: z.boolean().default(false),
})

export type EducationValues = z.infer<typeof educationSchema>

export const positionSchema = z.object({
    affiliation: trimmedRequired('Institution or organization affiliation'),
    position: trimmedRequired('Position'),
    profileUrl: httpUrlOptionalItem('Link to your profile page'),
})

export type PositionValues = z.infer<typeof positionSchema>

export const positionsSchema = z.object({
    positions: z.array(positionSchema),
})

export type PositionsValues = z.infer<typeof positionsSchema>

export const researchDetailsSchema = z.object({
    researchInterests: z
        .array(z.string().trim().min(1))
        .min(1, 'Research interests is required.')
        .max(5, 'You can include up to five area(s) of research interest.'),
    detailedPublicationsUrl: httpUrl('Detailed publications URL'),
    featuredPublicationsUrls: z
        .array(httpUrlOptionalItem('Featured publications URL'))
        .max(2, 'You can include up to two featured publications URLs.')
        .default([]),
})

export type ResearchDetailsValues = z.infer<typeof researchDetailsSchema>
