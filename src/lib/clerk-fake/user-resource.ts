import { buildV3Metadata, defaultOrgSlug, type FakeFixture } from './fixtures'

export type FakeUser = ReturnType<typeof buildFakeUser>

// Addresses the app linked during a run. buildFakeUser rebuilds the user on every read, so without
// this a verified address would vanish on the next reload() and the linking flow could never settle.
const linkedEmails = new Map<string, string[]>()

export function buildFakeUser(fixture: FakeFixture) {
    const emailAddress = fixture.email
    const currentOrgSlug = defaultOrgSlug(fixture)
    const linked = linkedEmails.get(fixture.clerkId) ?? []

    return {
        id: fixture.clerkId,
        banned: false,
        twoFactorEnabled: true,
        backupCodeEnabled: false,
        firstName: fixture.firstName,
        lastName: fixture.lastName,
        fullName: `${fixture.firstName} ${fixture.lastName}`,
        imageUrl: '',
        primaryEmailAddress: { emailAddress },
        emailAddresses: [
            { emailAddress, id: `fake-email-${fixture.role}`, verification: { status: 'verified' } },
            ...linked.map((email) => ({
                emailAddress: email,
                id: `fake-email-${email}`,
                verification: { status: 'verified' },
            })),
        ],
        phoneNumbers: [] as Array<Record<string, unknown>>,
        publicMetadata: buildV3Metadata(fixture) as unknown as UserPublicMetadata,
        unsafeMetadata: { currentOrgSlug } as UserUnsafeMetadata,

        createTOTP: async () => ({
            id: 'fake-totp',
            secret: 'JBSWY3DPEHPK3PXP',
            uri: 'otpauth://totp/e2e?secret=JBSWY3DPEHPK3PXP',
        }),
        verifyTOTP: async () => ({ verified: true }),
        createBackupCode: async () => ({ codes: ['11111111', '22222222', '33333333'] }),
        createEmailAddress: async ({ email }: { email: string }) => ({
            id: `fake-email-${email}`,
            emailAddress: email,
            verification: { status: 'unverified' },
            prepareVerification: async () => {},
            attemptVerification: async () => {
                linkedEmails.set(fixture.clerkId, [...(linkedEmails.get(fixture.clerkId) ?? []), email])
                return { verification: { status: 'verified' } }
            },
            destroy: async () => {},
        }),
        createPhoneNumber: async ({ phoneNumber }: { phoneNumber: string }) => ({
            id: 'fake-phone',
            phoneNumber,
            prepareVerification: async () => {},
            attemptVerification: async () => ({ verification: { status: 'verified' } }),
            setReservedForSecondFactor: async () => {},
            makeDefaultSecondFactor: async () => {},
        }),
        reload: async () => {},
    }
}
