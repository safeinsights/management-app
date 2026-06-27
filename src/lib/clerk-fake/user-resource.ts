// E2E Clerk fake — user resource.
//
// Builds the user object returned by both currentUser() (server) and useUser().user
// (client). Shape matches what the app reads off Clerk's User across the inventory:
// id, banned, twoFactorEnabled, firstName/lastName/fullName, primaryEmailAddress,
// emailAddresses, publicMetadata (v3), unsafeMetadata, plus MFA-setup method stubs.

import { buildV3Metadata, defaultOrgSlug, type FakeFixture } from './fixtures'

export type FakeUser = ReturnType<typeof buildFakeUser>

export function buildFakeUser(fixture: FakeFixture) {
    const emailAddress = fixture.email
    const currentOrgSlug = defaultOrgSlug(fixture)

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
        emailAddresses: [{ emailAddress, id: `fake-email-${fixture.role}` }],
        phoneNumbers: [] as Array<Record<string, unknown>>,
        publicMetadata: buildV3Metadata(fixture) as unknown as UserPublicMetadata,
        unsafeMetadata: { currentOrgSlug } as UserUnsafeMetadata,

        // MFA-setup method stubs (src/app/account/mfa/*). Expanded per failing spec.
        createTOTP: async () => ({
            id: 'fake-totp',
            secret: 'JBSWY3DPEHPK3PXP',
            uri: 'otpauth://totp/e2e?secret=JBSWY3DPEHPK3PXP',
        }),
        verifyTOTP: async () => ({ verified: true }),
        createBackupCode: async () => ({ codes: ['11111111', '22222222', '33333333'] }),
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
