import { TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { memoryRouter } from 'next-router-mock'
import {
    BLANK_UUID,
    createTestProposalDraft,
    db,
    describe,
    expect,
    it,
    renderWithProviders,
    screen,
    setTestStudyStatus,
    userEvent,
    waitFor,
    within,
    type Mock,
} from '@/tests/unit.helpers'
import { ProposalProvider, useProposal, type ProposalDraftData } from '@/contexts/proposal'
import { Routes } from '@/lib/routes'
import { ProposalFooter } from './footer'
import { type ProposalFormValues } from './schema'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

function lexicalText(text: string): string {
    return JSON.stringify({
        root: {
            type: 'root',
            children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
        },
    })
}

const fullyValidExceptTitle: ProposalFormValues = {
    title: '',
    datasets: ['dataset-1'],
    researchQuestions: lexicalText('What is the primary research question?'),
    projectSummary: lexicalText('This study examines outcomes.'),
    impact: lexicalText('Findings will inform practice.'),
    additionalNotes: '',
    piName: 'Jane Smith',
    piUserId: BLANK_UUID,
}

const TitleInputProbe = () => {
    const { form } = useProposal()
    return <TextInput aria-label="Study Title Probe" {...form.getInputProps('title')} />
}

const renderFooter = (draftData: ProposalDraftData = fullyValidExceptTitle, studyTitle?: string | null) =>
    renderWithProviders(
        <ProposalProvider studyId={STUDY_ID} draftData={draftData}>
            <ProposalFooter
                researcherName="Researcher"
                researcherId="researcher-1"
                studyTitle={studyTitle}
                orgName="Test Data Partner"
            />
        </ProposalProvider>,
    )

const submitButton = () => screen.getByRole('button', { name: 'Submit proposal' })

describe('ProposalFooter submit button (OTTER-691)', () => {
    it('is enabled with a blank title, which Step 1 now owns', () => {
        renderFooter()
        expect(submitButton()).toBeEnabled()
    })

    it('is enabled with a whitespace-only title', () => {
        renderFooter({ ...fullyValidExceptTitle, title: '   ' })
        expect(submitButton()).toBeEnabled()
    })

    it('stays enabled when the fields this page owns are empty', () => {
        renderFooter({ ...fullyValidExceptTitle, datasets: [] })
        expect(submitButton()).toBeEnabled()
    })

    it('does not open the confirmation modal while a required field is empty', async () => {
        const user = userEvent.setup()
        renderFooter({ ...fullyValidExceptTitle, datasets: [] })

        await user.click(submitButton())

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(submitButton()).toBeEnabled()
    })

    it('opens the confirmation modal once every field is valid', async () => {
        const user = userEvent.setup()
        renderFooter()

        await user.click(submitButton())

        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Submit your proposal?')).toBeInTheDocument()
        expect(
            within(dialog).getByText(
                'Your proposal will be sent to Test Data Partner for review. You will not be able to make changes once submitted.',
            ),
        ).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('keeps the entered values when the modal is cancelled', async () => {
        const user = userEvent.setup()
        renderFooter()

        await user.click(submitButton())
        await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await user.click(submitButton())
        expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    it('renders no reference to the old copy', () => {
        renderFooter()
        expect(screen.queryByRole('button', { name: /Submit initial request/i })).not.toBeInTheDocument()
    })

    // STUDY_ID has no row, so this submission fails — the only path that hands the form back
    // rather than navigating.
    it('closes the modal when the submission fails, leaving the user on the form', async () => {
        const user = userEvent.setup()
        renderFooter()

        await user.click(submitButton())
        const dialog = await screen.findByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: 'Submit proposal' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(submitButton()).toBeEnabled()
    })
})

describe('ProposalFooter reviewer preview title (OTTER-690)', () => {
    it('renders the persisted title rather than the form value', async () => {
        const user = userEvent.setup()
        renderFooter({ ...fullyValidExceptTitle, title: 'stale form copy' }, 'Persisted Step 1 title')

        await user.click(screen.getByRole('button', { name: 'View as reviewer' }))

        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Persisted Step 1 title')).toBeInTheDocument()
        expect(within(dialog).queryByText('stale form copy')).not.toBeInTheDocument()
    })
})

// Yjs autosave is inactive in single-user mode, so Previous must flush the form to the study row
// before leaving or Step 2 progress is lost (OTTER-572/573).
describe('ProposalFooter save-on-navigate (OTTER-573)', () => {
    // piUserId must reference a real user row or the flush trips the foreign key.
    const renderFooterForStudy = (studyId: string, piUserId: string) =>
        renderWithProviders(
            <ProposalProvider studyId={studyId} draftData={{ ...fullyValidExceptTitle, piUserId }}>
                <TitleInputProbe />
                <ProposalFooter researcherName="Researcher" researcherId="researcher-1" orgName="Test Data Partner" />
            </ProposalProvider>,
        )

    it('flushes edited fields to the study row and leaves the Step 1 title alone', async () => {
        const user = userEvent.setup()
        const { lab, studyId, user: researcher } = await createTestProposalDraft({ enclaveSlug: 'footer-nav-save' })
        memoryRouter.setCurrentUrl('/start')

        renderFooterForStudy(studyId, researcher.id)
        await user.type(screen.getByLabelText('Study Title Probe'), 'Should not persist')

        await user.click(screen.getByRole('button', { name: 'Previous step' }))

        await waitFor(() => expect(memoryRouter.asPath).toBe(Routes.studyEdit({ orgSlug: lab.slug, studyId })), {
            timeout: 5000,
        })

        const study = await db
            .selectFrom('study')
            .select(['title', 'piName', 'datasets'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow()
        expect(study.title).toBe('Test draft')
        expect(study.piName).toBe('Jane Smith')
        expect(study.datasets).toEqual(['dataset-1'])
    })

    it('reports the error and stays on Step 2 when the flush fails', async () => {
        const user = userEvent.setup()
        const { studyId, user: researcher } = await createTestProposalDraft({ enclaveSlug: 'footer-nav-fail' })
        await setTestStudyStatus(studyId, 'PENDING-REVIEW')
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()

        renderFooterForStudy(studyId, researcher.id)
        await user.type(screen.getByLabelText('Study Title Probe'), 'Edited so the form is dirty')

        await user.click(screen.getByRole('button', { name: 'Previous step' }))

        await waitFor(() => expect(notifications.show).toHaveBeenCalled(), { timeout: 5000 })
        const errorCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => (arg as { title?: string })?.title === 'Failed to save draft',
        )
        expect(errorCall).toBeDefined()
        expect(memoryRouter.asPath).toBe('/start')

        const study = await db.selectFrom('study').select('title').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(study.title).toBe('Test draft')
    })

    // The server only serves PI profiles the persisted study row names, so opening the modal on
    // unsaved state would show "Profile not available" (OTTER-724).
    it('flushes the draft to the study row before opening the reviewer preview', async () => {
        const user = userEvent.setup()
        const { studyId, user: researcher } = await createTestProposalDraft({ enclaveSlug: 'footer-preview-save' })

        renderFooterForStudy(studyId, researcher.id)
        await user.type(screen.getByLabelText('Study Title Probe'), 'Should not persist')

        await user.click(screen.getByRole('button', { name: 'View as reviewer' }))

        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument(), { timeout: 5000 })

        const study = await db
            .selectFrom('study')
            .select(['title', 'piUserId'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow()
        expect(study.title).toBe('Test draft')
        expect(study.piUserId).toBe(researcher.id)
    })

    it('skips the flush and navigates when the form is pristine', async () => {
        const user = userEvent.setup()
        const { lab, studyId, user: researcher } = await createTestProposalDraft({ enclaveSlug: 'footer-nav-clean' })
        await setTestStudyStatus(studyId, 'PENDING-REVIEW')
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()

        renderFooterForStudy(studyId, researcher.id)

        await user.click(screen.getByRole('button', { name: 'Previous step' }))

        await waitFor(() => expect(memoryRouter.asPath).toBe(Routes.studyEdit({ orgSlug: lab.slug, studyId })), {
            timeout: 5000,
        })
        expect(notifications.show).not.toHaveBeenCalled()

        const study = await db.selectFrom('study').select('title').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(study.title).toBe('Test draft')
    })
})
