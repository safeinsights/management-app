import { db } from '@/database'
import type { Language, StudyStatus } from '@/database/types'
import { CLERK_ADMIN_ORG_SLUG } from '@/lib/types'
import { findOrCreateOrgMembership } from '@/server/db/mutations'
import { onSaveDraftStudyAction } from '@/server/actions/study-proposal.actions'
import { actionResult } from '@/lib/utils'
import { faker } from '@faker-js/faker'
import { mockClerkSession } from './clerk'
import { insertTestOrg } from './orgs'
import { insertTestStudyJobData } from './studies'
import { insertTestUser } from './users'

type MockSessionWithTestDataOptions = {
    orgSlug?: string
    orgType?: 'enclave' | 'lab'
    isAdmin?: boolean
    isSiAdmin?: boolean
    clerkId?: string
    twoFactorEnabled?: boolean
    useRealKeys?: boolean
}

export async function mockSessionWithTestData(options: MockSessionWithTestDataOptions = {}) {
    if (!options.orgSlug) options.orgSlug = options.isSiAdmin ? CLERK_ADMIN_ORG_SLUG : faker.string.alpha(10)

    const org = await insertTestOrg({ slug: options.orgSlug, type: options.orgType })
    const { user, orgUser } = await insertTestUser({
        org: { id: org.id, slug: options.orgSlug, type: org.type },
        isAdmin: options.isAdmin,
        useRealKeys: options.useRealKeys,
    })

    if (options.isSiAdmin) {
        await insertTestOrg({ slug: CLERK_ADMIN_ORG_SLUG })
        await findOrCreateOrgMembership({ userId: user.id, slug: CLERK_ADMIN_ORG_SLUG, isAdmin: true })
    }

    const mocks = mockClerkSession({
        userId: user.id,
        clerkUserId: user.clerkId,
        email: user.email ?? undefined,
        orgSlug: org.slug,
        orgId: org.id,
        roles: {
            isAdmin: options.isAdmin ?? false,
        },
        orgType: options.orgType ?? 'enclave',
        isSiAdmin: options.isSiAdmin,
        twoFactorEnabled: options.twoFactorEnabled,
    })

    const session = { user, org: { id: org.id, slug: org.slug } }

    // Publishing needs an SI admin, which replaces the session. Callers that then act as this user
    // again need their own session back, not a fresh member of the same org.
    const restoreSession = () =>
        mockClerkSession({
            userId: user.id,
            clerkUserId: user.clerkId,
            email: user.email ?? undefined,
            orgSlug: org.slug,
            orgId: org.id,
            roles: { isAdmin: options.isAdmin ?? false },
            orgType: org.type,
            isSiAdmin: options.isSiAdmin,
        })

    return { session, org, user, orgUser, restoreSession, ...mocks }
}

// Only enclave members get a key from insertTestUser, so lab sessions need no helper to be keyless.
export async function mockKeylessSession(options: MockSessionWithTestDataOptions = {}) {
    const session = await mockSessionWithTestData(options)
    await db.deleteFrom('userPublicKey').where('userId', '=', session.user.id).execute()
    return session
}

// A signed-in user holding no key, with a live invite to a second org. Every sign-in screen has to
// accept the invite before the key detour redirects, or the membership is lost. Pass invitedEmail to
// build the OTTER-788 case, where the invite was addressed to something the account does not own yet.
export async function insertKeylessInvitedUser({ invitedEmail }: { invitedEmail?: string } = {}) {
    const { user, org } = await mockSessionWithTestData({ orgType: 'lab' })

    const email = invitedEmail ?? user.email!
    const invitingOrg = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const invite = await db
        .insertInto('pendingUser')
        .values({ email, orgId: invitingOrg.id, isAdmin: false })
        .returning('id')
        .executeTakeFirstOrThrow()

    return { user, org, invitingOrg, invite, invitedEmail: email }
}

type MockDualRoleSessionOptions = {
    labSlug?: string
    enclaveSlug?: string
    twoFactorEnabled?: boolean
}

// A user who is a member of BOTH a lab and an enclave, so server actions resolve the dual-role
// session the real app would.
export async function mockDualRoleSessionWithTestData(options: MockDualRoleSessionOptions = {}) {
    const labOrg = await insertTestOrg({ slug: options.labSlug ?? faker.string.alpha(10), type: 'lab' })
    const enclaveOrg = await insertTestOrg({ slug: options.enclaveSlug ?? faker.string.alpha(10), type: 'enclave' })

    const { user } = await insertTestUser({ org: { id: labOrg.id, slug: labOrg.slug, type: 'lab' } })
    await findOrCreateOrgMembership({ userId: user.id, slug: enclaveOrg.slug, isAdmin: false })

    const mocks = mockClerkSession({
        userId: user.id,
        clerkUserId: user.clerkId,
        email: user.email ?? undefined,
        orgSlug: labOrg.slug,
        orgId: labOrg.id,
        orgType: 'lab',
        twoFactorEnabled: options.twoFactorEnabled,
        extraOrgs: [{ slug: enclaveOrg.slug, id: enclaveOrg.id, type: 'enclave' }],
    })

    return { user, labOrg, enclaveOrg, ...mocks }
}

// A signed-in Data Partner member, and a study their org reviews for a lab they do not belong to.
export async function mockDataPartnerSessionWithLabStudy({ studyStatus }: { studyStatus: StudyStatus }) {
    const { org: enclave } = await mockSessionWithTestData({ orgType: 'enclave' })
    const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { study } = await insertTestStudyJobData({ org: enclave, submittedByOrg: lab, studyStatus })
    return { enclave, lab, study }
}

type CreateTestProposalDraftOptions = {
    /** Unique enclave slug for this test. The lab counterpart is derived as `${enclaveSlug}-lab`. */
    enclaveSlug: string
    studyInfo?: {
        title?: string
        piName?: string
        language?: Language
    }
}

// OTTER-497. Preferred over `insertTestStudyOnly` for collaboration tests, which collapse both
// org ids to one and so do not match the production lab/enclave split.
export async function createTestProposalDraft({ enclaveSlug, studyInfo = {} }: CreateTestProposalDraftOptions) {
    const enclave = await insertTestOrg({ type: 'enclave', slug: enclaveSlug })
    const lab = await insertTestOrg({ slug: `${enclave.slug}-lab`, type: 'lab' })
    const session = await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })

    const draft = actionResult(
        await onSaveDraftStudyAction({
            orgSlug: enclave.slug,
            studyInfo: { title: 'Test draft', piName: 'PI', language: 'R', ...studyInfo },
            submittingOrgSlug: lab.slug,
        }),
    )

    return { enclave, lab, studyId: draft.studyId, user: session.user }
}
