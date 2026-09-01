import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import {
    describe,
    expect,
    faker,
    it,
    render,
    screen,
    simulateEditorSave,
    userEvent,
    vi,
    within,
} from '@/tests/unit.helpers'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { fieldCounterId, fieldErrorId } from '@/components/form-field'
import { theme } from '@/theme'
import { SAVED_LABEL } from '@/components/save-status'
import { OUTPUTS_DECISION_ERRORS, OUTPUTS_FEEDBACK_MAX_CHARACTERS } from '@/lib/outputs-review'
import { DECISION_GROUP_ID, FEEDBACK_INPUT_ID, OutputsDecisionSection } from './outputs-decision-section'

const LAB = 'Rice Lab'

// singleUserEditing renders the standalone Lexical surface, so the editor is interactive here
// instead of held behind the collaborative skeleton (which needs a live websocket).
const renderSection = (overrides: Record<string, unknown> = {}) => {
    const props = {
        jobId: faker.string.uuid(),
        studyId: faker.string.uuid(),
        labName: LAB,
        characterCount: 0,
        feedbackError: undefined,
        onFeedbackChange: vi.fn(),
        selected: null,
        onSelect: vi.fn(),
        decisionError: undefined,
        ...overrides,
    }

    render(
        <MantineProvider theme={theme}>
            <YjsWebsocketProvider singleUserEditing>
                <ModalsProvider>
                    <OutputsDecisionSection {...props} />
                </ModalsProvider>
            </YjsWebsocketProvider>
        </MantineProvider>,
    )
    return props
}

// The collaborative branch, the only one that draws a save indicator: the single-user surface
// above has no Yjs provider, so exclusivity could only be asserted there vacuously. Returns a
// re-render that raises the error, which is how the submit attempt surfaces it in production.
const renderCollaborativeSection = () => {
    const props = {
        jobId: faker.string.uuid(),
        studyId: faker.string.uuid(),
        labName: LAB,
        characterCount: 0,
        onFeedbackChange: vi.fn(),
        selected: null,
        onSelect: vi.fn(),
        decisionError: undefined,
    }

    const tree = (feedbackError?: string) => (
        <MantineProvider theme={theme}>
            <YjsWebsocketProvider>
                <ModalsProvider>
                    <OutputsDecisionSection {...props} feedbackError={feedbackError} />
                </ModalsProvider>
            </YjsWebsocketProvider>
        </MantineProvider>
    )

    const { rerender } = render(tree())
    return { showFeedbackError: (message: string) => rerender(tree(message)) }
}

describe('OutputsDecisionSection header', () => {
    it('renders the Decision heading with a required marker carrying an accessible name', () => {
        renderSection()

        expect(screen.getByText('Decision')).toBeInTheDocument()
        expect(screen.getByLabelText('required')).toHaveTextContent('*')
    })

    it('renders the guidance copy with the lab name interpolated', () => {
        renderSection()

        const section = screen.getByTestId('outputs-decision-section')
        expect(section).toHaveTextContent('Based on your review:')
        expect(section).toHaveTextContent(
            `If the outputs contain sensitive or restricted information, do not share them. Describe the issue in your feedback so ${LAB} can revise the code.`,
        )
        expect(section).toHaveTextContent('If they do not, share the outputs along with your feedback.')
    })
})

