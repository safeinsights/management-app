import { describe, it, expect, vi, type Mock } from 'vitest'
import {
    db,
    insertTestOrg,
    insertTestUser,
    insertTestStudyData,
    insertTestStudyOnly,
    mockSessionWithTestData,
    faker,
    qaEmail,
} from '@/tests/unit.helpers'
import { verifyToken } from '@clerk/nextjs/server'
import { headers } from 'next/headers'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return { ...actual, deleteFolderContents: vi.fn(async () => {}) }
})

const { DELETE } = await import('./route')

async function authenticate(options: { isSiAdmin?: boolean; isAdmin?: boolean; adminOf?: { id: string } } = {}) {
    const mocks = await mockSessionWithTestData({ isSiAdmin: options.isSiAdmin, isAdmin: options.isAdmin })
    if (!mocks.auth) throw new Error('expected a mocked clerk auth')
    if (options.adminOf) {
        await db
            .insertInto('orgUser')
            .values({ orgId: options.adminOf.id, userId: mocks.user.id, isAdmin: true })
            .execute()
    }
    const { userId, sessionClaims } = mocks.auth()
    ;(verifyToken as Mock).mockResolvedValue({ sub: userId, ...sessionClaims })
    ;(await headers()).set('Authorization', 'Bearer fake-clerk-session-token')
    return mocks
}

async function insertQaStudy() {
    const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const { user } = await insertTestUser({ org, email: qaEmail() })
    const { studyId } = await insertTestStudyData({ org, researcherId: user.id })
    return { org, user, studyId }
}

const deleteStudy = (studyId: string) =>
    DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ studyId }) })

const studyExists = async (studyId: string) =>
    Boolean(await db.selectFrom('study').select('id').where('id', '=', studyId).executeTakeFirst())

describe('DELETE /api/qa/studies/[studyId]', () => {
    it('deletes a QA study for an SI admin', async () => {
        await authenticate({ isSiAdmin: true })
        const { studyId } = await insertQaStudy()

        const response = await deleteStudy(studyId)

        expect(response.status).toBe(200)
        expect(await studyExists(studyId)).toBe(false)
    })

    it('lets an admin of the study org delete it', async () => {
        const { org, studyId } = await insertQaStudy()
        await authenticate({ isAdmin: true, adminOf: org })

        const response = await deleteStudy(studyId)

        expect(response.status).toBe(200)
        expect(await studyExists(studyId)).toBe(false)
    })

    it('rejects an admin of a different org', async () => {
        const { studyId } = await insertQaStudy()
        await authenticate({ isAdmin: true })

        const response = await deleteStudy(studyId)

        expect(response.status).toBe(403)
        expect(await studyExists(studyId)).toBe(true)
    })

    // A study is data of both the enclave that holds it and the lab that submitted it.
    it('rejects an admin of only the enclave when the lab is a different org', async () => {
        const enclave = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org: lab, email: qaEmail() })
        // Keeps its agreement: deleting a study has to take its legal documents with it.
        const { study } = await insertTestStudyOnly({ org: enclave, submittedByOrg: lab, researcherId: user.id })
        await authenticate({ isAdmin: true, adminOf: enclave })

        const response = await deleteStudy(study.id)

        expect(response.status).toBe(403)
        expect(await studyExists(study.id)).toBe(true)
    })

    it('lets an admin of both the enclave and the lab delete it', async () => {
        const enclave = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const lab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
        const { user } = await insertTestUser({ org: lab, email: qaEmail() })
        const { study } = await insertTestStudyOnly({ org: enclave, submittedByOrg: lab, researcherId: user.id })
        const mocks = await authenticate({ isAdmin: true, adminOf: enclave })
        await db.insertInto('orgUser').values({ orgId: lab.id, userId: mocks.user.id, isAdmin: true }).execute()

        const response = await deleteStudy(study.id)

        expect(response.status).toBe(200)
        expect(await studyExists(study.id)).toBe(false)
    })

    it('audits a refused request against the caller', async () => {
        const { studyId } = await insertQaStudy()
        const { user: caller } = await authenticate({ isAdmin: true })

        await deleteStudy(studyId)

        const rows = await db
            .selectFrom('audit')
            .select(['eventType', 'recordType', 'userId', 'metadata'])
            .where('recordId', '=', studyId)
            .execute()
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ eventType: 'DELETED', recordType: 'STUDY', userId: caller.id })
        expect(rows[0].metadata).toMatchObject({ outcome: 'refused' })
    })

    it('rejects a non-admin member of the study org', async () => {
        const { org, studyId } = await insertQaStudy()
        const mocks = await authenticate({ isAdmin: false })
        await db.insertInto('orgUser').values({ orgId: org.id, userId: mocks.user.id, isAdmin: false }).execute()

        const response = await deleteStudy(studyId)

        expect(response.status).toBe(403)
        expect(await studyExists(studyId)).toBe(true)
    })

    it('rejects an unauthenticated caller', async () => {
        const { studyId } = await insertQaStudy()
        // Headers persist across tests in this environment, so drop any token a prior test set.
        ;(await headers()).delete('Authorization')

        const response = await deleteStudy(studyId)

        expect(response.status).toBe(401)
        expect(await studyExists(studyId)).toBe(true)
    })

    it('returns 403 for a study owned by a non-QA researcher', async () => {
        const org = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
        const { user } = await insertTestUser({ org, email: 'real.person@corp.com' })
        const { studyId } = await insertTestStudyData({ org, researcherId: user.id })
        await authenticate({ isSiAdmin: true })

        const response = await deleteStudy(studyId)

        expect(response.status).toBe(403)
        expect(await studyExists(studyId)).toBe(true)
    })

    it('returns 404 for an unknown study', async () => {
        await authenticate({ isSiAdmin: true })

        expect((await deleteStudy(faker.string.uuid())).status).toBe(404)
    })
})
