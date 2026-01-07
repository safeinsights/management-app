/**
 * Shared utilities for Clerk user management.
 * This file has no Next.js dependencies so it can be used in scripts and tests.
 */

/**
 * Pattern to identify test users that are safe to delete.
 * Matches emails/names containing "test" or "delete" but NOT containing "dbfyq3" (production marker).
 */
export const TEST_USER_PATTERN = /^(?!.*dbfyq3).*(?:test|delete).*$/i

/**
 * Get the set of protected test user emails from environment variables.
 * These are the seeded test accounts used for E2E testing.
 */
export function getProtectedTestEmails(): Set<string> {
    return new Set(
        [process.env.CLERK_RESEARCHER_EMAIL, process.env.CLERK_REVIEWER_EMAIL, process.env.CLERK_ADMIN_EMAIL]
            .filter(Boolean)
            .map((e) => e!.toLowerCase()),
    )
}

/**
 * Check if a user is a test user based on their email addresses and name.
 * Test users have emails/names matching TEST_USER_PATTERN but are NOT in the protected set.
 */
export function isTestUser(
    user: {
        emailAddresses: Array<{ emailAddress: string }>
        firstName?: string | null
        lastName?: string | null
    },
    protectedEmails?: Set<string>,
): boolean {
    const protected_ = protectedEmails ?? getProtectedTestEmails()

    // Check if user is protected (seeded test accounts)
    const isProtected = user.emailAddresses.some((e) => protected_.has(e.emailAddress.toLowerCase()))
    if (isProtected) return false

    // Check if email or name matches test pattern
    const emailMatches = user.emailAddresses.some((e) => TEST_USER_PATTERN.test(e.emailAddress))
    const nameMatches = TEST_USER_PATTERN.test(user.firstName || '') || TEST_USER_PATTERN.test(user.lastName || '')

    return emailMatches || nameMatches
}
