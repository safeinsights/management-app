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

// Every required field populated EXCEPT the title (left blank, as drafts now
// persist a NULL title instead of a placeholder; reproduces OTTER-557).
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

const renderFooter = (draftData: ProposalDraftData = fullyValidExceptTitle) =>
    renderWithProviders(
        <ProposalProvider studyId={STUDY_ID} draftData={draftData}>
            <ProposalFooter researcherName="Researcher" researcherId="researcher-1" />
        </ProposalProvider>,
    )

describe('ProposalFooter submit gating (OTTER-557)', () => {
    it('keeps Submit disabled when the title is empty', () => {
        renderFooter()
        expect(screen.getByRole('button', { name: 'Submit initial request' })).toBeDisabled()
    })

    it('keeps Submit disabled when the title is whitespace only', () => {
        renderFooter({ ...fullyValidExceptTitle, title: '   ' })
        expect(screen.getByRole('button', { name: 'Submit initial request' })).toBeDisabled()
    })

    it('enables Submit when the researcher provides a real title', () => {
        renderFooter({ ...fullyValidExceptTitle, title: 'My Real Study Title' })
        expect(screen.getByRole('button', { name: 'Submit initial request' })).toBeEnabled()
    })

    it('enables Submit after the researcher types a real title in the form input', async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <ProposalProvider studyId={STUDY_ID} draftData={fullyValidExceptTitle}>
                <TitleInputProbe />
                <ProposalFooter researcherName="Researcher" researcherId="researcher-1" />
            </ProposalProvider>,
        )

        const submit = screen.getByRole('button', { name: 'Submit initial request' })
        expect(submit).toBeDisabled()

        await user.clear(screen.getByLabelText('Study Title Probe'))
        await user.type(screen.getByLabelText('Study Title Probe'), 'My Real Study Title')

        expect(submit).toBeEnabled()
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
                <ProposalFooter researcherName="Researcher" researcherId="researcher-1" />
            </ProposalProvider>,
        )

    it('flushes edited fields to the study row, then navigates to Step 1', async () => {
        const user = userEvent.setup()
        const { lab, studyId, user: researcher } = await createTestProposalDraft({ enclaveSlug: 'footer-nav-save' })
        memoryRouter.setCurrentUrl('/start')

        renderFooterForStudy(studyId, researcher.id)
        await user.type(screen.getByLabelText('Study Title Probe'), 'Saved on Previous')

        await user.click(screen.getByRole('button', { name: 'Previous' }))

        await waitFor(() => expect(memoryRouter.asPath).toBe(Routes.studyEdit({ orgSlug: lab.slug, studyId })), {
            timeout: 5000,
        })

        const study = await db
            .selectFrom('study')
            .select(['title', 'piName', 'datasets'])
            .where('id', '=', studyId)
            .executeTakeFirstOrThrow()
        expect(study.title).toBe('Saved on Previous')
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
        await user.type(screen.getByLabelText('Study Title Probe'), 'Should not persist')

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
