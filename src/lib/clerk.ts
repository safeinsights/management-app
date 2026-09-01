// No Next.js dependencies so this can be used in scripts and tests.

// "dbfyq3" marks the seeded production-like accounts, which must never be deleted.
export const TEST_USER_PATTERN = /^(?!.*dbfyq3).*(?:test|delete).*$/i

export function getProtectedTestEmails(): Set<string> {
    return new Set(
        [process.env.CLERK_RESEARCHER_EMAIL, process.env.CLERK_REVIEWER_EMAIL, process.env.CLERK_ADMIN_EMAIL]
            .filter(Boolean)
            .map((e) => e!.toLowerCase()),
    )
}

export function isTestUser(
    user: {
        emailAddresses: Array<{ emailAddress: string }>
        firstName?: string | null
        lastName?: string | null
    },
    protectedEmails?: Set<string>,
): boolean {
    const protected_ = protectedEmails ?? getProtectedTestEmails()

    const isProtected = user.emailAddresses.some((e) => protected_.has(e.emailAddress.toLowerCase()))
    if (isProtected) return false

    const emailMatches = user.emailAddresses.some((e) => TEST_USER_PATTERN.test(e.emailAddress))
    const nameMatches = TEST_USER_PATTERN.test(user.firstName || '') || TEST_USER_PATTERN.test(user.lastName || '')

    return emailMatches || nameMatches
}
