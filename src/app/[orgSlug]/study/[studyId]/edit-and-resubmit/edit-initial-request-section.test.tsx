// `vi` direct from vitest, not via unit.helpers: the mocks API has to be the module's own binding
// for vi.mock / vi.hoisted to hoist, and a re-export fails to resolve it.
import { vi } from 'vitest'
import { BLANK_UUID, describe, expect, fireEvent, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { EditResubmitProvider } from '@/contexts/edit-resubmit'
import { type CollabFieldKey, type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { STUDY_TITLE_OVER_LIMIT_ERROR } from '@/app/[orgSlug]/study/request/form-schemas'
import { type SaveStatusValue } from '@/components/save-status'
import { EditInitialRequestSection } from './edit-initial-request-section'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

/**
 * Drives the save status this page derives, which jsdom cannot produce on its own.
 *
 * Without a websocket the Yjs provider is null AND the fields map is null, so `pushField` returns
 * before it can mark a key edited (`use-yjs-form-map.ts`). Every field's status is therefore
 * pinned to idle, an idle indicator renders nothing, and a test that only rendered the page would
 * keep passing with all three indicators deleted. The seam is the hook rather than any component,
 * so every child below still renders for real; the hook's own rule is covered by
 * `src/hooks/use-collab-fields-save-status.test.ts`.
 *
 * The stub honors the `error` argument for the same reason it keys on `key`: both are what the
 * call sites have to pass correctly, and a stub that ignored them could not tell a correct call
 * site from a cross-wired one.
 */
const collabSaveStatus = vi.hoisted(() => ({ byKey: {} as Partial<Record<CollabFieldKey, SaveStatusValue>> }))

vi.mock('@/hooks/use-collab-fields-save-status', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/hooks/use-collab-fields-save-status')>()),
    useCollabFieldsSaveStatus: () => (key: CollabFieldKey, error: unknown) =>
        error ? 'idle' : (collabSaveStatus.byKey[key] ?? 'idle'),
}))

const draftData: Partial<ProposalFormValues> = {
    title: 'A study title',
    datasets: ['dataset-1'],
    researchQuestions: '',
    projectSummary: '',
    impact: '',
    additionalNotes: '',
    piName: 'Jane Smith',
    piUserId: BLANK_UUID,
}

const renderSection = (byKey: Partial<Record<CollabFieldKey, SaveStatusValue>> = {}) => {
    collabSaveStatus.byKey = byKey

    return renderWithProviders(
        <EditResubmitProvider studyId={STUDY_ID} draftData={draftData}>
            <EditInitialRequestSection
                orgName="Rice University"
                members={[{ value: BLANK_UUID, label: 'Jane Smith' }]}
                researcherName="Ada Lovelace"
            />
        </EditResubmitProvider>,
    )
}

// OTTER-748: these three share the proposal-fields Yjs document, so unlike the rich-text editors
// on this page they cannot report a save from inside the control. The page has to render one
// indicator each, keyed to the right field. Asserting one key at a time makes the count itself the
// assertion: it fails if an indicator is missing and it fails if a call site names the wrong key.
describe('EditInitialRequestSection autosave indicators (OTTER-748)', () => {
    it.each([['title'], ['datasets'], ['piName']] as const)(
        'renders the saved indicator for %s, and only for that field',
        (key) => {
            renderSection({ [key]: 'saved' })

            const indicators = screen.getAllByTestId('autosave-status')
            expect(indicators).toHaveLength(1)
            expect(indicators[0]).toHaveTextContent('All changes saved')
        },
    )

    it('reports an in-flight save as well', () => {
        renderSection({ title: 'saving' })

        expect(screen.getByTestId('autosave-status')).toHaveTextContent('Saving…')
    })

    it('shows no indicator until a field reports a save', () => {
        renderSection()

        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    // OTTER-674: the error takes the slot the indicator would occupy. Typed through the real input
    // so the assertion covers the call site handing its own field error to the hook, not a value
    // the test invented.
    it('drops the title indicator once the field carries a validation error', () => {
        renderSection({ title: 'saved' })
        expect(screen.getByTestId('autosave-status')).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Study Title'), { target: { value: 'x'.repeat(61) } })

        expect(screen.getByText(STUDY_TITLE_OVER_LIMIT_ERROR)).toBeInTheDocument()
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })
})

describe('EditInitialRequestSection autosave announcements (OTTER-675)', () => {
    // One provider behind all three fields, so three live regions would read "All changes saved"
    // three times for one save. The editors below own separate providers and keep their own
    // regions, which is why this counts the announcer's testid rather than every region on screen.
    it('announces a save once for the whole section', () => {
        renderSection({ title: 'saved', datasets: 'saved', piName: 'saved' })

        const announcers = screen.getAllByTestId('autosave-announcer')
        expect(announcers).toHaveLength(1)
        expect(announcers[0]).toHaveTextContent('All changes saved')
    })

    // A live region is only announced when content it already owns changes, so it has to be
    // mounted and empty before the first save rather than arriving with its text.
    it('starts the announcement region empty', () => {
        renderSection()

        expect(screen.getByTestId('autosave-announcer')).toBeEmptyDOMElement()
    })
})
