import { z } from 'zod'
import { DATA_SOURCE_TYPES, type DataSourceType } from '@/lib/types'

const dataSourceTypeKeys = Object.keys(DATA_SOURCE_TYPES) as [DataSourceType, ...DataSourceType[]]

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_FILE_SIZE_STR = '10MB'

export const envVarKeyRegex = /^[A-Za-z_][A-Za-z0-9_]*$/
export const ENV_VAR_KEY_ERROR = 'Invalid variable name: must start with letter or underscore'

const envVarSchema = z.object({
    name: z.string().regex(envVarKeyRegex, ENV_VAR_KEY_ERROR),
    value: z.string().trim().nonempty('Value is required'),
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

const pathnameRegex = /^[A-Za-z0-9_\-./]+$/

export const identifierRegex = /^[a-z0-9_]+$/

// Docker image reference per the OCI distribution spec: [HOST[:PORT]/]PATH[:TAG|@DIGEST]
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

const fileWithSizeRefine = (file: File) => file && file.size > 0 && file.size < MAX_FILE_SIZE

const codeEnvFieldsSchema = z.object({
    name: z.string().trim().nonempty('Name is required'),
    identifier: z
        .string()
        .nonempty('Identifier is required')
        .regex(identifierRegex, 'Must be all lowercase alphanumeric or underscores'),
    // The row UI derives "missing" from a trimmed value, so untrimmed a whitespace command would
    // show "Command is required" and still save (OTTER-647).
    commandLines: z.record(z.string(), z.string().trim().nonempty('Command is required')),
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
    existingStarterCodeFileNames: z.array(z.string()).default([]),
})

const newEnvVarFieldsSchema = z.object({
    newEnvKey: z
        .string()
        .default('')
        .transform((val) => val.trim()),
    newEnvValue: z
        .string()
        .default('')
        .transform((val) => val.trim()),
    newCmdExt: z
        .string()
        .default('')
        .transform((val) => val.trim().toLowerCase().replace(/^\./, '')),
    newCmdValue: z
        .string()
        .default('')
        .transform((val) => val.trim()),
})

export const createOrgCodeEnvSchema = codeEnvFieldsSchema.extend({
    starterCodes: z
        .array(z.instanceof(File))
        .min(1, 'At least one starter code file is required')
        .refine((files) => files.every(fileWithSizeRefine), {
            message: `Each starter code file must be non-empty and less than ${MAX_FILE_SIZE_STR}`,
        }),
    sampleDataUploaded: z.boolean().optional(),
})

export const editOrgCodeEnvSchema = codeEnvFieldsSchema.extend({
    starterCodes: z
        .array(z.instanceof(File))
        .refine((files) => files.every((f) => f.size < MAX_FILE_SIZE), {
            message: `Each starter code file must be less than ${MAX_FILE_SIZE_STR}`,
        })
        .optional(),
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

function bareExtension(fileName: string): string {
    return fileName.split('.').pop()?.toLowerCase() ?? ''
}

const requireCommandLineForEachExtension = (
    data: {
        starterCodes?: File[]
        commandLines: Record<string, string>
        existingStarterCodeFileNames: string[]
        newCmdExt: string
        newCmdValue: string
    },
    ctx: z.RefinementCtx,
) => {
    const newFileNames = (data.starterCodes ?? []).map((f) => f.name)
    const fileNames = newFileNames.length > 0 ? newFileNames : data.existingStarterCodeFileNames
    if (!fileNames.length) return

    const cmdLines = { ...data.commandLines }
    if (data.newCmdExt && data.newCmdValue) {
        cmdLines[data.newCmdExt] = data.newCmdValue
    }

    const missingExts = [...new Set(fileNames.map(bareExtension).filter(Boolean))].filter((ext) => !cmdLines[ext])

    if (missingExts.length > 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Missing command line for extension(s): .${missingExts.join(', .')}`,
            path: ['starterCodes'],
        })
    }
}

export const createOrgCodeEnvFormSchema = createOrgCodeEnvSchema
    .merge(newEnvVarFieldsSchema)
    .superRefine(rejectDuplicateEnvVarName)
    .superRefine(requireCommandLineForEachExtension)

export const editOrgCodeEnvFormSchema = editOrgCodeEnvSchema
    .merge(newEnvVarFieldsSchema)
    .superRefine(rejectDuplicateEnvVarName)
    .superRefine(requireCommandLineForEachExtension)

export const orgCodeEnvSchema = createOrgCodeEnvSchema