describe('OutputsDecisionSection feedback field', () => {
    it('marks the editor required for assistive tech', async () => {
        renderSection()

        expect(await screen.findByLabelText('Decision feedback')).toHaveAttribute('aria-required', 'true')
    })

    // No unit beside the count, matching every other capped field in the app (OTTER-737).
    it('renders the character counter against the 1800 cap', () => {
        renderSection({ characterCount: 12 })

        expect(screen.getByText(`12/${OUTPUTS_FEEDBACK_MAX_CHARACTERS}`)).toBeInTheDocument()
    })

    it('associates the counter with the editor via aria-describedby', async () => {
        renderSection({ characterCount: 12 })

        const editor = await screen.findByLabelText('Decision feedback')
        expect(editor.getAttribute('aria-describedby')).toContain(fieldCounterId(FEEDBACK_INPUT_ID))
        expect(document.getElementById(fieldCounterId(FEEDBACK_INPUT_ID))).toHaveTextContent(
            `12/${OUTPUTS_FEEDBACK_MAX_CHARACTERS}`,
        )
    })

    it('marks the editor invalid and describes the error when over the limit', async () => {
        renderSection({
            characterCount: OUTPUTS_FEEDBACK_MAX_CHARACTERS + 1,
            feedbackError: OUTPUTS_DECISION_ERRORS.feedbackTooLong,
        })

        const editor = await screen.findByLabelText('Decision feedback')
        expect(editor).toHaveAttribute('aria-invalid', 'true')
        expect(editor.getAttribute('aria-describedby')).toContain(fieldErrorId(FEEDBACK_INPUT_ID))
        expect(screen.getByText(OUTPUTS_DECISION_ERRORS.feedbackTooLong)).toBeInTheDocument()
    })

    // Polite, not assertive: the over-limit message can fire on every keystroke past the cap, and
    // an assertive region would interrupt the user mid-sentence.
    it('announces field messages politely', () => {
        renderSection({ feedbackError: OUTPUTS_DECISION_ERRORS.feedbackTooLong })

        const region = document.getElementById(fieldErrorId(FEEDBACK_INPUT_ID))!
        expect(region).toHaveAttribute('aria-live', 'polite')
        expect(region).not.toHaveAttribute('aria-live', 'assertive')
    })

    // The editor owns the autosave indicator (it renders one next to this counter in
    // collaborative mode), so this section must not draw a second. Asserting on the counter's own
    // slot rather than a global count, because a global "at most one" also passes when there are
    // none and would prove nothing.
    it('puts the counter in the editor footer and adds no autosave indicator of its own', async () => {
        renderSection({ characterCount: 7 })

        await screen.findByLabelText('Decision feedback')
        const counter = document.getElementById(fieldCounterId(FEEDBACK_INPUT_ID))!
        expect(counter).toHaveTextContent(`7/${OUTPUTS_FEEDBACK_MAX_CHARACTERS}`)
        expect(counter.querySelector('[data-testid="autosave-status"]')).toBeNull()

        const section = screen.getByTestId('outputs-decision-section')
        const errorSlot = document.getElementById(fieldErrorId(FEEDBACK_INPUT_ID))!
        expect(errorSlot.querySelector('[data-testid="autosave-status"]')).toBeNull()
        expect(section.contains(counter)).toBe(true)
    })

    it('shows the validation error beneath the field', () => {
        renderSection({ feedbackError: 'Enter your feedback for Rice Lab before submitting.' })

        expect(screen.getByText('Enter your feedback for Rice Lab before submitting.')).toBeInTheDocument()
    })

    // The error has to take the exact slot the save indicator vacates, directly under the input,
    // rather than a row below the counter. Pinned by what the error's row does and does not hold:
    // a plain "the counter is somewhere under the same ancestor" also passes when the error is
    // stranded a row below it, because the section wrapper contains both either way.
    it('renders the empty-field error in the same footer row as the character counter', async () => {
        const emptyError = OUTPUTS_DECISION_ERRORS.feedbackEmpty(LAB)
        renderSection({ feedbackError: emptyError })

        const editor = await screen.findByLabelText('Decision feedback')
        const errorBox = document.getElementById(fieldErrorId(FEEDBACK_INPUT_ID))!
        expect(errorBox).toHaveTextContent(emptyError)

        const footerRow = errorBox.parentElement!
        expect(footerRow).toContainElement(document.getElementById(fieldCounterId(FEEDBACK_INPUT_ID)))
        expect(footerRow).not.toContainElement(editor)
    })

    // A real list, so a screen reader announces two items rather than one run-on sentence.
    it('renders the guidance clauses as a list', () => {
        renderSection()

        const items = screen.getAllByRole('listitem')
        expect(items).toHaveLength(2)
        expect(items[1]).toHaveTextContent('If they do not, share the outputs along with your feedback.')
    })

    // The "focus is not trapped in the editor" AC row is covered in tests/study-flow.spec.ts, not
    // here. jsdom cannot fail that assertion: Lexical's Tab handler returns early unless
    // $getSelection() is a RangeSelection, and calling focus() on the contenteditable never
    // establishes one, so the keydown is never cancelled and userEvent.tab() always moves focus.
    // A version of this test lived here and passed for the whole time the real browser was
    // trapping (OTTER-675).
})

