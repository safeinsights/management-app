import { memoryRouter } from 'next-router-mock'
import {
    beforeEach,
    createTestQueryClient,
    db,
    describe,
    expect,
    faker,
    insertTestCodeEnv,
    insertTestOrg,
    insertTestStudyJobData,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    vi,
    waitFor,
    within,
} from '@/tests/unit.helpers'
import { StudyRequestProvider, type DraftStudyData } from '@/contexts/study-request'
import { Routes } from '@/lib/routes'
import { StudyProposal } from './proposal'

// focusFirstInvalid scrolls before it focuses, and the test DOM has no layout to scroll.
Element.prototype.scrollIntoView = vi.fn()

const INTRO = 'Name your study and select a Data Partner so your proposal goes to the right organization for review.'
const TITLE_DESCRIPTION = 'Give your study a short, clear title to identify it on SafeInsights.'
const PARTNER_DESCRIPTION = 'Select a Data Partner to see the programming languages they support.'
const BLANK_TITLE_ERROR = 'Enter a study title before continuing.'
const OVER_LIMIT_ERROR = 'Study title exceeds the 60 character limit. Shorten it to continue.'
const PARTNER_ERROR = 'Select a Data Partner before continuing.'
const LANGUAGE_ERROR = 'Select a programming language before continuing.'

type Fixtures = Awaited<ReturnType<typeof setupFixtures>>

/**
 * A lab session plus two real enclave partners: one that supports a single language and one that
 * supports two. Both are real rows, so the Data Partner and programming-language fields run their
 * actual server actions against the test database rather than a mock of them.
 *
 * Enclaves are inserted before the session, matching createTestProposalDraft: insertTestOrg stamps
 * an Authorization header, and the lab's has to be the one left standing.
 */
const setupFixtures = async () => {
    const suffix = faker.string.alpha(8).toLowerCase()

    const singleLanguagePartner = await insertTestOrg({
        type: 'enclave',
        slug: `setup-single-${suffix}`,
        name: `Single Language Partner ${suffix}`,
    })
    await insertTestCodeEnv({ orgId: singleLanguagePartner.id, language: 'R' })

    const multiLanguagePartner = await insertTestOrg({
        type: 'enclave',
        slug: `setup-multi-${suffix}`,
        name: `Multi Language Partner ${suffix}`,
    })
    await insertTestCodeEnv({ orgId: multiLanguagePartner.id, language: 'R' })
    await insertTestCodeEnv({ orgId: multiLanguagePartner.id, language: 'PYTHON' })

    // A second single-language partner, so switching between partners can be tested without the
    // destination auto-selecting whatever the source already had.
    const pythonOnlyPartner = await insertTestOrg({
        type: 'enclave',
        slug: `setup-python-${suffix}`,
        name: `Python Only Partner ${suffix}`,
    })
    await insertTestCodeEnv({ orgId: pythonOnlyPartner.id, language: 'PYTHON' })

    // No code environments at all, standing in for a partner that had one when the draft was saved
    // and has since lost it. It is deliberately absent from the Data Partner list, which only
    // offers study-capable orgs, and is reachable only as a draft's already-persisted partner.
    const retiredPartner = await insertTestOrg({
        type: 'enclave',
        slug: `setup-retired-${suffix}`,
        name: `Retired Partner ${suffix}`,
    })

    const { org: lab, user } = await mockSessionWithTestData({ orgSlug: `setup-lab-${suffix}`, orgType: 'lab' })

    return { lab, user, singleLanguagePartner, multiLanguagePartner, pythonOnlyPartner, retiredPartner }
}

/**
 * A real DRAFT row for the revisit state, so a Save and continue click runs the actual update action
 * instead of failing against an id that was never persisted.
 *
 * The row is submitted by the lab, which is what `update Study` is scoped to. Its `orgSlug` names the
 * Data Partner for the locked display only: the update path does not send a partner.
 */
const insertRevisitableDraft = async (fixtures: Fixtures, overrides: Partial<DraftStudyData> = {}) => {
    const { study } = await insertTestStudyJobData({
        org: fixtures.lab,
        researcherId: fixtures.user.id,
        studyStatus: 'DRAFT',
        title: 'A previously saved title',
        language: 'R',
    })

    const draftData: DraftStudyData = {
        id: study.id,
        orgSlug: fixtures.singleLanguagePartner.slug,
        orgName: fixtures.singleLanguagePartner.name,
        language: 'R',
        status: 'DRAFT',
        title: 'A previously saved title',
        ...overrides,
    }

    return { study, draftData }
}

