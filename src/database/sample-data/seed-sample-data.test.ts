import { actionResult, beforeAll, db, describe, expect, it, mockClerkSession } from '@/tests/unit.helpers'
import { fetchStudiesForOrgAction } from '@/server/actions/study-dashboard.actions'
import { isStudyUnread, rowStudyState } from '@/lib/study-screen/dashboard-raw-state'
import { TEST_CODE_ENVS, TEST_USERS } from '../seeds/1743608138837_test_users'
import type { StudyRow } from '@/lib/study-screen/dashboard-row.types'
import { resolvePillId } from '@/lib/study-screen'
import { DEFAULT_REF_IDS, SAMPLE_TARGET } from './refs'
import { fileId, studyId } from './ids'
import { SAMPLE_STUDIES } from './studies'
import { seedSampleData } from './seed-sample-data'

const quiet = () => {}

// Offset numbers: the DB can hold sample studies an older spec wrote under the base numbers.
const SPECS = SAMPLE_STUDIES.map((s) => ({ ...s, n: s.n + 100 }))

const testUserId = (key: string) => TEST_USERS.find((u) => u.key === key)!.id

const insertMarsU = () =>
    db
        .insertInto('org')
        .values([
            { slug: SAMPLE_TARGET.enclaveSlug, name: 'Mars University', email: 'mars@example.com', type: 'enclave' },
            { slug: SAMPLE_TARGET.labSlug, name: 'Mars University Lab', email: 'mars@example.com', type: 'lab' },
        ])
        .returning('id')
        .execute()

// Leaves the openstax code envs of the test-users seed unscanned, and returns their ids.
const unscanOpenstaxEnvs = async () => {
    const envs = await db
        .selectFrom('orgCodeEnv')
        .innerJoin('org', 'org.id', 'orgCodeEnv.orgId')
        .select('orgCodeEnv.id')
        .where('org.slug', '=', 'openstax')
        .where(
            'orgCodeEnv.name',
            'in',
            TEST_CODE_ENVS.map((env) => env.name),
        )
        .execute()
    const ids = envs.map((env) => env.id)
    await db.deleteFrom('codeScan').where('codeEnvId', 'in', ids).execute()
    return ids
}

