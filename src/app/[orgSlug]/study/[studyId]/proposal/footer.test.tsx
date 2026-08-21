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

// Every field this page owns, populated. The title is blank on purpose: Step 1 owns it now
// (OTTER-690), so Step 2 must neither require it nor write it back.
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

// Test-only title input wired through useProposal so changes flow through the
// real Mantine form the footer reads.
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

// Replaces the OTTER-557 gating suite twice over. That suite asserted a blank title blocks Submit,
// which OTTER-690 ended when the title moved to Step 1. OTTER-691 then removed validity gating
// altogether: the button is always live, and clicking it is what raises the errors.
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
        // The failed click must not disable the control the user needs to retry with.
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
        // Re-opening proves nothing was reset: a cleared form would fail validation instead.
        await user.click(submitButton())
        expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    it('renders no reference to the old copy', () => {
        renderFooter()
        expect(screen.queryByRole('button', { name: /Submit initial request/i })).not.toBeInTheDocument()
    })
})

describe('ProposalFooter reviewer preview title (OTTER-690)', () => {
    // The preview must read the persisted study.title, not the form's seeded copy: on a DRAFT the
    // form copy is never edited, so reading it would render whatever was seeded at mount.
    it('renders the persisted title rather than the form value', async () => {
        const user = userEvent.setup()
        renderFooter({ ...fullyValidExceptTitle, title: 'stale form copy' }, 'Persisted Step 1 title')

        await user.click(screen.getByRole('button', { name: 'View as reviewer' }))

        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Persisted Step 1 title')).toBeInTheDocument()
        expect(within(dialog).queryByText('stale form copy')).not.toBeInTheDocument()
    })
})

// Yjs autosave is inactive in single-user mode (no collaboration websocket), so
// Previous must flush the form to the study row before leaving — otherwise Step 2
// progress is lost and the dashboard resumes the draft on Step 1 (OTTER-572/573).
describe('ProposalFooter save-on-navigate (OTTER-573)', () => {
    // piUserId must reference a real user row — the flush writes it to the study
    // table, and a placeholder UUID would trip the foreign key.
    const renderFooterForStudy = (studyId: string, piUserId: string) =>
        renderWithProviders(
            <ProposalProvider studyId={studyId} draftData={{ ...fullyValidExceptTitle, piUserId }}>
                <TitleInputProbe />
                <ProposalFooter researcherName="Researcher" researcherId="researcher-1" orgName="Test Data Partner" />
            </ProposalProvider>,
        )

    // OTTER-690: the flush carries every field this page owns, and deliberately not the title.
    // The probe below edits the form's title copy to prove that a stale Step 2 value cannot
    // overwrite the one Step 1 persisted.
    it('flushes edited fields to the study row and leaves the Step 1 title alone', async () => {
        const user = userEvent.setup()
        const { lab, studyId, user: researcher } = await createTestProposalDraft({ enclaveSlug: 'footer-nav-save' })
        memoryRouter.setCurrentUrl('/start')

        renderFooterForStudy(studyId, researcher.id)
        await user.type(screen.getByLabelText('Study Title Probe'), 'Should not persist')

        await user.click(screen.getByRole('button', { name: 'Previous' }))

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
        // A study that left DRAFT is no longer editable, so the flush is rejected.
        await setTestStudyStatus(studyId, 'PENDING-REVIEW')
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()

        renderFooterForStudy(studyId, researcher.id)
        await user.type(screen.getByLabelText('Study Title Probe'), 'Edited so the form is dirty')

        await user.click(screen.getByRole('button', { name: 'Previous' }))

        await waitFor(() => expect(notifications.show).toHaveBeenCalled(), { timeout: 5000 })
        const errorCall = (notifications.show as Mock).mock.calls.find(
            ([arg]) => (arg as { title?: string })?.title === 'Failed to save draft',
        )
        expect(errorCall).toBeDefined()
        expect(memoryRouter.asPath).toBe('/start')

        const study = await db.selectFrom('study').select('title').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(study.title).toBe('Test draft')
    })

    // The preview's PI popover asks the server for the profile, and the server only serves ids
    // the persisted study row names — opening the modal on unsaved form state would show
    // "Profile not available" for a freshly selected PI (OTTER-724).
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
        // Non-editable status would fail the flush — a pristine form must not
        // attempt it, so a viewer can still navigate back.
        await setTestStudyStatus(studyId, 'PENDING-REVIEW')
        memoryRouter.setCurrentUrl('/start')
        ;(notifications.show as Mock).mockClear()

        renderFooterForStudy(studyId, researcher.id)

        await user.click(screen.getByRole('button', { name: 'Previous' }))

        await waitFor(() => expect(memoryRouter.asPath).toBe(Routes.studyEdit({ orgSlug: lab.slug, studyId })), {
            timeout: 5000,
        })
        expect(notifications.show).not.toHaveBeenCalled()

        const study = await db.selectFrom('study').select('title').where('id', '=', studyId).executeTakeFirstOrThrow()
        expect(study.title).toBe('Test draft')
    })
})