/**
 * The submitted state needs no persisted row: the page is read-only there, so nothing is written and
 * the CTA only navigates.
 */
const submittedDraft = (fixtures: Fixtures, overrides: Partial<DraftStudyData> = {}): DraftStudyData => ({
    id: faker.string.uuid(),
    orgSlug: fixtures.singleLanguagePartner.slug,
    orgName: fixtures.singleLanguagePartner.name,
    language: 'R',
    status: 'PENDING-REVIEW',
    title: 'A previously saved title',
    ...overrides,
})

const renderSetup = (
    fixtures: Fixtures,
    props: { studyId?: string; draftData?: DraftStudyData | null } = {},
    queryClient?: ReturnType<typeof createTestQueryClient>,
) =>
    renderWithProviders(
        <StudyRequestProvider submittingOrgSlug={fixtures.lab.slug}>
            <StudyProposal {...props} />
        </StudyRequestProvider>,
        { queryClient },
    )

const titleInput = () => screen.getByLabelText(/study title/i)
const continueButton = () => screen.getByRole('button', { name: 'Save & continue' })
// The revisit and submitted states carry their own CTA copy, exact per OTTER-764.
const saveAndContinueButton = () => screen.getByRole('button', { name: 'Save and continue' })
const nextStepButton = () => screen.getByRole('button', { name: 'Next step' })

const selectPartner = async (user: ReturnType<typeof userEvent.setup>, partnerName: string) => {
    // The Select stays disabled while its options load, so clicking before then lands on a
    // disabled input and silently does nothing.
    const select = screen.getByTestId('org-select')
    await waitFor(() => expect(select).toBeEnabled())

    await user.click(select)
    // By text, not by role: this environment renders Mantine's dropdown outside the accessibility
    // tree, so *ByRole('option') matches nothing even with the dropdown open.
    await user.click(await screen.findByText(partnerName))
    await waitFor(() => expect(select).toHaveValue(partnerName))
}

const typeTitle = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
    await user.click(titleInput())
    await user.paste(value)
}

describe('Set Up page section header', () => {
    it('reuses the proposal step header with the Step 1 copy', async () => {
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        const header = screen.getByTestId('proposal-section-header')
        expect(within(header).getByText('STEP 1')).toBeInTheDocument()
        expect(within(header).getByRole('heading', { name: 'Set up study', level: 2 })).toBeInTheDocument()
        expect(screen.getByTestId('proposal-header-divider')).toBeInTheDocument()
    })

    // The card's own spec forbids the title as body text: this is the step where it is entered.
    it('does not render the study title as body text', async () => {
        const fixtures = await setupFixtures()
        renderSetup(fixtures, { studyId: 'draft-1', draftData: null })

        expect(screen.queryByText(/^Title:/)).not.toBeInTheDocument()
    })

    // Out of scope for this card: the page H1 belongs to the header refactor.
    it('leaves the existing page heading alone', async () => {
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        expect(screen.getByRole('heading', { name: 'Request data use', level: 1 })).toBeInTheDocument()
    })
})

describe('Set Up page copy', () => {
    it('renders the intro and each field description verbatim', async () => {
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        expect(screen.getByText(INTRO)).toBeInTheDocument()
        expect(screen.getByText(TITLE_DESCRIPTION)).toBeInTheDocument()
        expect(screen.getByText(PARTNER_DESCRIPTION)).toBeInTheDocument()
    })

    // Both words capitalized is an intentional product exception, so it is pinned rather than
    // left to whatever casing a stylesheet applies.
    it('capitalizes both words of the Data Partner label', async () => {
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        const label = screen.getByText('Data Partner')
        expect(label).toBeInTheDocument()
        expect(label.textContent).toContain('Data Partner')
    })
})