const scansFor = (codeEnvIds: string[]) =>
    db.selectFrom('codeScan').select('codeEnvId').where('codeEnvId', 'in', codeEnvIds).execute()

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
        await seedSampleData(db, { uploader: null, rowsOnly: true, fixtureFallback: true, specs: SPECS, log: quiet })
    })

    it.each(['researcher', 'reviewer'] as const)(
        'shows each study on the %s org dashboard with its expected pill',
        async (role) => {
            const rows = await dashboardRows(role)
            for (const spec of SPECS) {
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
        for (const spec of SPECS.filter((s) => s.expectedPills[role] !== null)) {
            const row = rows.find((r) => r.id === studyId(spec.n))!
            expect(isStudyUnread(row, role), `#${spec.n} ${spec.title}`).toBe(!spec.openedBy.includes(role))
        }
    })

    it('puts each study back to its spec on a second run, dated from that run', async () => {
        const userId = testUserId('qa-dp')
        await db.updateTable('study').set({ title: 'Edited by hand' }).where('id', '=', studyId(119)).execute()
        await db
            .deleteFrom('studyLastOpened')
            .where('studyId', '=', studyId(119))
            .where('userId', '=', userId)
            .execute()
        const later = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

        const summary = await seedSampleData(db, {
            uploader: null,
            rowsOnly: true,
            fixtureFallback: true,
            specs: SPECS,
            now: later,
            log: quiet,
        })

        expect(summary).toMatchObject({ written: SPECS.length, failed: 0 })
        const spec = SPECS.find((s) => s.n === 119)!
        const study = await db
            .selectFrom('study')
            .select(['title', 'createdAt'])
            .where('id', '=', studyId(119))
            .executeTakeFirstOrThrow()
        expect(study.title).toBe(spec.title)
        expect(study.createdAt.getTime()).toBe(later.getTime() - spec.daysAgo * 24 * 60 * 60 * 1000)
        const opened = await db
            .selectFrom('studyLastOpened')
            .select('id')
            .where('studyId', '=', studyId(119))
            .where('userId', '=', userId)
            .executeTakeFirst()
        expect(opened).toBeDefined()
        const jobs = await db.selectFrom('studyJob').select('id').where('studyId', '=', studyId(119)).execute()
        expect(jobs).toHaveLength(1)
    })

    it('keeps the last rows of a study that fails to rebuild', async () => {
        const failing = {
            put: async () => {
                throw new Error('S3 is having a day')
            },
            prune: async () => {},
        }
        const summary = await seedSampleData(db, {
            uploader: failing,
            fixtureFallback: true,
            specs: [SPECS.find((s) => s.n === 119)!],
            log: quiet,
        })

        expect(summary).toMatchObject({ written: 0, failed: 1 })
        expect(
            await db.selectFrom('study').select('id').where('id', '=', studyId(119)).executeTakeFirst(),
        ).toBeDefined()
    })

    it('skips a study with files when there is no uploader', async () => {
        const spec = { ...SAMPLE_STUDIES[11], n: 251, title: 'No bucket probe' }
        const summary = await seedSampleData(db, { uploader: null, fixtureFallback: true, specs: [spec], log: quiet })

        expect(summary).toMatchObject({ written: 0, failed: 1 })
        expect(
            await db.selectFrom('study').select('id').where('id', '=', studyId(251)).executeTakeFirst(),
        ).toBeUndefined()
    })

    it('shares approved results with the lab through recipient keys', async () => {
        const keys = await db
            .selectFrom('studyJobFileRecipientKey')
            .select('filePath')
            .where('studyJobFileId', '=', fileId(119, 3))
            .execute()
        expect(keys.map((k) => k.filePath).sort()).toEqual(['results.csv', 'summary.txt'])
    })

    it('records lab activity on each file in the result archive', async () => {
        const activity = await db
            .selectFrom('studyJobFileActivity')
            .select(['filePath', 'action'])
            .where('studyJobFileId', '=', fileId(119, 3))
            .execute()
        expect(activity.map((a) => `${a.filePath} ${a.action}`).sort()).toEqual([
            'results.csv DOWNLOADED',
            'results.csv VIEWED',
            'summary.txt DOWNLOADED',
            'summary.txt VIEWED',
        ])
    })

    it('leaves a study unwritten when its upload fails, and carries on', async () => {
        const spec = { ...SAMPLE_STUDIES[11], n: 250, title: 'Upload failure probe' }
        const failing = {
            put: async () => {
                throw new Error('S3 is having a day')
            },
            prune: async () => {},
        }
        const summary = await seedSampleData(db, {
            uploader: failing,
            fixtureFallback: true,
            specs: [spec],
            log: quiet,
        })

        expect(summary).toMatchObject({ written: 0, failed: 1 })
        expect(
            await db.selectFrom('study').select('id').where('id', '=', studyId(250)).executeTakeFirst(),
        ).toBeUndefined()
    })

    it('clears the files QA added to a study folder, after its rows are written', async () => {
        const spec = { ...SAMPLE_STUDIES[11], n: 252, title: 'Prune probe' }
        const put: string[] = []
        const pruned: { folder: string; keep: string[] }[] = []
        const recording = {
            put: async ({ path }: { path: string }) => {
                put.push(path)
            },
            prune: async (folder: string, keep: string[]) => {
                pruned.push({ folder, keep })
            },
        }

        const summary = await seedSampleData(db, {
            uploader: recording,
            fixtureFallback: true,
            specs: [spec],
            log: quiet,
        })

        expect(summary).toMatchObject({ written: 1, failed: 0 })
        expect(put.length).toBeGreaterThan(0)
        expect(pruned).toEqual([{ folder: `studies/openstax/${studyId(252)}`, keep: put }])
    })

    it('counts a study as written when only clearing its folder fails', async () => {
        const spec = { ...SAMPLE_STUDIES[11], n: 253, title: 'Prune failure probe' }
        const lines: string[] = []
        const pruneFails = {
            put: async () => {},
            prune: async () => {
                throw new Error('AccessDenied')
            },
        }

        const summary = await seedSampleData(db, {
            uploader: pruneFails,
            fixtureFallback: true,
            specs: [spec],
            log: (line) => lines.push(line),
        })

        expect(summary).toMatchObject({ written: 1, failed: 0 })
        expect(lines.some((line) => line.includes('not cleared') && line.includes('AccessDenied'))).toBe(true)
    })
})

describe('seedSampleData target', () => {
    const spec = { ...SAMPLE_STUDIES[0], n: 260, title: 'Target probe' }

    it('writes nothing without Mars U when the openstax fixtures are not allowed', async () => {
        const summary = await seedSampleData(db, { uploader: null, rowsOnly: true, specs: [spec], log: quiet })

        expect(summary.written).toBe(0)
        expect(summary.missing).toEqual(expect.arrayContaining(['mars-u', 'mars-u-lab']))
        expect(
            await db.selectFrom('study').select('id').where('id', '=', studyId(260)).executeTakeFirst(),
        ).toBeUndefined()
    })

    it('writes to Mars U when it exists, even with the openstax fixtures allowed', async () => {
        const [enclave, lab] = await insertMarsU()

        const summary = await seedSampleData(db, {
            uploader: null,
            rowsOnly: true,
            fixtureFallback: true,
            specs: [spec],
            log: quiet,
        })

        expect(summary).toMatchObject({ written: 1, failed: 0 })
        const study = await db
            .selectFrom('study')
            .select(['orgId', 'submittedByOrgId', 'researcherId'])
            .where('id', '=', studyId(260))
            .executeTakeFirstOrThrow()
        expect(study).toEqual({
            orgId: enclave.id,
            submittedByOrgId: lab.id,
            researcherId: testUserId('qa-researcher'),
        })
    })

    it('does not mark the openstax code envs scanned when Mars U is the target', async () => {
        const envIds = await unscanOpenstaxEnvs()
        await insertMarsU()

        await seedSampleData(db, { uploader: null, rowsOnly: true, fixtureFallback: true, specs: [spec], log: quiet })

        expect(envIds.length).toBeGreaterThan(0)
        expect(await scansFor(envIds)).toEqual([])
    })

    it('marks the openstax code envs scanned when it falls back to the openstax fixtures', async () => {
        const envIds = await unscanOpenstaxEnvs()

        await seedSampleData(db, { uploader: null, rowsOnly: true, fixtureFallback: true, specs: [spec], log: quiet })

        expect(await scansFor(envIds)).toHaveLength(envIds.length)
    })
})
