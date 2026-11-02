import type { UserResource } from '@clerk/nextjs/types'
import logger from '@/lib/logger'

export type EnrolledCodes = { codes: string[]; hasExistingCodes: boolean }

// Clerk returns codes from an enrollment only when backup codes are enabled and the user has none yet, so
// backupCodeEnabled is read before the call. createBackupCode would need a fresh second factor (OTTER-975).
export async function enrollAndReadCodes(
    user: Pick<UserResource, 'backupCodeEnabled'> | null | undefined,
    enroll: () => Promise<{ backupCodes?: string[] } | null | undefined>,
): Promise<EnrolledCodes> {
    const hasExistingCodes = Boolean(user?.backupCodeEnabled)
    const codes = (await enroll())?.backupCodes ?? []
    if (!codes.length && !hasExistingCodes) {
        logger.error('MFA enrollment returned no recovery codes for a user without any')
    }
    return { codes, hasExistingCodes }
}