describe('Study title character limit', () => {
    it('accepts a single character', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await typeTitle(user, 'A')

        expect(titleInput()).toHaveValue('A')
        expect(screen.queryByText(OVER_LIMIT_ERROR)).not.toBeInTheDocument()
    })

    it('accepts exactly 60 characters and rejects 61', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await typeTitle(user, 'a'.repeat(60))
        expect(screen.queryByText(OVER_LIMIT_ERROR)).not.toBeInTheDocument()

        await user.paste('a')
        expect(await screen.findByText(OVER_LIMIT_ERROR)).toBeInTheDocument()
    })

    // Proves the limit counts characters, not words: a 20-word rule would have failed this.
    it('accepts a 60-character multi-word title', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        const multiWord = 'one two three four five six seven eight nine ten eleven twel'
        expect(multiWord).toHaveLength(60)
        await typeTitle(user, multiWord)

        expect(screen.queryByText(OVER_LIMIT_ERROR)).not.toBeInTheDocument()
    })

    it('does not block typing past the limit', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await typeTitle(user, 'a'.repeat(65))

        expect(titleInput()).toHaveValue('a'.repeat(65))
        expect(await screen.findByText(OVER_LIMIT_ERROR)).toBeInTheDocument()
    })

    it('clears the over-limit error as soon as the value comes back under, without a blur', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await typeTitle(user, 'a'.repeat(61))
        expect(await screen.findByText(OVER_LIMIT_ERROR)).toBeInTheDocument()

        await user.type(titleInput(), '{backspace}')

        await waitFor(() => expect(screen.queryByText(OVER_LIMIT_ERROR)).not.toBeInTheDocument())
        expect(titleInput()).toHaveValue('a'.repeat(60))
    })

    // Whitespace at either end is excluded from the count, and the counter and the validator read
    // the same number, so a 60-character title plus a trailing space shows 60/60 and validates.
    it('excludes a trailing space from the counter and from validation', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await typeTitle(user, `${'a'.repeat(60)} `)

        expect(screen.getByText('60/60')).toBeInTheDocument()
        expect(screen.queryByText(OVER_LIMIT_ERROR)).not.toBeInTheDocument()
    })

    // Interior whitespace is content, so a space between words does count.
    it('counts a space between words toward the limit', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await typeTitle(user, 'a b')

        expect(screen.getByText('3/60')).toBeInTheDocument()
    })

    // The count is what the field announces, so it has to be reachable from the input itself.
    it('names the counter in the title input aria-describedby', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await typeTitle(user, 'A')

        const counter = screen.getByText('1/60')
        expect(titleInput().getAttribute('aria-describedby')).toContain(counter.id)
    })

    // The form runs uncontrolled, so a counter reading form.values directly would sit frozen.
    it('keeps the counter live while typing and on paste', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        expect(screen.getByText('0/60')).toBeInTheDocument()

        await user.click(titleInput())
        await user.keyboard('abc')
        expect(screen.getByText('3/60')).toBeInTheDocument()

        await user.paste('defg')
        expect(screen.getByText('7/60')).toBeInTheDocument()
    })
})

describe('Study title blank error', () => {
    it('starts clean and raises the blank error once the field is focused and left', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        expect(screen.queryByText(BLANK_TITLE_ERROR)).not.toBeInTheDocument()

        await user.click(titleInput())
        await user.tab()

        expect(await screen.findByText(BLANK_TITLE_ERROR)).toBeInTheDocument()
    })

    it('does not raise the blank error for a field the user never focused', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await user.click(screen.getByTestId('org-select'))
        await user.keyboard('{Escape}')

        expect(screen.queryByText(BLANK_TITLE_ERROR)).not.toBeInTheDocument()
    })

    it('clears the blank error once a real title is entered and the field is left again', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await user.click(titleInput())
        await user.tab()
        expect(await screen.findByText(BLANK_TITLE_ERROR)).toBeInTheDocument()

        await typeTitle(user, 'A real study title')
        await user.tab()

        await waitFor(() => expect(screen.queryByText(BLANK_TITLE_ERROR)).not.toBeInTheDocument())
    })

    // Clearing the box must not flash the error mid-edit: blank is a blur error, not a typing one.
    it('does not raise the blank error while the user is still typing', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await typeTitle(user, 'Draft title')
        await user.clear(titleInput())

        expect(screen.queryByText(BLANK_TITLE_ERROR)).not.toBeInTheDocument()
    })
})

