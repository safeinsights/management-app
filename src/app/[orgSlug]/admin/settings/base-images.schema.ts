import { z } from 'zod'

const MAX_FILE_SIZE = 10 * 1024 // 10MB
const MAX_FILE_SIZE_STR = '10KB'

// Valid env var key: starts with letter or underscore, followed by alphanumeric or underscore
export const envVarKeyRegex = /^[A-Za-z_][A-Za-z0-9_]*$/

// Schema for individual environment variable
const envVarSchema = z.object({
    name: z.string().regex(envVarKeyRegex, 'Invalid variable name: must start with letter or underscore'),
    value: z.string().nonempty('Value is required'),
})

// Schema for base image settings
const baseImageSettingsSchema = z.object({
    environment: z
        .array(envVarSchema)
        .default([])
        .refine((vars) => {
            const names = vars.map((v) => v.name)
            return names.length === new Set(names).size
        }, 'Environment variable names must be unique'),
})

// Base schema with common fields
const baseImageFieldsSchema = z.object({
    name: z.string().nonempty(),
    cmdLine: z.string().nonempty(),
    language: z.enum(['R', 'PYTHON'], { message: 'Language must be R or PYTHON' }),
    url: z.string().nonempty(), //  not url() because docker FROM doesn't have a scheme so isn't a truely valid url
    isTesting: z.boolean().default(false),
    settings: baseImageSettingsSchema.default({ environment: [] }),
})

// Schema for new env var input fields (used only in UI form, not for submission)
// These are validated on-demand when adding, not on every keystroke
// Automatically trims whitespace from input
const newEnvVarFieldsSchema = z.object({
    newEnvKey: z
        .string()
        .default('')
        .transform((val) => val.trim()),
    newEnvValue: z
        .string()
        .default('')
        .transform((val) => val.trim()),
})

// Schema for creating a new base image (starterCode required)
export const createOrgBaseImageSchema = baseImageFieldsSchema.extend({
    starterCode: z
        .instanceof(File)
        .refine((file) => file && file.size > 0, { message: 'Starter code must be set' })
        .refine((file) => file && file.size < MAX_FILE_SIZE, {
            message: `starter code file size must be less than ${MAX_FILE_SIZE_STR}`,
        }),
})

// Schema for editing a base image (starterCode optional - only validate size if a file is provided)
export const editOrgBaseImageSchema = baseImageFieldsSchema.extend({
    starterCode: z
        .instanceof(File)
        .refine((file) => file.size < MAX_FILE_SIZE, {
            message: `starter code file size must be less than ${MAX_FILE_SIZE_STR}`,
        })
        .optional()
        .or(z.undefined()),
})

// Form schemas with UI-only fields for new env var input
// Includes validation to prevent duplicate environment variable names when adding new ones
// Note: newEnvKey and newEnvValue are already trimmed by the schema transform
export const createOrgBaseImageFormSchema = createOrgBaseImageSchema
    .merge(newEnvVarFieldsSchema)
    .superRefine((data, ctx) => {
        // Check if pending env var would create a duplicate (values are already trimmed)
        if (data.newEnvKey && data.newEnvValue) {
            const isDuplicate = data.settings.environment.some((v) => v.name === data.newEnvKey)
            if (isDuplicate) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Variable name already exists',
                    path: ['newEnvKey'],
                })
            }
        }
    })

export const editOrgBaseImageFormSchema = editOrgBaseImageSchema
    .merge(newEnvVarFieldsSchema)
    .superRefine((data, ctx) => {
        // Check if pending env var would create a duplicate (values are already trimmed)
        if (data.newEnvKey && data.newEnvValue) {
            const isDuplicate = data.settings.environment.some((v) => v.name === data.newEnvKey)
            if (isDuplicate) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Variable name already exists',
                    path: ['newEnvKey'],
                })
            }
        }
    })

// Legacy export for backwards compatibility
export const orgBaseImageSchema = createOrgBaseImageSchema
