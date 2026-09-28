import { useEffect } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import {
    act,
    beforeEach,
    BLANK_UUID,
    describe,
    expect,
    it,
    renderWithProviders,
    screen,
    waitFor,
    within,
} from '@/tests/unit.helpers'
import { ProposalProvider, useProposal } from '@/contexts/proposal'
import { fieldTestId } from '@/components/form-field'
import { proposalFieldsDocName } from '@/lib/collaboration-documents'
import { DRAFT_REQUIRED_ERRORS, type ProposalFormValues } from './schema'
import { ProposalFieldsSection } from './proposal-fields-section'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'
const ORG_NAME = 'Rice University'

const PI = { value: BLANK_UUID, label: 'Jane Smith' }
const OTHER_PI = { value: '22222222-2222-4222-8222-222222222222', label: 'Alan Turing' }

const draftData: Partial<ProposalFormValues> = {
    title: 'A study title',
    datasets: ['dataset-1'],
    researchQuestions: '',
    projectSummary: '',
    impact: '',
    additionalNotes: '',
    piName: PI.label,
    piUserId: PI.value,
}

/**
 * The page's own Hocuspocus provider for the shared proposal-fields document.
 *
 * `__instances` and `__emit` come from the global `@hocuspocus/provider` fake in
 * tests/vitest.setup.ts: the third-party provider, not any of our code. Nothing else can move this
 * page's save status off idle, because the status is derived from the provider's `synced` and
 * `unsyncedChanges` events and happy-dom has no websocket to produce them.
 */
type FakeProvider = {
    configuration: { name?: string }
    isSynced: boolean
    unsyncedChanges: number
    __emit: (event: string, ...args: unknown[]) => void
}

const providerInstances = (HocuspocusProvider as unknown as { __instances: FakeProvider[] }).__instances

// Each rich-text editor below the fields owns a provider too, so pick by document name rather
// than by construction order.
const fieldsProvider = () => {
    const docName = proposalFieldsDocName(STUDY_ID)
    const provider = providerInstances.find((instance) => instance.configuration.name === docName)
    if (!provider) throw new Error(`no HocuspocusProvider was created for ${docName}`)
    return provider
}

type Page = Pick<ReturnType<typeof useProposal>, 'form' | 'yjsForm'>

const page: { current: Page | null } = { current: null }

type SectionProps = Parameters<typeof ProposalFieldsSection>[0]
type PageProps = Partial<Omit<SectionProps, 'studyId' | 'form' | 'yjsForm' | 'websocketProvider'>>

/**
 * Renders the section the way a page does, handing it the provider's form and collaboration
 * handles, and hands the test the same form and collaborative writer its controls push through.
 *
 * Both remaining fields are Mantine Comboboxes, whose options never render in happy-dom (it lacks
 * the layout APIs Mantine measures with, as participation-agreements.test.tsx also records) and
 * whose selected-value pills carry `aria-hidden` remove buttons, so there is no gesture available
 * for either one and edits go through the writer.
 */
const SectionOnPage = (props: PageProps) => {
    const { studyId, form, yjsForm, websocketProvider } = useProposal()

    useEffect(() => {
        page.current = { form, yjsForm }
    }, [form, yjsForm])

    return (
        <ProposalFieldsSection
            studyId={studyId}
            form={form}
            yjsForm={yjsForm}
            websocketProvider={websocketProvider}
            heading="Edit proposal"
            orgName={ORG_NAME}
            members={[PI, OTHER_PI]}
            researcherName="Ada Lovelace"
            {...props}
        />
    )
}

const renderSection = async (props: PageProps = {}) => {
    renderWithProviders(
        <ProposalProvider studyId={STUDY_ID} draftData={draftData}>
            <SectionOnPage {...props} />
        </ProposalProvider>,
    )

    const provider = fieldsProvider()

    // The document's first sync is what hands the page its Y.Map, so an edit can be pushed at all,
    // and what arms the provider's save tracking. Waiting on the hook's own `isSynced` covers the
    // seeding that follows, which is asynchronous.
    act(() => {
        provider.isSynced = true
        provider.__emit('synced')
    })
    await waitFor(() => expect(page.current?.yjsForm.isSynced).toBe(true))

    return provider
}