describe('Data Partner and programming language fields', () => {
    it('hides the programming language field until a Data Partner is chosen', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        expect(screen.queryByText('Programming language')).not.toBeInTheDocument()

        await selectPartner(user, fixtures.singleLanguagePartner.name)

        expect(await screen.findByText('Programming language')).toBeInTheDocument()
    })

    it('auto-selects the only language a single-language partner supports', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await selectPartner(user, fixtures.singleLanguagePartner.name)

        const radio = await screen.findByRole('radio', { name: 'R' })
        await waitFor(() => expect(radio).toBeChecked())
    })

    it('offers an unselected choice for a multi-language partner', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await selectPartner(user, fixtures.multiLanguagePartner.name)

        expect(await screen.findByRole('radio', { name: 'R' })).not.toBeChecked()
        expect(screen.getByRole('radio', { name: 'Python' })).not.toBeChecked()
    })

    // Regression pin for the "no changes to this field" requirement: the helper strings and the
    // horizontal layout are the ones OTTER-350 specified, and only the container moved.
    it('keeps the single-language helper copy verbatim', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await selectPartner(user, fixtures.singleLanguagePartner.name)

        expect(
            await screen.findByText(
                `At the present ${fixtures.singleLanguagePartner.name} only supports R. Code files submitted in other languages will not be able to run.`,
            ),
        ).toBeInTheDocument()
    })

    it('keeps the multi-language helper copy verbatim', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await selectPartner(user, fixtures.multiLanguagePartner.name)

        expect(
            await screen.findByText(
                `Indicate the programming language that you will use in your data analysis. ${fixtures.multiLanguagePartner.name} will use this to set up the right environment for you.`,
            ),
        ).toBeInTheDocument()
    })

    // A language the new partner cannot run still satisfies the enum, so leaving it in place would
    // let validation pass on an environment that does not exist.
    it('clears a language the newly chosen Data Partner does not support', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await selectPartner(user, fixtures.singleLanguagePartner.name)
        await waitFor(() => expect(screen.getByRole('radio', { name: 'R' })).toBeChecked())

        await selectPartner(user, fixtures.pythonOnlyPartner.name)

        const python = await screen.findByRole('radio', { name: 'Python' })
        await waitFor(() => expect(python).toBeChecked())
        expect(screen.queryByRole('radio', { name: 'R' })).not.toBeInTheDocument()
    })

    // "Appropriately" cuts both ways: a selection the new partner still supports is the
    // researcher's answer, not stale data, so switching partners must not silently discard it.
    it('keeps a language the newly chosen Data Partner still supports', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await selectPartner(user, fixtures.singleLanguagePartner.name)
        await waitFor(() => expect(screen.getByRole('radio', { name: 'R' })).toBeChecked())

        await selectPartner(user, fixtures.multiLanguagePartner.name)

        await waitFor(() => expect(screen.getByRole('radio', { name: 'Python' })).toBeInTheDocument())
        expect(screen.getByRole('radio', { name: 'R' })).toBeChecked()
    })
})

describe('Save & continue button', () => {
    it('renders the new copy and never the old', async () => {
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        expect(continueButton()).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /proceed to step 2/i })).not.toBeInTheDocument()
    })

    it('is enabled on load, with the form empty', async () => {
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        expect(continueButton()).toBeEnabled()
    })

    it('stays enabled for whitespace-only input, which counts as empty', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await typeTitle(user, '   ')

        expect(continueButton()).toBeEnabled()
    })

    it('stays enabled after a failed click, which is what surfaces the errors', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await user.click(continueButton())

        expect(await screen.findByText(BLANK_TITLE_ERROR)).toBeInTheDocument()
        expect(continueButton()).toBeEnabled()
    })
})

