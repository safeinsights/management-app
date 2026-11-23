import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database'
import { insertTestCodeEnv, insertTestStudyOnly } from '@/tests/unit.helpers'
import { fetchCodeEnvForStudyId, selectCodeEnvSnapshot } from './code-env'

vi.mock('@/server/config', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/config')>()),
    CODER_DISABLED: false,
}))

const newUrl = () => `example.com/r-base:${randomUUID()}`

// An older environment whose image is built, and a newer one whose image is not.
const orgWithTwoEnvs = async () => {
    const { org, study } = await insertTestStudyOnly()
    const built = await insertTestCodeEnv({ orgId: org.id, language: 'R', url: newUrl() })
    await db
        .insertInto('microvmImage')
        .values({ url: built.url, status: 'IMAGE-READY', imageArn: 'arn:image', imageVersion: '1.0' })
        .execute()
    const building = await insertTestCodeEnv({ orgId: org.id, language: 'R', url: newUrl() })
    await db
        .updateTable('orgCodeEnv')
        .set({ createdAt: new Date(Date.now() + 60_000) })
        .where('id', '=', building.id)
        .execute()
    await db.insertInto('microvmImage').values({ url: building.url, status: 'IMAGE-RUNNING' }).execute()
    return { study, built, building }
}

afterEach(() => vi.unstubAllEnvs())

describe('the code environment a new study takes', () => {
    it('is the newest whose IDE image is usable, where the IDE runs on MicroVMs', async () => {
        vi.stubEnv('IDE_BACKEND', 'microvm')
        const { study, built } = await orgWithTwoEnvs()
        expect((await selectCodeEnvSnapshot(db, study.id).executeTakeFirst())?.id).toBe(built.id)
    })

    it('is the newest, where the IDE does not run on MicroVMs', async () => {
        vi.stubEnv('IDE_BACKEND', '')
        const { study, building } = await orgWithTwoEnvs()
        expect((await selectCodeEnvSnapshot(db, study.id).executeTakeFirst())?.id).toBe(building.id)
    })

    // Job approval and the study's frozen copy read this too, so it must never come back empty
    // because an image is still building or failed.
    it('is the newest when no environment has a usable image', async () => {
        vi.stubEnv('IDE_BACKEND', 'microvm')
        const { org, study } = await insertTestStudyOnly()
        const only = await insertTestCodeEnv({ orgId: org.id, language: 'R', url: newUrl() })
        await db.insertInto('microvmImage').values({ url: only.url, status: 'IMAGE-RUNNING' }).execute()
        expect((await selectCodeEnvSnapshot(db, study.id).executeTakeFirst())?.id).toBe(only.id)
    })

    // The rule picks a default. It must not take a code environment away from a study that has one.
    it('does not change a study that already froze a code environment', async () => {
        vi.stubEnv('IDE_BACKEND', 'microvm')
        const { study, building } = await orgWithTwoEnvs()
        await db
            .updateTable('study')
            .set({
                codeEnvSnapshot: {
                    id: building.id,
                    language: 'R',
                    dataSourceType: null,
                    url: building.url,
                    settings: { environment: [] },
                    commandLines: { r: 'Rscript %f' },
                },
            })
            .where('id', '=', study.id)
            .execute()
        expect((await fetchCodeEnvForStudyId(study.id, db)).url).toBe(building.url)
    })
})
