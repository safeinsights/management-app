import { describe, expect, it } from 'vitest'
import { db, insertTestOrg, insertTestUser } from '@/tests/unit.helpers'

// Verifies the CHECK constraint added in 1779000000000_allow_null_title_on_draft_study.ts.
// The constraint shape is:
//   status = 'DRAFT' OR (title IS NOT NULL AND length(btrim(title)) > 0)
describe('study_title_required_when_not_draft constraint', () => {
    async function setupOrgAndResearcher() {
        const org = await insertTestOrg()
        const { user } = await insertTestUser({ org })
        return { org, researcherId: user.id }
    }

    function studyValues({
        orgId,
        researcherId,
        title,
        status,
    }: {
        orgId: string
        researcherId: string
        title: string | null
        status: 'DRAFT' | 'PENDING-REVIEW' | 'APPROVED'
    }) {
        return {
            orgId,
            submittedByOrgId: orgId,
            containerLocation: 'test-container',
            title,
            researcherId,
            piName: 'test',
            status,
            dataSources: ['all'],
            outputMimeType: 'text/csv',
            language: 'R' as const,
        }
    }

    it('allows DRAFT with NULL title', async () => {
        const { org, researcherId } = await setupOrgAndResearcher()
        const inserted = await db
            .insertInto('study')
            .values(studyValues({ orgId: org.id, researcherId, title: null, status: 'DRAFT' }))
            .returning(['id', 'title', 'status'])
            .executeTakeFirstOrThrow()
        expect(inserted.title).toBeNull()
        expect(inserted.status).toBe('DRAFT')
    })

    it('rejects non-DRAFT insert with NULL title', async () => {
        const { org, researcherId } = await setupOrgAndResearcher()
        await expect(
            db
                .insertInto('study')
                .values(studyValues({ orgId: org.id, researcherId, title: null, status: 'PENDING-REVIEW' }))
                .execute(),
        ).rejects.toThrow(/study_title_required_when_not_draft/)
    })

    it('rejects non-DRAFT insert with whitespace-only title', async () => {
        const { org, researcherId } = await setupOrgAndResearcher()
        await expect(
            db
                .insertInto('study')
                .values(studyValues({ orgId: org.id, researcherId, title: '   ', status: 'APPROVED' }))
                .execute(),
        ).rejects.toThrow(/study_title_required_when_not_draft/)
    })

    it('rejects transitioning a NULL-title DRAFT out of DRAFT', async () => {
        const { org, researcherId } = await setupOrgAndResearcher()
        const draft = await db
            .insertInto('study')
            .values(studyValues({ orgId: org.id, researcherId, title: null, status: 'DRAFT' }))
            .returning('id')
            .executeTakeFirstOrThrow()

        await expect(
            db.updateTable('study').set({ status: 'PENDING-REVIEW' }).where('id', '=', draft.id).execute(),
        ).rejects.toThrow(/study_title_required_when_not_draft/)
    })
})
