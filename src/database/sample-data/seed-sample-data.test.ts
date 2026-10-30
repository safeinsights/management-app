import { actionResult, beforeAll, db, describe, expect, it, mockClerkSession } from '@/tests/unit.helpers'
import { fetchStudiesForOrgAction } from '@/server/actions/study-dashboard.actions'
import { isStudyUnread, rowStudyState } from '@/lib/study-screen/dashboard-raw-state'
import { TEST_USERS } from '../seeds/1743608138837_test_users'
import type { StudyRow } from '@/lib/study-screen/dashboard-row.types'
import { resolvePillId } from '@/lib/study-screen'
import { DEFAULT_REF_IDS } from './refs'
import { fileId, studyId } from './ids'
import { SAMPLE_STUDIES } from './studies'
import { seedSampleData } from './seed-sample-data'

const quiet = () => {}

const testUserId = (key: string) => TEST_USERS.find((u) => u.key === key)!.id

const dashboardRows = async (
    role: 'researcher' | 'reviewer',
    userId = role === 'researcher' ? DEFAULT_REF_IDS.researcherId : DEFAULT_REF_IDS.reviewerId,
) => {
    const orgId = role === 'researcher' ? DEFAULT_REF_IDS.labId : DEFAULT_REF_IDS.enclaveId
    const user = await db.selectFrom('user').select('clerkId').where('id', '=', userId).executeTakeFirstOrThrow()
    const org = await db.selectFrom('org').select('slug').where('id', '=', orgId).executeTakeFirstOrThrow()
    mockClerkSession({
        userId,
        clerkUserId: user.clerkId,
        orgSlug: org.slug,
        orgId,
        orgType: role === 'researcher' ? 'lab' : 'enclave',
    })
    return actionResult(await fetchStudiesForOrgAction({ orgSlug: org.slug })) as StudyRow[]
}

describe('seedSampleData', () => {
    beforeAll(async () => {
        await seedSampleData(db, { uploader: null, log: quiet })
    })

    it.each(['researcher', 'reviewer'] as const)(
        'shows each study on the %s org dashboard with its expected pill',
        async (role) => {
            const rows = await dashboardRows(role)
            for (const spec of SAMPLE_STUDIES) {
                const row = rows.find((r) => r.id === studyId(spec.n))
                const expected = spec.expectedPills[role]
                if (expected === null) {
                    expect(row, `#${spec.n} should not be listed for the ${role}`).toBeUndefined()
                    continue
                }
                expect(row, `#${spec.n} is missing for the ${role}`).toBeDefined()
                expect(resolvePillId(role, rowStudyState(row!)), `#${spec.n} ${spec.title}`).toBe(expected)
            }
        },
    )

    // QA accounts, not the fixed test users: an older spec wrote opened rows for those, and they stay.
    it.each([
        ['researcher', 'qa-researcher'],
        ['reviewer', 'qa-dp'],
    ] as const)('shows the %s side its unread dot only where it must act next (%s)', async (role, key) => {
        const rows = await dashboardRows(role, testUserId(key))
        for (const spec of SAMPLE_STUDIES.filter((s) => s.expectedPills[role] !== null)) {
            const row = rows.find((r) => r.id === studyId(spec.n))!
            expect(isStudyUnread(row, role), `#${spec.n} ${spec.title}`).toBe(!spec.openedBy.includes(role))
        }
    })

    it('adds missing opened rows for a study that already exists', async () => {
        const userId = testUserId('qa-dp')
        await db.deleteFrom('studyLastOpened').where('studyId', '=', studyId(19)).where('userId', '=', userId).execute()

        await seedSampleData(db, { uploader: null, log: quiet })

        const row = await db
            .selectFrom('studyLastOpened')
            .select('id')
            .where('studyId', '=', studyId(19))
            .where('userId', '=', userId)
            .executeTakeFirst()
        expect(row).toBeDefined()
    })

    it('writes nothing on a second run', async () => {
        const summary = await seedSampleData(db, { uploader: null, log: quiet })
        expect(summary).toMatchObject({ written: 0, skipped: SAMPLE_STUDIES.length, failed: 0 })
    })

    it('shares approved results with the lab through recipient keys', async () => {
        const keys = await db
            .selectFrom('studyJobFileRecipientKey')
            .select('filePath')
            .where('studyJobFileId', '=', fileId(19, 3))
            .execute()
        expect(keys.map((k) => k.filePath).sort()).toEqual(['results.csv', 'summary.txt'])
    })

    it('leaves a study unwritten when its upload fails, and carries on', async () => {
        const spec = { ...SAMPLE_STUDIES[11], n: 250, title: 'Upload failure probe' }
        const failing = {
            put: async () => {
                throw new Error('S3 is having a day')
            },
        }
        const summary = await seedSampleData(db, { uploader: failing, specs: [spec], log: quiet })

        expect(summary).toMatchObject({ written: 0, failed: 1 })
        expect(
            await db.selectFrom('study').select('id').where('id', '=', studyId(250)).executeTakeFirst(),
        ).toBeUndefined()
    })
})