describe('Save & continue validation', () => {
    // Two, not three: the programming-language field is not on the page until a Data Partner is
    // chosen, and its rule is conditional so it cannot error while hidden.
    it('flags every visible required field at once and focuses the first', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await user.click(continueButton())

        expect(await screen.findByText(BLANK_TITLE_ERROR)).toBeInTheDocument()
        expect(screen.getByText(PARTNER_ERROR)).toBeInTheDocument()
        expect(screen.queryByText(LANGUAGE_ERROR)).not.toBeInTheDocument()
        expect(document.activeElement).toBe(titleInput())
    })

    it('marks both flagged controls invalid so a screen reader can reach either', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await user.click(continueButton())

        await waitFor(() => expect(titleInput()).toHaveAttribute('aria-invalid', 'true'))
        expect(screen.getByTestId('org-select')).toHaveAttribute('aria-invalid', 'true')
    })

    it('flags and focuses the over-limit title when it is the only problem', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await typeTitle(user, 'a'.repeat(61))
        await selectPartner(user, fixtures.singleLanguagePartner.name)
        await waitFor(() => expect(screen.getByRole('radio', { name: 'R' })).toBeChecked())

        await user.click(continueButton())

        expect(await screen.findByText(OVER_LIMIT_ERROR)).toBeInTheDocument()
        expect(document.activeElement).toBe(titleInput())
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('flags an unanswered multi-language choice and moves focus into the group', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await typeTitle(user, 'A valid study title')
        await selectPartner(user, fixtures.multiLanguagePartner.name)
        await screen.findByRole('radio', { name: 'Python' })

        await user.click(continueButton())

        expect(await screen.findByText(LANGUAGE_ERROR)).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: 'R' })).toHaveAttribute('aria-invalid', 'true')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens the modal once every field is valid', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await typeTitle(user, 'A valid study title')
        await selectPartner(user, fixtures.singleLanguagePartner.name)
        await waitFor(() => expect(screen.getByRole('radio', { name: 'R' })).toBeChecked())

        await user.click(continueButton())

        expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    it('opens the modal on a second click once the flagged problems are fixed', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        await user.click(continueButton())
        expect(await screen.findByText(BLANK_TITLE_ERROR)).toBeInTheDocument()

        await typeTitle(user, 'Now it has a title')
        await selectPartner(user, fixtures.singleLanguagePartner.name)
        await waitFor(() => expect(screen.getByRole('radio', { name: 'R' })).toBeChecked())

        await user.click(continueButton())

        expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })
})

describe('Next step confirmation modal', () => {
    const openModal = async (user: ReturnType<typeof userEvent.setup>, fixtures: Fixtures, title: string) => {
        await typeTitle(user, title)
        await selectPartner(user, fixtures.singleLanguagePartner.name)
        await waitFor(() => expect(screen.getByRole('radio', { name: 'R' })).toBeChecked())
        await user.click(continueButton())
        return await screen.findByRole('dialog')
    }

    it('renders the confirmation copy verbatim', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        const dialog = await openModal(user, fixtures, 'A valid study title')

        expect(within(dialog).getByText('Continue to the next step?')).toBeInTheDocument()
        expect(
            within(dialog).getByText(
                'Make sure your Data Partner and programming language are correct. They cannot be changed after this step. You can still edit your study title.',
            ),
        ).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    })

    it('keeps every entered value when the researcher cancels', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        const dialog = await openModal(user, fixtures, 'A valid study title')
        await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(titleInput()).toHaveValue('A valid study title')
        expect(screen.getByTestId('org-select')).toHaveValue(fixtures.singleLanguagePartner.name)
        expect(screen.getByRole('radio', { name: 'R' })).toBeChecked()
    })

    it('persists the study with its Step 1 title and moves on to Step 2', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        memoryRouter.setCurrentUrl('/start')
        renderSetup(fixtures)

        const dialog = await openModal(user, fixtures, '  Titled on Step 1  ')
        await user.click(within(dialog).getByRole('button', { name: 'Continue' }))

        const study = await waitFor(
            async () => {
                const row = await db
                    .selectFrom('study')
                    .select(['id', 'title', 'language'])
                    .where('title', '=', 'Titled on Step 1')
                    .executeTakeFirst()
                expect(row).toBeDefined()
                return row!
            },
            { timeout: 5000 },
        )

        expect(study.language).toBe('R')
        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(Routes.studyProposal({ orgSlug: fixtures.lab.slug, studyId: study.id })),
        )
    })
})