describe('OutputsDecisionSection radio buttons', () => {
    it('renders exactly two options with their titles and descriptions', () => {
        renderSection()

        const radios = screen.getAllByRole('radio')
        expect(radios).toHaveLength(2)

        expect(screen.getByText('Share outputs and feedback')).toBeInTheDocument()
        expect(screen.getByText(`Share the output files and your feedback with ${LAB}.`)).toBeInTheDocument()
        expect(screen.getByText('Share feedback only')).toBeInTheDocument()
        expect(
            screen.getByText(
                'Share your feedback without sharing the output files. Choose this if the outputs contain sensitive or restricted information.',
            ),
        ).toBeInTheDocument()
    })

    it('starts with neither option selected', () => {
        renderSection()

        for (const radio of screen.getAllByRole('radio')) {
            expect(radio).not.toBeChecked()
        }
    })

    // Native inputs sharing one `name`, not two JS-coordinated buttons: that is what gives the
    // group real AT semantics and arrow-key navigation for free.
    it('uses native radio inputs that share a name', () => {
        renderSection()

        for (const radio of screen.getAllByRole('radio')) {
            expect(radio.tagName).toBe('INPUT')
            expect(radio).toHaveAttribute('type', 'radio')
            expect(radio).toHaveAttribute('name', 'outputs-decision')
        }
    })

    it('groups the options with an accessible group name', () => {
        renderSection()

        const group = screen.getByRole('radiogroup')
        expect(group).toBeInTheDocument()
        expect(within(group).getAllByRole('radio')).toHaveLength(2)
        expect(group).toHaveAccessibleName('Sharing decision')
    })

    // The submit-time focus jump resolves this id with document.getElementById, so it has to be on
    // a real element that actually contains the radios. Mantine's Radio.Group swallows an `id` prop
    // without rendering it, which made the jump a silent no-op until the id moved to a wrapper.
    it('exposes a resolvable anchor element containing the radios', () => {
        renderSection()

        const anchor = document.getElementById(DECISION_GROUP_ID)
        expect(anchor).not.toBeNull()
        expect(anchor!.querySelector('input[type="radio"]')).not.toBeNull()
    })

    it('describes each option with its body text', () => {
        renderSection()

        const [shareOutputs, feedbackOnly] = screen.getAllByRole('radio')
        expect(shareOutputs).toHaveAccessibleDescription(`Share the output files and your feedback with ${LAB}.`)
        expect(feedbackOnly).toHaveAccessibleDescription(
            'Share your feedback without sharing the output files. Choose this if the outputs contain sensitive or restricted information.',
        )
    })

    it('reports the chosen option', async () => {
        const props = renderSection()

        await userEvent.click(screen.getByTestId('outputs-decision-share-feedback-only'))

        expect(props.onSelect).toHaveBeenCalledWith('share-feedback-only')
    })

    it('checks only the selected option', () => {
        renderSection({ selected: 'share-outputs' })

        const [shareOutputs, feedbackOnly] = screen.getAllByRole('radio')
        expect(shareOutputs).toBeChecked()
        expect(feedbackOnly).not.toBeChecked()
    })

    it('moves the selection with arrow keys', async () => {
        const props = renderSection()

        await userEvent.click(screen.getByTestId('outputs-decision-share-outputs'))
        await userEvent.keyboard('{ArrowDown}')

        expect(props.onSelect).toHaveBeenLastCalledWith('share-feedback-only')
    })

    it('shows the unselected error on the group', () => {
        renderSection({ decisionError: 'Select an option before submitting' })

        expect(screen.getByText('Select an option before submitting')).toBeInTheDocument()
    })

    it('marks the options invalid while the unselected error is showing (OTTER-675)', () => {
        renderSection({ decisionError: 'Select an option before submitting' })

        for (const option of screen.getAllByRole('radio')) {
            expect(option).toHaveAttribute('aria-invalid', 'true')
        }
    })

    it('leaves the options valid when no error is showing', () => {
        renderSection()

        for (const option of screen.getAllByRole('radio')) {
            expect(option).not.toHaveAttribute('aria-invalid')
        }
    })
})

// See the matching blocks in the two reviewer feedback sections. The save is driven for real
// before the error is raised, so this cannot pass by virtue of the indicator never having shown.
describe('OutputsDecisionSection save label and error exclusivity', () => {
    it('replaces the save label with the empty-field error rather than showing both', async () => {
        const { showFeedbackError } = renderCollaborativeSection()

        await screen.findByLabelText('Decision feedback')
        await simulateEditorSave()
        expect(screen.getByTestId('autosave-status')).toHaveTextContent(SAVED_LABEL)

        showFeedbackError(OUTPUTS_DECISION_ERRORS.feedbackEmpty(LAB))

        expect(document.getElementById(fieldErrorId(FEEDBACK_INPUT_ID))).toHaveTextContent(
            OUTPUTS_DECISION_ERRORS.feedbackEmpty(LAB),
        )
        expect(screen.queryByTestId('autosave-status')).toBeNull()
    })
})
