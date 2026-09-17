import { useEffect } from 'react'
import { TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { memoryRouter } from 'next-router-mock'
import {
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
    within,
    type Mock,
} from '@/tests/unit.helpers'
import { EditResubmitProvider, useEditResubmit, type EditResubmitDraftData } from '@/contexts/edit-resubmit'
import { SUBMIT_FAILURE_TITLE, SUBMIT_FAILURE_UNSAVED_MESSAGE } from '@/contexts/proposal/hooks/submission-toasts'
import { lexicalJson } from '@/lib/lexical'
import { Routes } from '@/lib/routes'
import { ResubmissionNoteSection } from '@/components/study/resubmission-note-section'
import { PROPOSAL_REQUIRED_NOTE_ERROR } from './schema'
import { EditResubmitFooter } from './footer'

const ORG_NAME = 'Rice University'

function NoteSection() {
    const { noteForm } = useEditResubmit()
    return <ResubmissionNoteSection noteForm={noteForm} orgName={ORG_NAME} />
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

const VALID_NOTE = wordsString(60)

// Primes the note form in an effect: updating form state during render triggers React's
// cross-component setState warning.
const NoteProbe = ({ note }: { note: string }) => {
    const { noteForm } = useEditResubmit()
    useEffect(() => {
        if (noteForm.values.resubmissionNote !== note) noteForm.setFieldValue('resubmissionNote', note)
    })
    return null
}

const renderFooter = ({
    draft = VALID_PROPOSAL_DRAFT,
    note = VALID_NOTE,
    studyId = STUDY_ID,
}: { draft?: EditResubmitDraftData; note?: string; studyId?: string } = {}) =>
    renderWithProviders(
        <EditResubmitProvider studyId={studyId} draftData={draft}>
            <NoteProbe note={note} />
            <NoteSection />
            <EditResubmitFooter researcherName="Researcher" researcherId="researcher-1" orgName={ORG_NAME} />
        </EditResubmitProvider>,
    )

const resubmitButton = () => screen.getByRole('button', { name: 'Resubmit proposal' })

describe('EditResubmitFooter — Resubmit proposal button (OTTER-762)', () => {
    it('is enabled on first paint even when the resubmission note is empty', () => {
        renderFooter({ note: '' })
        expect(resubmitButton()).toBeEnabled()
    })

    it('stays enabled when a required proposal field is empty', () => {
        renderFooter({ draft: { ...VALID_PROPOSAL_DRAFT, datasets: [] } })
        expect(resubmitButton()).toBeEnabled()
    })

    // The title left this page: Step 1 owns it, so a blank seed must not block Resubmit.
    it('is enabled with a blank title', async () => {
        const user = userEvent.setup()
        renderFooter({ draft: { ...VALID_PROPOSAL_DRAFT, title: '' } })

        expect(resubmitButton()).toBeEnabled()
        await user.click(resubmitButton())
        expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    it('renders no reference to the old copy', () => {
        renderFooter()
        expect(screen.queryByRole('button', { name: /Resubmit initial request/i })).not.toBeInTheDocument()
    })

    it('does not open the confirmation modal while a required proposal field is empty', async () => {
        const user = userEvent.setup()
        renderFooter({ draft: { ...VALID_PROPOSAL_DRAFT, datasets: [] } })

        await user.click(resubmitButton())

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(resubmitButton()).toBeEnabled()
    })

    it('flags an empty resubmission note with the card wording instead of opening the modal', async () => {
        const user = userEvent.setup()
        renderFooter({ note: '' })

        await user.click(resubmitButton())

        expect(await screen.findByText(PROPOSAL_REQUIRED_NOTE_ERROR)).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(resubmitButton()).toBeEnabled()
    })

    it('treats a whitespace-only note as empty', async () => {
        const user = userEvent.setup()
        renderFooter({ note: '   ' })

        await user.click(resubmitButton())

        expect(await screen.findByText(PROPOSAL_REQUIRED_NOTE_ERROR)).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('moves focus to the flagged note when it is the only invalid field', async () => {
        const user = userEvent.setup()
        renderFooter({ note: '' })

        await user.click(resubmitButton())

        await screen.findByText(PROPOSAL_REQUIRED_NOTE_ERROR)
        expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Resubmission Note' }))
    })
})

describe('EditResubmitFooter — confirmation modal (OTTER-762)', () => {
    it('opens the modal with the resubmission title, body and buttons once every field is valid', async () => {
        const user = userEvent.setup()
        renderFooter()

        await user.click(resubmitButton())

        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Resubmit your proposal?')).toBeInTheDocument()
        expect(
            within(dialog).getByText(
                `Your proposal will be sent to ${ORG_NAME} for review. You will not be able to make changes once submitted.`,
            ),
        ).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Resubmit proposal' })).toBeInTheDocument()
        expect(within(dialog).queryByText(/initial request/i)).not.toBeInTheDocument()
    })

    it('dismisses the modal on Cancel and keeps the entered values', async () => {
        const user = userEvent.setup()
        renderFooter()

        await user.click(resubmitButton())
        await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await user.click(resubmitButton())
        expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    // STUDY_ID has no row, so this submission fails — the only path that hands the form back
    // rather than navigating.
    it('closes the modal and toasts the card copy when the submission fails, leaving the user on the form', async () => {
        const user = userEvent.setup()
        ;(notifications.show as Mock).mockClear()
        memoryRouter.setCurrentUrl('/start')
        renderFooter()

        await user.click(resubmitButton())
        const dialog = await screen.findByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: 'Resubmit proposal' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(resubmitButton()).toBeEnabled()
        expect(memoryRouter.asPath).toBe('/start')

        // The missing row also sinks the recovery flush of the note, so the toast must not promise
        // the work is saved; the saved-work variant is covered in use-resubmit-proposal.test.ts.
        const errorCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => (arg as { title?: string })?.title === SUBMIT_FAILURE_TITLE,
        )
        expect(errorCall?.[0]).toMatchObject({ color: 'red', message: SUBMIT_FAILURE_UNSAVED_MESSAGE })
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

    // The title is a seed this page no longer edits (OTTER-762); the probe only dirties the form.
    const TitleInputProbe = () => {
        const { form } = useEditResubmit()
        return <TextInput aria-label="Study Title Probe" {...form.getInputProps('title')} />
    }

    // piUserId must reference a real user row or the flush trips the foreign key.
    const renderFooterForStudy = (studyId: string, piUserId: string) =>
        renderWithProviders(
            <EditResubmitProvider studyId={studyId} draftData={{ ...VALID_PROPOSAL_DRAFT, piUserId }}>
                <TitleInputProbe />
                <EditResubmitFooter researcherName="Researcher" researcherId="researcher-1" orgName={ORG_NAME} />
            </EditResubmitProvider>,
        )

    const dirtyTheForm = async (user: ReturnType<typeof userEvent.setup>) => {
        await user.type(screen.getByLabelText('Study Title Probe'), ' edited')
    }

    it('flushes edited fields to the study row and leaves the title alone, then steps back to the read-only Step 1 record', async () => {
        const user = userEvent.setup()
        const { org, researcher, study } = await setupChangeRequestedStudy('CHANGE-REQUESTED')

        renderFooterForStudy(study.id, researcher.id)
        await dirtyTheForm(user)

        await user.click(screen.getByRole('button', { name: 'Previous step' }))

        await waitFor(
            () => expect(memoryRouter.asPath).toBe(Routes.studyEdit({ orgSlug: org.slug, studyId: study.id })),
            { timeout: 5000 },
        )

        const after = await db
            .selectFrom('study')
            .select(['title', 'status', 'piName', 'datasets'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.title).toBe('Original title')
        expect(after.status).toBe('CHANGE-REQUESTED')
        expect(after.piName).toBe('PI Name')
        expect(after.datasets).toEqual(['some-dataset'])
    })

    // The server only serves PI profiles the persisted study row names, so opening the modal on
    // unsaved state would show "Profile not available" (OTTER-724).
    it('flushes the draft to the study row before opening the reviewer preview', async () => {
        const user = userEvent.setup()
        const { researcher, study } = await setupChangeRequestedStudy('CHANGE-REQUESTED')

        renderFooterForStudy(study.id, researcher.id)
        await dirtyTheForm(user)

        await user.click(screen.getByRole('button', { name: 'View as reviewer' }))

        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument(), { timeout: 5000 })

        const after = await db
            .selectFrom('study')
            .select(['title', 'piUserId'])
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(after.title).toBe('Original title')
        expect(after.piUserId).toBe(researcher.id)
    })

    it('reports the error and stays on the page when the flush fails', async () => {
        const user = userEvent.setup()
        const { researcher, study } = await setupChangeRequestedStudy('PENDING-REVIEW')
        ;(notifications.show as Mock).mockClear()

        renderFooterForStudy(study.id, researcher.id)
        await dirtyTheForm(user)

        await user.click(screen.getByRole('button', { name: 'Previous step' }))

        await waitFor(() => expect(notifications.show).toHaveBeenCalled(), { timeout: 5000 })
        const errorCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => (arg as { title?: string })?.title === 'Failed to save draft',
        )
        expect(errorCall).toBeDefined()
        expect(memoryRouter.asPath).toBe('/start')

        const after = await db.selectFrom('study').select('piName').where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(after.piName).toBe('test')
    })

    it('skips the flush and navigates when the form is pristine', async () => {
        const user = userEvent.setup()
        const { org, researcher, study } = await setupChangeRequestedStudy('PENDING-REVIEW')
        ;(notifications.show as Mock).mockClear()

        renderFooterForStudy(study.id, researcher.id)

        await user.click(screen.getByRole('button', { name: 'Previous step' }))

        await waitFor(
            () => expect(memoryRouter.asPath).toBe(Routes.studyEdit({ orgSlug: org.slug, studyId: study.id })),
            { timeout: 5000 },
        )
        expect(notifications.show).not.toHaveBeenCalled()

        const after = await db.selectFrom('study').select('title').where('id', '=', study.id).executeTakeFirstOrThrow()
        expect(after.title).toBe('Original title')
    })
})

describe('EditResubmitFooter — reviewer preview title (OTTER-762)', () => {
    it('renders the persisted title rather than the form value', async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <EditResubmitProvider studyId={STUDY_ID} draftData={{ ...VALID_PROPOSAL_DRAFT, title: 'stale form copy' }}>
                <EditResubmitFooter
                    researcherName="Researcher"
                    researcherId="researcher-1"
                    orgName={ORG_NAME}
                    studyTitle="Persisted Step 1 title"
                />
            </EditResubmitProvider>,
        )

        await user.click(screen.getByRole('button', { name: 'View as reviewer' }))

        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Persisted Step 1 title')).toBeInTheDocument()
        expect(within(dialog).queryByText('stale form copy')).not.toBeInTheDocument()
    })
})