// A save cycle as the provider reports one: unsynced changes appear, then settle. One provider
// stands behind both fields, so this is the whole section saving.
const reportSaveCycle = (provider: FakeProvider) => {
    act(() => {
        provider.unsyncedChanges = 1
        provider.__emit('unsyncedChanges')
    })
    act(() => {
        provider.unsyncedChanges = 0
        provider.__emit('unsyncedChanges')
    })
}

const editPI = () => act(() => page.current!.yjsForm.pushPI(OTHER_PI.value, OTHER_PI.label))

// Empties the field and runs the blur-time rule, the way leaving the emptied control would.
const emptyPIAndBlur = () =>
    act(() => {
        page.current!.form.setFieldValue('piName', '')
        page.current!.form.validateField('piName')
    })

beforeEach(() => {
    providerInstances.length = 0
    page.current = null
})

// One card serves Step 2 and the Edit proposal page, so the two cannot drift apart (OTTER-691,
// OTTER-762).
describe('ProposalFieldsSection section header and body copy (OTTER-762)', () => {
    it('reuses the shared section header with the Step 2 eyebrow and the heading it is given', async () => {
        await renderSection({ heading: 'Edit proposal' })

        const header = screen.getByTestId('proposal-section-header')
        expect(within(header).getByText('STEP 2')).toBeInTheDocument()
        expect(within(header).getByRole('heading', { level: 2, name: 'Edit proposal' })).toBeInTheDocument()
        expect(screen.getByTestId('proposal-header-divider')).toBeInTheDocument()
    })

    it('renders the new body copy with the Data Partner interpolated', async () => {
        await renderSection()

        expect(
            screen.getByText(
                `Submit your proposal to ${ORG_NAME} for review. They will assess its feasibility, scientific value, and potential impact on instructional practice. After review, they may approve it, request revisions, or decline it.`,
            ),
        ).toBeInTheDocument()
        expect(screen.queryByText(/Use this form to submit your proposal/)).not.toBeInTheDocument()
    })

    it('does not render the study title anywhere in the section', async () => {
        await renderSection()

        expect(screen.queryByLabelText(/study title/i)).not.toBeInTheDocument()
        expect(screen.queryByText('Study title')).not.toBeInTheDocument()
        expect(screen.queryByText('A study title')).not.toBeInTheDocument()
    })
})

// Step 1 owns the datasets now, so neither Step 2 nor Edit proposal can change them (OTTER-803).
describe('ProposalFieldsSection datasets removal (OTTER-803)', () => {
    it('renders no datasets field', async () => {
        await renderSection()

        expect(screen.queryByText('Dataset(s) of interest')).not.toBeInTheDocument()
        expect(document.getElementById('datasets')).toBeNull()
        expect(screen.queryByText(/Select the datasets available through/)).not.toBeInTheDocument()
    })
})

describe('ProposalFieldsSection researcher field (OTTER-762)', () => {
    it('shows the researcher name as static text, not an input', async () => {
        await renderSection()

        expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
        expect(screen.queryByDisplayValue('Ada Lovelace')).not.toBeInTheDocument()
    })

    it('shows the guidance and the Update profile link to the draft creator', async () => {
        await renderSection({ isDraftCreator: true })

        expect(
            screen.getByText(`Update your profile to share your research experience with ${ORG_NAME}.`),
        ).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Update profile/i })).toBeInTheDocument()
    })

    // Scoped to the draft creator, not any lab member: a co-author can edit this page too, and the
    // link edits the viewer's own profile.
    it('hides both from anyone who is not the draft creator', async () => {
        await renderSection({ isDraftCreator: false })

        expect(
            screen.queryByText(`Update your profile to share your research experience with ${ORG_NAME}.`),
        ).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /Update profile/i })).not.toBeInTheDocument()
        expect(screen.queryByText(/Ensure that your profile is complete/)).not.toBeInTheDocument()
    })

    it('no longer offers the old View profile link', async () => {
        await renderSection({ isDraftCreator: true })

        expect(screen.queryByRole('link', { name: /^View profile/i })).not.toBeInTheDocument()
    })
})

