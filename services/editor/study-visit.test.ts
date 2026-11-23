import { CompiledQuery } from 'kysely'
import {
    db,
    describe,
    expect,
    insertTestStudyJobData,
    insertTestUser,
    it,
    mockSessionWithTestData,
} from '../../tests/unit.helpers'
// Relative: this folder's own tsconfig has no @/ alias.
import { editorUserIds, markStudyOpenedByEditors } from './study-visit.ts'

// The editor service talks to Postgres through a bare pg-style query; run it on the test database.
const pgQuery = {
    async query<T>(text: string, values?: unknown[]) {
        const result = await db.executeQuery<T>(CompiledQuery.raw(text, values))
        return { rows: result.rows, rowCount: Number(result.numAffectedRows ?? 0) }
    },
}

const openedAt = async (studyId: string, userId: string) =>
    (
        await db
            .selectFrom('studyLastOpened')
            .select('openedAt')
            .where('studyId', '=', studyId)
            .where('userId', '=', userId)
            .executeTakeFirst()
    )?.openedAt

describe('editorUserIds', () => {
    it('collects each connected user once and skips contexts without a user', () => {
        const author = { user: { id: 'a', clerkId: 'ca' }, studyId: 's' }
        const viewer = { user: { id: 'b', clerkId: 'cb' }, studyId: 's' }

        expect(editorUserIds([author, viewer, author, {}, undefined])).toEqual(['a', 'b'])
    })
})

describe('markStudyOpenedByEditors', () => {
    it('stamps an edit stored after its author left as seen by that author only', async () => {
        const { org, user: author } = await mockSessionWithTestData({ orgType: 'lab' })
        const { user: coAuthor } = await insertTestUser({ org })
        const { study } = await insertTestStudyJobData({ org, researcherId: author.id })

        await markStudyOpenedByEditors(study.id, [author.id], pgQuery)

        expect(await openedAt(study.id, author.id)).toBeInstanceOf(Date)
        expect(await openedAt(study.id, coAuthor.id)).toBeUndefined()
    })

    it('never moves an existing stamp back', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })
        const later = new Date(Date.now() + 60 * 60 * 1000)
        await db.insertInto('studyLastOpened').values({ studyId: study.id, userId: user.id, openedAt: later }).execute()

        await markStudyOpenedByEditors(study.id, [user.id], pgQuery)

        expect(await openedAt(study.id, user.id)).toEqual(later)
    })
})
