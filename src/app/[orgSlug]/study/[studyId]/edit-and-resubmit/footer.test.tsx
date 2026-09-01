import { useEffect } from 'react'
import { TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { memoryRouter } from 'next-router-mock'
import {
    BLANK_UUID,
    db,
    describe,
    expect,
    insertTestStudyJobData,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
    type Mock,
} from '@/tests/unit.helpers'
import { EditResubmitProvider, useEditResubmit, type EditResubmitDraftData } from '@/contexts/edit-resubmit'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { lexicalJson } from '@/lib/lexical'
import { Routes } from '@/lib/routes'
import { ResubmissionNoteSection } from '@/components/study/resubmission-note-section'
import { EditResubmitFooter } from './footer'

function NoteSection({ orgName }: { orgName: string }) {
    const { noteForm } = useEditResubmit()
    return <ResubmissionNoteSection noteForm={noteForm} orgName={orgName} />
}

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

const wordsString = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

const VALID_PROPOSAL_DRAFT: EditResubmitDraftData = {
    title: 'A valid title',
    datasets: ['some-dataset'],
    researchQuestions: lexicalJson('Some research questions'),
    projectSummary: lexicalJson('A project summary'),
    impact: lexicalJson('Some impact'),
    piName: 'PI Name',
    piUserId: '22222222-2222-4222-8222-222222222222',
}

const renderFooterWithNoteSection = (draft: EditResubmitDraftData = VALID_PROPOSAL_DRAFT) =>
    renderWithProviders(
        <EditResubmitProvider studyId={STUDY_ID} draftData={draft}>
            <NoteSection orgName="Rice University" />
            <EditResubmitFooter researcherName="Test Researcher" researcherId="" />
        </EditResubmitProvider>,
    )

describe('EditResubmitFooter — note gating (OTTER-521)', () => {
    it('disables Resubmit on first paint when the resubmission note is empty, even if the proposal form is otherwise valid', () => {
        renderFooterWithNoteSection()
        const resubmit = screen.getByRole('button', { name: /Resubmit initial request/i })
        expect(resubmit).toBeDisabled()
    })

    it('enables Resubmit once a valid note is pasted and the proposal form is valid', async () => {
        const user = userEvent.setup()
        renderFooterWithNoteSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.paste('x')
        const resubmit = screen.getByRole('button', { name: /Resubmit initial request/i })
        expect(resubmit).toBeEnabled()
    })
})

// Every required proposal field populated except the title, reproducing OTTER-557.
const fullyValidExceptTitle: ProposalFormValues = {
    title: '',
    datasets: ['dataset-1'],
    researchQuestions: lexicalJson('What is the primary research question?'),
    projectSummary: lexicalJson('This study examines outcomes.'),
    impact: lexicalJson('Findings will inform practice.'),
    additionalNotes: '',
    piName: 'Jane Smith',
    piUserId: BLANK_UUID,
}

const VALID_NOTE = wordsString(60)

// Primes the note form in an effect: updating form state during render triggers React's
// cross-component setState warning.
const FormProbes = ({ titleOverride }: { titleOverride?: string }) => {
    const { form, noteForm } = useEditResubmit()
    useEffect(() => {
        if (noteForm.values.resubmissionNote !== VALID_NOTE) {
            noteForm.setFieldValue('resubmissionNote', VALID_NOTE)
        }
        if (titleOverride !== undefined && form.values.title !== titleOverride) {
            form.setFieldValue('title', titleOverride)
        }
    })
    return null
}

const TitleInputProbe = () => {
    const { form } = useEditResubmit()
    return <TextInput aria-label="Study Title Probe" {...form.getInputProps('title')} />
}

const renderFooterWithTitleProbes = (draftData: ProposalFormValues = fullyValidExceptTitle, titleOverride?: string) =>
    renderWithProviders(
        <EditResubmitProvider studyId={STUDY_ID} draftData={draftData}>
            <FormProbes titleOverride={titleOverride} />
            <EditResubmitFooter researcherName="Researcher" researcherId="researcher-1" />
        </EditResubmitProvider>,
    )

describe('EditResubmitFooter — title gating (OTTER-557)', () => {
    it('keeps Resubmit disabled when the title is empty', () => {
        renderFooterWithTitleProbes()
        expect(screen.getByRole('button', { name: 'Resubmit initial request' })).toBeDisabled()
    })

    it('keeps Resubmit disabled when the title is whitespace only', () => {
        renderFooterWithTitleProbes(fullyValidExceptTitle, '   ')
        expect(screen.getByRole('button', { name: 'Resubmit initial request' })).toBeDisabled()
    })

    it('enables Resubmit when the researcher provides a real title', () => {
        renderFooterWithTitleProbes(fullyValidExceptTitle, 'My Real Study Title')
        expect(screen.getByRole('button', { name: 'Resubmit initial request' })).toBeEnabled()
    })

    it('enables Resubmit after the researcher types a real title in the form input', async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} draftData={fullyValidExceptTitle}>
                <FormProbes />
                <TitleInputProbe />
                <EditResubmitFooter researcherName="Researcher" researcherId="researcher-1" />
            </EditResubmitProvider>,
        )

        const submit = screen.getByRole('button', { name: 'Resubmit initial request' })
        expect(submit).toBeDisabled()

        await user.clear(screen.getByLabelText('Study Title Probe'))
        await user.type(screen.getByLabelText('Study Title Probe'), 'My Real Study Title')

        expect(submit).toBeEnabled()
    })
})

