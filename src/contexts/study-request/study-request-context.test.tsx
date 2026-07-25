import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import {
    act,
    createTestQueryWrapper,
    db,
    insertTestOrg,
    mockSessionWithTestData,
    renderHook,
    waitFor,
} from '@/tests/unit.helpers'
import { StudyRequestProvider, useStudyRequest } from './index'

// OTTER-636 Phase 7: choosing a Data Partner is the first persistable Step-1 edit and must lazy-create
// the draft, so a brand-new proposal is not lost if the researcher leaves before "Proceed to Step 2".
const setupOrgs = async (slug: string) => {
    const enclave = await insertTestOrg({ type: 'enclave', slug })
    const lab = await insertTestOrg({ type: 'lab', slug: `${slug}-lab` })
    await mockSessionWithTestData({ orgSlug: lab.slug, orgType: 'lab' })
    return { enclave, lab }
}

const wrapperFor = (submittingOrgSlug: string) => {
    const QueryWrapper = createTestQueryWrapper()
    const Wrapper = ({ children }: { children: ReactNode }) => (
        <QueryWrapper>
            <StudyRequestProvider submittingOrgSlug={submittingOrgSlug}>{children}</StudyRequestProvider>
        </QueryWrapper>
    )
    return Wrapper
}

describe('StudyRequestProvider lazy-create (Phase 7)', () => {
    it('creates a DRAFT the moment a Data Partner is selected', async () => {
        const { enclave, lab } = await setupOrgs('lazy-create-enclave')

        const { result } = renderHook(() => useStudyRequest(), { wrapper: wrapperFor(lab.slug) })
        expect(result.current.studyId).toBeNull()

        act(() => {
            result.current.form.setFieldValue('orgSlug', enclave.slug)
        })

        await waitFor(() => expect(result.current.studyId).toBeTruthy())

        const study = await db
            .selectFrom('study')
            .select(['status', 'orgId', 'submittedByOrgId'])
            .where('id', '=', result.current.studyId as string)
            .executeTakeFirstOrThrow()
        expect(study.status).toBe('DRAFT')
        expect(study.orgId).toBe(enclave.id)
        expect(study.submittedByOrgId).toBe(lab.id)
    })

    it('creates exactly one draft even when Step-1 fields change repeatedly', async () => {
        const { enclave, lab } = await setupOrgs('lazy-create-once-enclave')

        const { result } = renderHook(() => useStudyRequest(), { wrapper: wrapperFor(lab.slug) })

        act(() => {
            result.current.form.setFieldValue('orgSlug', enclave.slug)
        })
        await waitFor(() => expect(result.current.studyId).toBeTruthy())

        // Further Step-1 edits autosave onto the same row; they must never create a second draft.
        act(() => {
            result.current.form.setFieldValue('language', 'R')
        })
        await waitFor(() => expect(result.current.isSaving).toBe(false))

        const rows = await db.selectFrom('study').select('id').where('submittedByOrgId', '=', lab.id).execute()
        expect(rows).toHaveLength(1)
    })
})
