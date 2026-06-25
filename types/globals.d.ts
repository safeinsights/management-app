export {}

declare global {
    // window.Clerk surface used by the e2e helpers (tests/e2e.helpers.ts). Previously
    // this type came from @clerk/testing's global augmentation; with the in-app Clerk
    // fake (src/lib/clerk-fake/window-bridge.ts) we declare the consumed shape here.
    interface FakeWindowSignIn {
        status: string
        createdSessionId: string | null
        supportedSecondFactors?: Array<{ strategy: string; safeIdentifier?: string }> | null
        prepareSecondFactor(params: { strategy: string }): Promise<FakeWindowSignIn>
        attemptSecondFactor(params: { strategy: string; code: string }): Promise<FakeWindowSignIn>
    }
    // Non-optional: the helpers run in the browser context where the fake's window-bridge
    // has installed window.Clerk before they execute.
    interface Window {
        Clerk: {
            loaded?: boolean
            status?: string
            user?: {
                primaryEmailAddress?: { emailAddress?: string }
                publicMetadata?: { orgs?: Record<string, unknown>; teams?: Record<string, unknown> }
            } | null
            session?: { id?: string; end: () => Promise<void> } | null
            client?: {
                signIn: { create(params: { identifier: string; password?: string }): Promise<FakeWindowSignIn> }
            } | null
            setActive: (params: { session: string | null }) => Promise<void>
            signOut?: () => Promise<void>
        }
        isReactHydrated?: boolean
    }

    // V1 format (legacy)
    interface UserOrgMembershipInfoV1 {
        id: string
        slug: string
        isAdmin: boolean
        isReviewer: boolean
        isResearcher: boolean
    }

    // V2 format (new)
    interface UserOrgMembershipInfo {
        id: string
        slug: string
        type: 'enclave' | 'lab'
        isAdmin: boolean
    }

    interface UserInfo {
        format?: 'v3' // Version indicator
        user: {
            id: string
        }
        teams: null
        orgs: {
            [k: string]: UserOrgMembershipInfo
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges with Clerk's UserPublicMetadata interface
    interface UserPublicMetadata extends UserInfo {}

    interface UserPreferences {
        currentOrgSlug?: string
    }

    type UserUnsafeMetadata = UserPreferences

    interface CustomJwtSessionClaims {
        hasMFA?: boolean
        unsafeMetadata?: UserPreferences
        userMetadata?: UserInfo
    }

    interface Window {
        isReactHydrated: undefined | true
    }
}