describe('ProposalFieldsSection field hints (OTTER-769)', () => {
    it('describes the PI field with the card wording', async () => {
        await renderSection()

        expect(screen.getByText('Select the Principal Investigator for this study.')).toBeInTheDocument()
        expect(screen.queryByText(/from your lab/)).not.toBeInTheDocument()
    })
})

// OTTER-748: the PI writes into the proposal-fields Yjs document, so unlike the rich-text editors on
// this page it cannot report a save from inside the control. The page renders its indicator, keyed
// to that field. The field key doubles as the `inputId` of its control.
describe('ProposalFieldsSection autosave indicators (OTTER-748)', () => {
    it('renders the saved indicator under the PI field, and only there', async () => {
        const provider = await renderSection()

        editPI()
        reportSaveCycle(provider)

        const indicators = screen.getAllByTestId('autosave-status')
        expect(indicators).toHaveLength(1)
        expect(indicators[0]).toHaveTextContent('All changes saved')
        expect(screen.getByTestId(fieldTestId('piName'))).toContainElement(indicators[0])
    })

    it('reports an in-flight save as well', async () => {
        const provider = await renderSection()

        editPI()
        act(() => {
            provider.unsyncedChanges = 1
            provider.__emit('unsyncedChanges')
        })

        expect(screen.getByTestId('autosave-status')).toHaveTextContent('Saving…')
    })

    // OTTER-594 QA: the provider's status is form-wide, so a section nobody has typed in must stay
    // silent even through a completed save cycle.
    it('shows no indicator until a field is edited', async () => {
        const provider = await renderSection()

        reportSaveCycle(provider)

        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    // OTTER-674: the error takes the slot the indicator would occupy. Raised through the field's
    // own blur rule so the assertion covers the call site handing its own field error to the hook,
    // not a value the test invented.
    it('drops the PI indicator once the field carries a validation error', async () => {
        const provider = await renderSection()

        editPI()
        reportSaveCycle(provider)
        expect(screen.getByTestId('autosave-status')).toBeInTheDocument()

        emptyPIAndBlur()

        expect(screen.getByText(DRAFT_REQUIRED_ERRORS.piName)).toBeInTheDocument()
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    // This page suppresses the indicator by gating the status rather than by hiding a mounted
    // indicator with `isVisible`, and the two are not interchangeable here: one announcer speaks
    // for the fields doc, so a status of 'saved' behind an error would have it read "All changes
    // saved" while the error is on screen. Nothing is discarded either way, which is what this
    // asserts: the label and the announcement both come back once the field is valid again.
    it('takes the PI indicator and the announcement back once the error clears', async () => {
        const provider = await renderSection()

        editPI()
        reportSaveCycle(provider)
        emptyPIAndBlur()
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
        expect(screen.getByTestId('autosave-announcer')).toBeEmptyDOMElement()

        // Editing clears the error until the next blur or Submit (OTTER-691).
        act(() => page.current!.form.setFieldValue('piName', OTHER_PI.label))

        expect(screen.queryByText(DRAFT_REQUIRED_ERRORS.piName)).not.toBeInTheDocument()
        expect(screen.getByTestId('autosave-status')).toHaveTextContent('All changes saved')
        expect(screen.getByTestId('autosave-announcer')).toHaveTextContent('All changes saved')
    })
})

describe('ProposalFieldsSection autosave announcements (OTTER-675)', () => {
    // The editors below own separate providers and keep their own regions, which is why this counts
    // the announcer's testid rather than every region on screen.
    it('announces a save once for the whole section', async () => {
        const provider = await renderSection()

        editPI()
        reportSaveCycle(provider)

        const announcers = screen.getAllByTestId('autosave-announcer')
        expect(announcers).toHaveLength(1)
        expect(announcers[0]).toHaveTextContent('All changes saved')
    })

    // A live region is only announced when content it already owns changes, so it has to be
    // mounted and empty before the first save rather than arriving with its text.
    it('starts the announcement region empty', async () => {
        await renderSection()

        expect(screen.getByTestId('autosave-announcer')).toBeEmptyDOMElement()
    })
})
