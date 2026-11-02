import logger from '@/lib/logger'

// Clerk returns codes from an enrollment only when backup codes are enabled and the user has none yet.
// createBackupCode is not an option: right after enrollment it needs a fresh second factor (OTTER-975).
export function codesFromEnrollment(returned: string[] | undefined, hadCodes: boolean) {
    const codes = returned ?? []
    if (!codes.length && !hadCodes) logger.error('MFA enrollment returned no recovery codes for a user without any')
    return codes
}
