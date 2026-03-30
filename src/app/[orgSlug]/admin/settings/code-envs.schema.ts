import { z } from 'zod'
import { DATA_SOURCE_TYPES, type DataSourceType } from '@/lib/types'

const dataSourceTypeKeys = Object.keys(DATA_SOURCE_TYPES) as [DataSourceType, ...DataSourceType[]]

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_FILE_SIZE_STR = '10MB'

// Valid env var key: starts with letter or underscore, followed by alphanumeric or underscore
export const envVarKeyRegex = /^[A-Za-z_][A-Za-z0-9_]*$/

// Schema for individual environment variable
const envVarSchema = z.object({
    name: z.string().regex(envVarKeyRegex, 'Invalid variable name: must start with letter or underscore'),
    value: z.string().nonempty('Value is required'),
})

const codeEnvSettingsSchema = z.object({
    environment: z
        .array(envVarSchema)
        .default([])
        .refine((vars) => {
            const names = vars.map((v) => v.name)
            return names.length === new Set(names).size
        }, 'Environment variable names must be unique'),
})

// Valid pathname: alphanumeric, hyphens, underscores, dots, forward slashes
const pathnameRegex = /^[A-Za-z0-9_\-./]+$/

export const identifierRegex = /^[a-z0-9_]+$/

// Docker image reference per OCI distribution spec:
//   [HOST[:PORT]/]PATH[:TAG|@DIGEST]
//
// HOST:  DNS hostname, optional port (e.g., harbor.safeinsights.org:443)
// PATH:  slash-separated components, each lowercase alphanumeric with [._-] separators
//        (double __ also allowed, multiple hyphens allowed)
// TAG:   alphanumeric, [._-], max 128 chars (e.g., :latest, :2025-05-15)
// DIGEST: algorithm:hex, at least 32 hex chars (e.g., @sha256:9cacb7...)
const dnsLabel = String.raw`[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?`
const domain = String.raw`(?:${dnsLabel}(?:\.${dnsLabel})*(?::[0-9]+)?\/)`
const pathComponent = String.raw`[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*`
const tag = String.raw`:[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}`
const digest = String.raw`@[a-z0-9]+(?:[+._-][a-z0-9]+)*:[a-fA-F0-9]{32,}`

const dockerImageRefRegex = new RegExp(`^${domain}?${pathComponent}(?:/${pathComponent})*(?:${tag})?(?:${digest})?$`)

export const dockerImageRefSchema = z
    .string()
    .nonempty('Image reference is required')
    .regex(dockerImageRefRegex, 'Must be a valid Docker image reference (e.g., registry.example.com/org/image:tag)')

// Base schema with common fields
const codeEnvFieldsSchema = z.object({
    name: z.string().nonempty(),
    identifier: z
        .string()
        .nonempty('Identifier is required')
        .regex(identifierRegex, 'Must be all lowercase alphanumeric or underscores'),
    cmdLine: z.string().nonempty(),
    language: z.enum(['R', 'PYTHON'], { message: 'Language must be R or PYTHON' }),
    url: dockerImageRefSchema,
    isTesting: z.boolean().default(false),
    settings: codeEnvSettingsSchema.default({ environment: [] }),
    sampleDataPath: z
        .string()
        .max(250)
        .refine((val) => val === '' || pathnameRegex.test(val), 'Must be a valid file path (e.g. data/sample.csv)')
        .optional(),
    dataSourceType: z.enum(dataSourceTypeKeys).nullable().optional(),
    dataSourceIds: z.array(z.string().uuid()).default([]),
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

export const createOrgCodeEnvSchema = codeEnvFieldsSchema.extend({
    starterCode: z
        .instanceof(File)
        .refine((file) => file && file.size > 0, { message: 'Starter code must be set' })
        .refine((file) => file && file.size < MAX_FILE_SIZE, {
            message: `starter code file size must be less than ${MAX_FILE_SIZE_STR}`,
        }),
    sampleDataUploaded: z.boolean().optional(),
})

export const editOrgCodeEnvSchema = codeEnvFieldsSchema.extend({
    starterCode: z
        .instanceof(File)
        .refine((file) => file.size < MAX_FILE_SIZE, {
            message: `starter code file size must be less than ${MAX_FILE_SIZE_STR}`,
        })
        .optional()
        .or(z.undefined()),
    sampleDataUploaded: z.boolean().optional(),
})

const rejectDuplicateEnvVarName = (
    data: { newEnvKey: string; newEnvValue: string; settings: { environment: { name: string }[] } },
    ctx: z.RefinementCtx,
) => {
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
}

export const createOrgCodeEnvFormSchema = createOrgCodeEnvSchema
    .merge(newEnvVarFieldsSchema)
    .superRefine(rejectDuplicateEnvVarName)

export const editOrgCodeEnvFormSchema = editOrgCodeEnvSchema
    .merge(newEnvVarFieldsSchema)
    .superRefine(rejectDuplicateEnvVarName)

export const orgCodeEnvSchema = createOrgCodeEnvSchema
