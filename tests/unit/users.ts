import { db } from '@/database'
import { faker } from '@faker-js/faker'
import { readTestSupportFile } from './files'
import { testEmail } from './identity'
import type { MinimalTestOrg } from './orgs'

export const insertTestUser = async ({
    org,
    isAdmin = false,
    useRealKeys = false,
    email,
}: {
    org: MinimalTestOrg
    isAdmin?: boolean
    useRealKeys?: boolean
    email?: string
}) => {
    const user = await db
        .insertInto('user')
        .values({
            clerkId: faker.string.alpha(10),
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            email: email ?? testEmail(),
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    const orgUser = await db
        .insertInto('orgUser')
        .values({
            orgId: org.id,
            userId: user.id,
            isAdmin,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    if (org.type === 'enclave') {
        let publicKey: Buffer
        let fingerprint: string

        if (useRealKeys) {
            const { pemToArrayBuffer, fingerprintKeyData } = await import('si-encryption/util')
            const publicKeyPem = await readTestSupportFile('public_key.pem')
            const publicKeyArrayBuffer = pemToArrayBuffer(publicKeyPem)
            publicKey = Buffer.from(publicKeyArrayBuffer)
            fingerprint = await fingerprintKeyData(publicKeyArrayBuffer)
        } else {
            publicKey = Buffer.from('testPublicKey1')
            fingerprint = 'testFingerprint1'
        }

        await db
            .insertInto('userPublicKey')
            .values({
                userId: user.id,
                publicKey,
                fingerprint,
            })
            .executeTakeFirstOrThrow()
    }

    return { user, orgUser }
}

// An invite the account has already accepted, which is what records the org that invited it.
export async function insertClaimedInvite({
    userId,
    orgId,
    createdAt,
}: {
    userId: string
    orgId: string
    createdAt?: Date
}) {
    return await db
        .insertInto('pendingUser')
        .values({
            email: testEmail(),
            orgId,
            isAdmin: false,
            claimedByUserId: userId,
            createdAt,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
}

export type InsertTestResearcherProfileOptions = {
    userId: string
    education?: {
        institution?: string
        degree?: string
        fieldOfStudy?: string
        isCurrentlyPursuing?: boolean
    }
    positions?: Array<{
        affiliation: string
        position: string
        profileUrl?: string
    }>
    researchDetails?: {
        interests?: string[]
        detailedPublicationsUrl?: string
        featuredPublicationsUrls?: string[]
    }
}

export const insertTestResearcherProfile = async (options: InsertTestResearcherProfileOptions) => {
    await db
        .insertInto('researcherProfile')
        .values({
            userId: options.userId,
            educationInstitution: options.education?.institution ?? null,
            educationDegree: options.education?.degree ?? null,
            educationFieldOfStudy: options.education?.fieldOfStudy ?? null,
            educationIsCurrentlyPursuing: options.education?.isCurrentlyPursuing ?? false,
            researchInterests: options.researchDetails?.interests ?? [],
            detailedPublicationsUrl: options.researchDetails?.detailedPublicationsUrl ?? null,
            featuredPublicationsUrls: options.researchDetails?.featuredPublicationsUrls ?? [],
        })
        .onConflict((oc) =>
            oc.column('userId').doUpdateSet({
                educationInstitution: options.education?.institution ?? null,
                educationDegree: options.education?.degree ?? null,
                educationFieldOfStudy: options.education?.fieldOfStudy ?? null,
                educationIsCurrentlyPursuing: options.education?.isCurrentlyPursuing ?? false,
                researchInterests: options.researchDetails?.interests ?? [],
                detailedPublicationsUrl: options.researchDetails?.detailedPublicationsUrl ?? null,
                featuredPublicationsUrls: options.researchDetails?.featuredPublicationsUrls ?? [],
            }),
        )
        .execute()

    const profile = await db
        .selectFrom('researcherProfile')
        .selectAll('researcherProfile')
        .where('userId', '=', options.userId)
        .executeTakeFirstOrThrow()

    await db.deleteFrom('researcherPosition').where('userId', '=', options.userId).execute()

    let positions: Array<{
        id: string
        affiliation: string
        position: string
        profileUrl: string | null
        sortOrder: number
    }> = []

    if (options.positions && options.positions.length > 0) {
        const rows = options.positions.map((p, idx) => ({
            userId: options.userId,
            affiliation: p.affiliation,
            position: p.position,
            profileUrl: p.profileUrl ?? null,
            sortOrder: idx,
        }))
        await db.insertInto('researcherPosition').values(rows).execute()

        positions = await db
            .selectFrom('researcherPosition')
            .select(['id', 'affiliation', 'position', 'profileUrl', 'sortOrder'])
            .where('userId', '=', options.userId)
            .orderBy('sortOrder', 'asc')
            .execute()
    }

    return { profile, positions }
}

export const getTestResearcherProfileData = async (userId: string) => {
    const user = await db
        .selectFrom('user')
        .select(['id', 'firstName', 'lastName', 'email'])
        .where('id', '=', userId)
        .executeTakeFirstOrThrow()

    await db
        .insertInto('researcherProfile')
        .values({ userId })
        .onConflict((oc) => oc.column('userId').doNothing())
        .execute()

    const profile = await db
        .selectFrom('researcherProfile')
        .select([
            'userId',
            'educationInstitution',
            'educationDegree',
            'educationFieldOfStudy',
            'educationIsCurrentlyPursuing',
            'researchInterests',
            'detailedPublicationsUrl',
            'featuredPublicationsUrls',
        ])
        .where('userId', '=', userId)
        .executeTakeFirstOrThrow()

    const positions = await db
        .selectFrom('researcherPosition')
        .select(['id', 'affiliation', 'position', 'profileUrl', 'sortOrder'])
        .where('userId', '=', userId)
        .orderBy('sortOrder', 'asc')
        .execute()

    return { user, profile, positions }
}
