// OTTER-497: reachable by any member of the submitting lab, closed to everyone outside it.
import { type ReactElement } from 'react'
import { describe, it, expect } from 'vitest'
import { insertTestStudyJobData, insertTestUser, mockClerkSession, mockSessionWithTestData } from '@/tests/unit.helpers'
import StudyEditAndResubmitRoute from './page'
import { EditResubmitForm } from './form'

// The route is a server component, so its output is inspected as a tree rather than rendered:
// Stack > EditResubmitProvider > EditResubmitForm.
const formProps = (page: ReactElement) => {
    const provider = (page.props as { children: ReactElement }).children
    const form = (provider.props as { children: ReactElement }).children
    expect(form.type).toBe(EditResubmitForm)
    return form.props as Parameters<typeof EditResubmitForm>[0]
}

describe('StudyEditAndResubmitRoute', () => {
    // The Researcher row's guidance and Update profile link act on the viewer's own profile, so
    // only the study's creator may see them (OTTER-762).
    it('marks the original researcher as the draft creator and hands the form the stored title', async () => {
        const { org, user: researcher } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: researcher.id,
            studyStatus: 'CHANGE-REQUESTED',
            title: 'Stored on Step 1',
        })

        const page = await StudyEditAndResubmitRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })

        const props = formProps(page as ReactElement)
        expect(props.isDraftCreator).toBe(true)
        expect(props.studyTitle).toBe('Stored on Step 1')
    })

    it('does not mark a same-lab teammate as the draft creator', async () => {
        const { org, user: ownerA } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: ownerA.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        const { user: teammate } = await insertTestUser({ org })
        mockClerkSession({
            userId: teammate.id,
            clerkUserId: teammate.clerkId,
            email: teammate.email ?? undefined,
            orgSlug: org.slug,
            orgId: org.id,
            orgType: 'lab',
        })

        const page = await StudyEditAndResubmitRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })

        expect(formProps(page as ReactElement).isDraftCreator).toBe(false)
    })

    it('renders for a same-lab member who is not the original researcher', async () => {
        const { org, user: ownerA } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: ownerA.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        const { user: teammate } = await insertTestUser({ org })
        mockClerkSession({
            userId: teammate.id,
            clerkUserId: teammate.clerkId,
            email: teammate.email ?? undefined,
            orgSlug: org.slug,
            orgId: org.id,
            orgType: 'lab',
        })

        const page = await StudyEditAndResubmitRoute({
            params: Promise.resolve({ orgSlug: org.slug, studyId: study.id }),
        })

        expect(page).toBeDefined()
    })

    it('returns notFound for a user outside the submitting lab', async () => {
        const { org: labA, user: ownerA } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org: labA,
            researcherId: ownerA.id,
            studyStatus: 'CHANGE-REQUESTED',
        })

        await mockSessionWithTestData({ orgType: 'lab' })

        const page = await StudyEditAndResubmitRoute({
            params: Promise.resolve({ orgSlug: labA.slug, studyId: study.id }),
        })

        expect(page).toBeUndefined()
    })
})
