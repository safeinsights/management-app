import { useEffect } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import {
    act,
    beforeEach,
    BLANK_UUID,
    describe,
    expect,
    fireEvent,
    it,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { EditResubmitProvider, useEditResubmit } from '@/contexts/edit-resubmit'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { STUDY_TITLE_OVER_LIMIT_ERROR } from '@/app/[orgSlug]/study/request/form-schemas'
import { fieldTestId } from '@/components/form-field'
import { proposalFieldsDocName } from '@/lib/collaboration-documents'
import { EditInitialRequestSection } from './edit-initial-request-section'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

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

type CollabWriter = ReturnType<typeof useEditResubmit>['yjsForm']

const collabWriter: { current: CollabWriter | null } = { current: null }

/**
 * Hands the test the page's own collaborative writer, the one its controls push through.
 *
 * Only `datasets` and the PI go through it. Both are Mantine Comboboxes, whose options never
 * render in happy-dom (it lacks the layout APIs Mantine measures with, as
 * participation-agreements.test.tsx also records) and whose selected-value pills carry
 * `aria-hidden` remove buttons, so there is no gesture available for either one. The title is a
 * plain TextInput and is typed into for real.
 */
const CollabWriterProbe = () => {
    const { yjsForm } = useEditResubmit()

    useEffect(() => {
        collabWriter.current = yjsForm
    }, [yjsForm])

    return null
}

const renderSection = async () => {
    renderWithProviders(
        <EditResubmitProvider studyId={STUDY_ID} draftData={draftData}>
            <CollabWriterProbe />
            <EditInitialRequestSection
                orgName="Rice University"
                members={[PI, OTHER_PI]}
                researcherName="Ada Lovelace"
            />
        </EditResubmitProvider>,
    )

    const provider = fieldsProvider()

    // The document's first sync is what hands the page its Y.Map, so an edit can be pushed at all,
    // and what arms the provider's save tracking. Waiting on the hook's own `isSynced` covers the
    // seeding that follows, which is asynchronous.
    act(() => {
        provider.isSynced = true
        provider.__emit('synced')
    })
    await waitFor(() => expect(collabWriter.current?.isSynced).toBe(true))

    return provider
}

// A save cycle as the provider reports one: unsynced changes appear, then settle. One provider
// stands behind all three fields, so this is the whole section saving.
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

const typeTitle = (value: string) => fireEvent.change(screen.getByLabelText('Study Title'), { target: { value } })

const editField: Record<'title' | 'datasets' | 'piName', () => void> = {
    title: () => typeTitle('A revised study title'),
    datasets: () => act(() => collabWriter.current!.pushField('datasets', ['dataset-1', 'dataset-2'])),
    piName: () => act(() => collabWriter.current!.pushPI(OTHER_PI.value, OTHER_PI.label)),
}

beforeEach(() => {
    providerInstances.length = 0
    collabWriter.current = null
})

// OTTER-748: these three share the proposal-fields Yjs document, so unlike the rich-text editors
// on this page they cannot report a save from inside the control. The page has to render one
// indicator each, keyed to the right field.
//
// Each case edits one field and asserts both halves: exactly one indicator exists on the page, and
// it sits under the field that was edited. The count alone is not enough. It catches a missing
// indicator and a call site pointing at another field's status, but two call sites with their keys
// exchanged still render one indicator per case, so the placement assertion is what separates
// correct wiring from a swap. The field key doubles as the `inputId` of its control.
describe('EditInitialRequestSection autosave indicators (OTTER-748)', () => {
    it.each([['title'], ['datasets'], ['piName']] as const)(
        'renders the saved indicator under %s, and only there',
        async (key) => {
            const provider = await renderSection()

            editField[key]()
            reportSaveCycle(provider)

            const indicators = screen.getAllByTestId('autosave-status')
            expect(indicators).toHaveLength(1)
            expect(indicators[0]).toHaveTextContent('All changes saved')
            expect(screen.getByTestId(fieldTestId(key))).toContainElement(indicators[0])
        },
    )

    it('reports an in-flight save as well', async () => {
        const provider = await renderSection()

        editField.title()
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

    // OTTER-674: the error takes the slot the indicator would occupy. Typed through the real input
    // so the assertion covers the call site handing its own field error to the hook, not a value
    // the test invented.
    it('drops the title indicator once the field carries a validation error', async () => {
        const provider = await renderSection()

        editField.title()
        reportSaveCycle(provider)
        expect(screen.getByTestId('autosave-status')).toBeInTheDocument()

        typeTitle('x'.repeat(61))

        expect(screen.getByText(STUDY_TITLE_OVER_LIMIT_ERROR)).toBeInTheDocument()
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    // This page suppresses the indicator by gating the status rather than by hiding a mounted
    // indicator with `isVisible`, and the two are not interchangeable here: one announcer speaks
    // for all three fields, so a status of 'saved' behind an error would have it read "All changes
    // saved" while the error is on screen. Nothing is discarded either way, which is what this
    // asserts: the label and the announcement both come back once the field is valid again.
    it('takes the title indicator and the announcement back once the error clears', async () => {
        const provider = await renderSection()

        editField.title()
        reportSaveCycle(provider)
        typeTitle('x'.repeat(61))
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
        expect(screen.getByTestId('autosave-announcer')).toBeEmptyDOMElement()

        typeTitle('A title back inside the limit')

        expect(screen.queryByText(STUDY_TITLE_OVER_LIMIT_ERROR)).not.toBeInTheDocument()
        expect(screen.getByTestId('autosave-status')).toHaveTextContent('All changes saved')
        expect(screen.getByTestId('autosave-announcer')).toHaveTextContent('All changes saved')
    })
})

describe('EditInitialRequestSection autosave announcements (OTTER-675)', () => {
    // One provider behind all three fields, so three live regions would read "All changes saved"
    // three times for one save. The editors below own separate providers and keep their own
    // regions, which is why this counts the announcer's testid rather than every region on screen.
    it('announces a save once for the whole section', async () => {
        const provider = await renderSection()

        editField.title()
        editField.datasets()
        editField.piName()
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
