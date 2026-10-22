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

// Docker image reference per the OCI distribution spec, [HOST[:PORT]/]PATH[:TAG]@DIGEST, with the
// digest required so the image can't change under a reused tag. Existing rows may predate this.
const dnsLabel = String.raw`[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?`
const domain = String.raw`(?:${dnsLabel}(?:\.${dnsLabel})*(?::[0-9]+)?\/)`
const pathComponent = String.raw`[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*`
const tag = String.raw`:[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}`
const unpinnedRef = String.raw`${domain}?${pathComponent}(?:/${pathComponent})*(?:${tag})?`
const digest = String.raw`sha256:[a-f0-9]{64}`

const unpinnedImageRefRegex = new RegExp(`^${unpinnedRef}$`)
const imageDigestRegex = new RegExp(`^${digest}$`)
const dockerImageRefRegex = new RegExp(`^${unpinnedRef}@${digest}$`)

export const dockerImageRefSchema = z
    .string()
    .nonempty('Image reference is required')
    .regex(
        dockerImageRefRegex,
        'Must be a valid Docker image reference ending in a sha256 digest (e.g., registry.example.com/org/image:tag@sha256:<64 hex characters>)',
    )

// The form takes the image and its digest separately because Harbor shows only a truncated digest,
// so admins compose the reference from the CLI output; the two are joined on save.
// One message per input: the form resolver reports the last issue on a path, so stacked checks
// would show the generic message over the specific one.
const unpinnedImageRefProblem = (url: string) => {
    if (!url) return 'Image URL is required'
    if (url.includes('@') || url.includes('sha256:')) return 'Put the digest in the Image digest field, not the URL'
    if (!unpinnedImageRefRegex.test(url)) {
        return 'Must be a valid Docker image URL (e.g., registry.example.com/org/image:tag)'
    }
    return null
}

const unpinnedImageRefSchema = z
    .string()
    .trim()
    .superRefine((val, ctx) => {
        const problem = unpinnedImageRefProblem(val)
        if (problem) ctx.addIssue({ code: 'custom', message: problem })
    })

export const normalizeImageDigest = (value: string) => {
    const trimmed = value.trim().toLowerCase()
    return trimmed && !trimmed.includes(':') ? `sha256:${trimmed}` : trimmed
}

const imageDigestProblem = (digest: string) => {
    if (!digest) return 'Image digest is required'
    if (/^sha256:[a-f0-9]{1,63}$/.test(digest)) return 'Digest looks truncated; a sha256 digest is 64 hex characters'
    if (!imageDigestRegex.test(digest)) return 'Must be a sha256 digest (e.g., sha256:<64 hex characters>)'
    return null
}

const imageDigestSchema = z
    .string()
    .transform(normalizeImageDigest)
    .superRefine((val, ctx) => {
        const problem = imageDigestProblem(val)
        if (problem) ctx.addIssue({ code: 'custom', message: problem })
    })

export const composeImageRef = (url: string, digest: string) => `${url.trim()}@${normalizeImageDigest(digest)}`

export const splitImageRef = (ref: string) => {
    const at = ref.lastIndexOf('@')
    return at === -1 ? { url: ref, digest: '' } : { url: ref.slice(0, at), digest: ref.slice(at + 1) }
}

export const imageDigestError = (digest: string) => imageDigestProblem(normalizeImageDigest(digest))

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
    language: z.enum(['R', 'PYTHON'], { error: 'Language must be R or PYTHON' }),
    url: unpinnedImageRefSchema,
    digest: imageDigestSchema,
    isTesting: z.boolean().default(false),
    settings: codeEnvSettingsSchema.default({ environment: [] }),
    sampleDataPath: z
        .string()
        .max(250)
        .refine((val) => val === '' || pathnameRegex.test(val), 'Must be a valid file path (e.g. data/sample.csv)')
        .optional(),
    dataSourceType: z.enum(dataSourceTypeKeys).nullable().optional(),
    dataSourceIds: z.array(z.uuid()).default([]),
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
            error: `Each starter code file must be non-empty and less than ${MAX_FILE_SIZE_STR}`,
        }),
    sampleDataUploaded: z.boolean().optional(),
})

export const editOrgCodeEnvSchema = codeEnvFieldsSchema.extend({
    starterCodes: z
        .array(z.instanceof(File))
        .refine((files) => files.every((f) => f.size < MAX_FILE_SIZE), {
            error: `Each starter code file must be less than ${MAX_FILE_SIZE_STR}`,
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
    .extend(newEnvVarFieldsSchema.shape)
    .superRefine(rejectDuplicateEnvVarName)
    .superRefine(requireCommandLineForEachExtension)

export const editOrgCodeEnvFormSchema = editOrgCodeEnvSchema
    .extend(newEnvVarFieldsSchema.shape)
    .superRefine(rejectDuplicateEnvVarName)
    .superRefine(requireCommandLineForEachExtension)

export const orgCodeEnvSchema = createOrgCodeEnvSchema
