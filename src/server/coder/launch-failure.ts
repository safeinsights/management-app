const MAX_LENGTH = 200

const KNOWN_FAILURES: Array<{ pattern: RegExp; message: string }> = [
    {
        pattern: /no URL scheme|invalid reference format/i,
        message:
            'The code environment image reference is invalid. Ask your organization admin to check it in the organization settings.',
    },
    {
        pattern: /CannotPullContainerError|pull access denied|manifest unknown|failed to resolve ref/i,
        message:
            'The code environment image could not be downloaded. Ask your organization admin to check that it exists and is accessible.',
    },
    {
        pattern: /validate parameter|rich parameter/i,
        message: 'The workspace template rejected the code environment settings.',
    },
    {
        pattern: /agent not ready|no agent yet/,
        message: 'The workspace was created, but the IDE never became ready.',
    },
]

const INTERNAL_IDENTIFIERS = [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    /\barn:aws[^\s"',]*/g,
    /\bsha256:[0-9a-f]{12,}/gi,
]

const firstLineWithoutIdentifiers = (raw: string) => {
    const firstLine = raw.trim().split('\n')[0].trim()
    const cleaned = INTERNAL_IDENTIFIERS.reduce((line, pattern) => line.replace(pattern, '…'), firstLine)
    return cleaned.length > MAX_LENGTH ? `${cleaned.slice(0, MAX_LENGTH - 1)}…` : cleaned
}

type CoderErrorBody = { message?: string; detail?: string; validations?: Array<{ detail?: string }> }

// Coder API errors arrive as a JSON body; build job errors and readiness reasons are plain text.
const coderErrorText = (raw: string) => {
    try {
        const body = JSON.parse(raw) as CoderErrorBody
        const parts = [body.message, body.detail, ...(body.validations ?? []).map((v) => v.detail)]
        return parts.filter(Boolean).join(': ') || raw
    } catch {
        return raw
    }
}

/** Turns the raw reason Coder reports for a failed launch into a short sentence a researcher can act on. */
export function describeLaunchFailure(raw: string | null | undefined): string | null {
    if (!raw?.trim()) return null
    const text = coderErrorText(raw)
    return KNOWN_FAILURES.find(({ pattern }) => pattern.test(text))?.message ?? firstLineWithoutIdentifiers(text)
}