describe('EditResubmitFooter — confirmation modal (OTTER-568)', () => {
    it('opens the modal with the resubmission title and body copy', async () => {
        const user = userEvent.setup()
        renderFooterWithTitleProbes(fullyValidExceptTitle, 'My Real Study Title')

        await user.click(screen.getByRole('button', { name: 'Resubmit initial request' }))

        expect(screen.getByText('Confirm initial request resubmission?')).toBeInTheDocument()
        expect(screen.getByText(/ready to resubmit your initial request/i)).toBeInTheDocument()
    })

    it('dismisses the modal when Cancel is clicked', async () => {
        const user = userEvent.setup()
        renderFooterWithTitleProbes(fullyValidExceptTitle, 'My Real Study Title')

        await user.click(screen.getByRole('button', { name: 'Resubmit initial request' }))
        await user.click(screen.getByRole('button', { name: 'Cancel' }))

        await waitFor(() =>
            expect(screen.queryByText(/ready to resubmit your initial request/i)).not.toBeInTheDocument(),
        )
    })
})

// Yjs autosave is inactive in single-user mode, so Back must flush the form to the study row or
// edits made since page load are lost (OTTER-573).
describe('EditResubmitFooter — save-on-navigate (OTTER-573)', () => {
    const setupChangeRequestedStudy = async (studyStatus: 'CHANGE-REQUESTED' | 'PENDING-REVIEW') => {
        const { org, user: researcher } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({
            org,
            researcherId: researcher.id,
            studyStatus,
            title: 'Original title',
        })
        memoryRouter.setCurrentUrl('/start')
        return { org, researcher, study }
    }

    // piUserId must reference a real user row or the flush trips the foreign key.
    const renderFooterForStudy = (studyId: string, title: string, piUserId: string) =>
        renderWithProviders(
            <EditResubmitProvider studyId={studyId} draftData={{ ...VALID_PROPOSAL_DRAFT, title, piUserId }}>
                <TitleInputProbe />
                <EditResubmitFooter researcherName="Researcher" researcherId="researcher-1" />
            </EditResubmitProvider>,
        )

    const retypeTitle = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
        await user.clear(screen.getByLabelText('Study Title Probe'))
        await user.type(screen.getByLabelText('Study Title Probe'), title)
    }

    it('flushes edited fields to the study row, then navigates back to the submitted view', async () => {
        const user = userEvent.setup()
        const { org, researcher, study } = await setupChangeRequestedStudy('CHANGE-REQUESTED')

        renderFooterForStudy(study.id, 'Original title', researcher.id)
        await retypeTitle(user, 'Saved on Back')

        await user.click(screen.getByRole('button', { name: 'Back' }))

        await waitFor(
            () => expect(memoryRouter.asPath).toBe(Routes.studySubmitted({ orgSlug: org.slug, studyId: study.id })),
            { timeout: 5000 },
        )

        const after = await db
            .selectFrom('study')
            .select(['title', 'status'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.title).toBe('Saved on Back')
        expect(after.status).toBe('CHANGE-REQUESTED')
    })

    it('preserves the stored title when the form title is blank mid-rename', async () => {
        const user = userEvent.setup()
        const { org, researcher, study } = await setupChangeRequestedStudy('CHANGE-REQUESTED')

        renderFooterForStudy(study.id, 'Original title', researcher.id)
        // Nulling the column would violate study_title_required_when_not_draft, so the flush
        // must skip the title but still save the rest.
        await user.clear(screen.getByLabelText('Study Title Probe'))

        await user.click(screen.getByRole('button', { name: 'Back' }))

        await waitFor(
            () => expect(memoryRouter.asPath).toBe(Routes.studySubmitted({ orgSlug: org.slug, studyId: study.id })),
            { timeout: 5000 },
        )

        const after = await db
            .selectFrom('study')
            .select(['title', 'piName'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.title).toBe('Original title')
        expect(after.piName).toBe('PI Name')
    })

    // The server only serves PI profiles the persisted study row names, so opening the modal on
    // unsaved state would show "Profile not available" (OTTER-724).
    it('flushes the draft to the study row before opening the reviewer preview', async () => {
        const user = userEvent.setup()
        const { researcher, study } = await setupChangeRequestedStudy('CHANGE-REQUESTED')

        renderFooterForStudy(study.id, 'Original title', researcher.id)
        await retypeTitle(user, 'Saved before preview')

        await user.click(screen.getByRole('button', { name: 'View as reviewer' }))

        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument(), { timeout: 5000 })

        const after = await db
            .selectFrom('study')
            .select(['title', 'piUserId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.title).toBe('Saved before preview')
        expect(after.piUserId).toBe(researcher.id)
    })

    it('reports the error and stays on the page when the flush fails', async () => {
        const user = userEvent.setup()
        const { researcher, study } = await setupChangeRequestedStudy('PENDING-REVIEW')
        ;(notifications.show as Mock).mockClear()

        renderFooterForStudy(study.id, 'Original title', researcher.id)
        await retypeTitle(user, 'Should not persist')

        await user.click(screen.getByRole('button', { name: 'Back' }))

        await waitFor(() => expect(notifications.show).toHaveBeenCalled(), { timeout: 5000 })
        const errorCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => (arg as { title?: string })?.title === 'Failed to save draft',
        )
        expect(errorCall).toBeDefined()
        expect(memoryRouter.asPath).toBe('/start')

        const after = await db.selectFrom('study').select('title').where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(after.title).toBe('Original title')
    })

    it('skips the flush and navigates when the form is pristine', async () => {
        const user = userEvent.setup()
        const { org, researcher, study } = await setupChangeRequestedStudy('PENDING-REVIEW')
        ;(notifications.show as Mock).mockClear()

        renderFooterForStudy(study.id, 'Original title', researcher.id)

        await user.click(screen.getByRole('button', { name: 'Back' }))

        await waitFor(
            () => expect(memoryRouter.asPath).toBe(Routes.studySubmitted({ orgSlug: org.slug, studyId: study.id })),
            { timeout: 5000 },
        )
        expect(notifications.show).not.toHaveBeenCalled()

        const after = await db.selectFrom('study').select('title').where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(after.title).toBe('Original title')
    })
})