describe('Footer left action', () => {
    it('offers to discard while nothing has been saved yet', async () => {
        const fixtures = await setupFixtures()
        renderSetup(fixtures)

        expect(screen.getByRole('button', { name: 'Discard study' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    // Discarding is an offer about the study's existence, so it belongs to the state where no row
    // exists yet. Once one is persisted, deleting it lives behind the dashboard's delete-draft
    // button and this footer offers nothing on the left (OTTER-764).
    it('offers no left action once the draft is persisted', async () => {
        const fixtures = await setupFixtures()
        renderSetup(fixtures, { studyId: faker.string.uuid(), draftData: null })

        expect(screen.queryByRole('button', { name: 'Discard study' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    it('returns to the dashboard', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        memoryRouter.setCurrentUrl('/start')
        renderSetup(fixtures)

        await user.click(screen.getByRole('button', { name: 'Discard study' }))

        await waitFor(() => expect(memoryRouter.asPath).toBe(Routes.dashboard))
    })
})

describe('Locked fields', () => {
    const draftFor = (fixtures: Fixtures, overrides: Partial<DraftStudyData> = {}): DraftStudyData => ({
        id: faker.string.uuid(),
        orgSlug: fixtures.singleLanguagePartner.slug,
        orgName: fixtures.singleLanguagePartner.name,
        language: 'R',
        status: 'DRAFT',
        title: 'A previously saved title',
        ...overrides,
    })

    // State B, revisiting a draft that already passed Step 1: the Data Partner and language are
    // settled, but the title is still the researcher's to change until they submit.
    it('locks the partner and language on a revisited draft, leaving the title editable', async () => {
        const fixtures = await setupFixtures()
        const draftData = draftFor(fixtures)
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        await waitFor(() => expect(titleInput()).toHaveValue('A previously saved title'))
        expect(titleInput()).toBeEnabled()

        expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
        expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    })

    // Display labels, not stored values: the researcher chose "Single Language Partner" and "R",
    // not a slug and a SQL enum.
    it('shows the locked values as the labels the researcher chose', async () => {
        const fixtures = await setupFixtures()
        const draftData = draftFor(fixtures)
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        expect(await screen.findByText(fixtures.singleLanguagePartner.name)).toBeInTheDocument()
        expect(screen.getByText('R')).toBeInTheDocument()
        expect(screen.queryByText(fixtures.singleLanguagePartner.slug)).not.toBeInTheDocument()
        expect(screen.queryByText('PYTHON')).not.toBeInTheDocument()
    })

    // Locking on the studyId alone would strand a draft that never got a language: nothing to fix,
    // and a Continue click that can never pass validation.
    it('leaves a field editable when the draft never got a value for it', async () => {
        const fixtures = await setupFixtures()
        const draftData = draftFor(fixtures, { language: null })
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        expect(await screen.findByRole('radio', { name: 'R' })).toBeInTheDocument()
    })

    // State C. Not reachable through the app yet, because /edit still 404s for non-DRAFT studies,
    // so the rule is proven by rendering the view directly with a submitted study.
    it('locks the title too once the proposal has been submitted', async () => {
        const fixtures = await setupFixtures()
        const draftData = draftFor(fixtures, { status: 'PENDING-REVIEW' })
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        await waitFor(() => expect(screen.getByText('A previously saved title')).toBeInTheDocument())
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
        expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    })

    // The lock is derived from the persisted status, never from anything the session holds, which
    // is what makes it survive navigation and a reload rather than depending on a guard.
    it('keeps the title editable for a DRAFT and locks it for every later status', async () => {
        const fixtures = await setupFixtures()

        const draft = draftFor(fixtures)
        const { unmount } = renderSetup(fixtures, { studyId: draft.id, draftData: draft })
        await waitFor(() => expect(titleInput()).toBeEnabled())
        unmount()

        const submitted = draftFor(fixtures, { status: 'APPROVED' })
        renderSetup(fixtures, { studyId: submitted.id, draftData: submitted })
        await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
    })

    // A partner's supported languages are server state and can change after the draft was saved.
    // A locked field renders read-only text with no error slot, and a failed Continue skips locked
    // ids when it looks for something to focus, so a value cleared here would leave the draft
    // permanently uncompletable with nothing on screen to explain it.
    it('keeps a locked language when the Data Partner no longer supports any', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        const { study, draftData } = await insertRevisitableDraft(fixtures, {
            orgSlug: fixtures.retiredPartner.slug,
            orgName: fixtures.retiredPartner.name,
            language: 'R',
        })
        // Primed rather than fetched. The effect under test fires when the languages query
        // resolves, and a locked field renders nothing derived from it, so there is no DOM signal
        // to wait on and a live fetch would race the Continue click. Seeding the cache (the test
        // client does not refetch on mount) makes the effect run before the click, every time.
        const queryClient = createTestQueryClient()
        queryClient.setQueryData(['languages-for-org', fixtures.retiredPartner.slug], {
            orgName: fixtures.retiredPartner.name,
            languages: [],
        })

        renderSetup(fixtures, { studyId: draftData.id, draftData }, queryClient)

        expect(await screen.findByText(fixtures.retiredPartner.name)).toBeInTheDocument()
        await waitFor(() => expect(titleInput()).toHaveValue('A previously saved title'))
        expect(screen.getByText('R')).toBeInTheDocument()

        await user.click(saveAndContinueButton())

        // Reaching Step 2 is the proof that the persisted language survived the partner's language
        // set emptying underneath it: a failed validation would keep the researcher on this page.
        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(Routes.studyProposal({ orgSlug: fixtures.lab.slug, studyId: study.id })),
        )
        expect(screen.queryByText(LANGUAGE_ERROR)).not.toBeInTheDocument()
        expect(screen.getByText('R')).toBeInTheDocument()
    })

    it('never sends focus into a locked field on a failed click', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        const draftData = draftFor(fixtures, { title: '' })
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        await waitFor(() => expect(titleInput()).toHaveValue(''))
        await user.click(saveAndContinueButton())

        expect(await screen.findByText(BLANK_TITLE_ERROR)).toBeInTheDocument()
        expect(document.activeElement).toBe(titleInput())
    })

    // A locked field is server state rendered as read-only text: no error slot to show a message in,
    // and no id in the list a failed click searches for something to focus. A stored title is never
    // truncated, so one over the cap is the reachable shape of a locked field that fails validation,
    // and it must not leave the CTA with nothing to say and nowhere to go (the OTTER-647 dead
    // button). In the submitted state the CTA does not validate at all, so it simply steps forward.
    it('steps forward from a submitted study whose stored title is over the cap', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        const overLimitTitle = 'a'.repeat(61)
        const draftData = submittedDraft(fixtures, { title: overLimitTitle })
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        expect(await screen.findByText(overLimitTitle)).toBeInTheDocument()
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

        await user.click(nextStepButton())

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(
                Routes.studySubmitted({ orgSlug: fixtures.lab.slug, studyId: draftData.id }),
            ),
        )
        expect(screen.queryByText(OVER_LIMIT_ERROR)).not.toBeInTheDocument()
    })
})

// OTTER-764. Step 1 is reached in three states, and each one carries its own CTA copy, its own
// validation duty and its own forward target.
describe('Step 1 navigation state: revisiting a draft', () => {
    it('leaves the title editable and shows the settled choices as text', async () => {
        const fixtures = await setupFixtures()
        const { draftData } = await insertRevisitableDraft(fixtures)
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        await waitFor(() => expect(titleInput()).toHaveValue('A previously saved title'))
        expect(titleInput()).toBeEnabled()

        expect(await screen.findByText(fixtures.singleLanguagePartner.name)).toBeInTheDocument()
        expect(screen.getByText('R')).toBeInTheDocument()
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
        expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    })

    it('titles the CTA Save and continue, and offers no left action', async () => {
        const fixtures = await setupFixtures()
        const { draftData } = await insertRevisitableDraft(fixtures)
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        expect(saveAndContinueButton()).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Save & continue' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Next step' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Discard study' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    // The modal warns that the Data Partner and the language cannot be changed after this step. By
    // now they are already fixed, so it has nothing left to say and must not appear.
    it('saves an edited title and reaches Step 2 without the confirmation modal', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        const { study, draftData } = await insertRevisitableDraft(fixtures)
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        await waitFor(() => expect(titleInput()).toHaveValue('A previously saved title'))
        await user.clear(titleInput())
        await typeTitle(user, 'A title changed on the way back')

        await user.click(saveAndContinueButton())

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.queryByText('Continue to the next step?')).not.toBeInTheDocument()

        await waitFor(async () => {
            const row = await db
                .selectFrom('study')
                .select(['title', 'language'])
                .where('id', '=', study.id)
                .executeTakeFirst()
            expect(row?.title).toBe('A title changed on the way back')
            // The click must not touch the settled choices, which stay uneditable throughout.
            expect(row?.language).toBe('R')
        })

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(Routes.studyProposal({ orgSlug: fixtures.lab.slug, studyId: study.id })),
        )
    })

    it('still saves and moves on when the title was never touched', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        const { study, draftData } = await insertRevisitableDraft(fixtures)
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        await waitFor(() => expect(titleInput()).toHaveValue('A previously saved title'))
        await user.click(saveAndContinueButton())

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(Routes.studyProposal({ orgSlug: fixtures.lab.slug, studyId: study.id })),
        )
        expect(screen.queryByText(BLANK_TITLE_ERROR)).not.toBeInTheDocument()
        expect(screen.queryByText(OVER_LIMIT_ERROR)).not.toBeInTheDocument()

        const row = await db.selectFrom('study').select(['title']).where('id', '=', study.id).executeTakeFirst()
        expect(row?.title).toBe('A previously saved title')
    })

    // Dropping the modal drops the modal only. The title rules still gate the click.
    it('blocks a blank title and never navigates', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        const { draftData } = await insertRevisitableDraft(fixtures)
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        await waitFor(() => expect(titleInput()).toHaveValue('A previously saved title'))
        await user.clear(titleInput())
        await user.click(saveAndContinueButton())

        expect(await screen.findByText(BLANK_TITLE_ERROR)).toBeInTheDocument()
        expect(memoryRouter.asPath).toBe('/start')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('blocks a title over the character cap and never navigates', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        const { draftData } = await insertRevisitableDraft(fixtures)
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        await waitFor(() => expect(titleInput()).toHaveValue('A previously saved title'))
        await user.clear(titleInput())
        await typeTitle(user, 'a'.repeat(61))

        await user.click(saveAndContinueButton())

        expect(await screen.findByText(OVER_LIMIT_ERROR)).toBeInTheDocument()
        expect(memoryRouter.asPath).toBe('/start')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
})

describe('Step 1 navigation state: a submitted proposal', () => {
    it('renders every field as read-only text', async () => {
        const fixtures = await setupFixtures()
        const draftData = submittedDraft(fixtures)
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        expect(await screen.findByText('A previously saved title')).toBeInTheDocument()
        expect(screen.getByText(fixtures.singleLanguagePartner.name)).toBeInTheDocument()
        expect(screen.getByText('R')).toBeInTheDocument()

        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
        expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    })

    it('titles the CTA Next step, and offers no left action', async () => {
        const fixtures = await setupFixtures()
        const draftData = submittedDraft(fixtures)
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        expect(nextStepButton()).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Save and continue' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Save & continue' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Discard study' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    // Nothing here is editable, so there is nothing to validate and nothing to save. The click is a
    // step forward and no more.
    it('steps forward to the submitted record with no validation and no modal', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        const draftData = submittedDraft(fixtures)
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        expect(await screen.findByText('A previously saved title')).toBeInTheDocument()
        await user.click(nextStepButton())

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(
                Routes.studySubmitted({ orgSlug: fixtures.lab.slug, studyId: draftData.id }),
            ),
        )
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.queryByText(BLANK_TITLE_ERROR)).not.toBeInTheDocument()
        expect(screen.queryByText(PARTNER_ERROR)).not.toBeInTheDocument()
        expect(screen.queryByText(LANGUAGE_ERROR)).not.toBeInTheDocument()
    })

    it('reaches the submitted record for a decided proposal too', async () => {
        const user = userEvent.setup()
        const fixtures = await setupFixtures()
        const draftData = submittedDraft(fixtures, { status: 'CHANGE-REQUESTED' })
        renderSetup(fixtures, { studyId: draftData.id, draftData })

        expect(await screen.findByText('A previously saved title')).toBeInTheDocument()
        await user.click(nextStepButton())

        await waitFor(() =>
            expect(memoryRouter.asPath).toBe(
                Routes.studySubmitted({ orgSlug: fixtures.lab.slug, studyId: draftData.id }),
            ),
        )
    })
})

beforeEach(() => {
    memoryRouter.setCurrentUrl('/start')
})
