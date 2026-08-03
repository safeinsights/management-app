import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { describe, expect, faker, it, render, screen, userEvent, vi, within } from '@/tests/unit.helpers'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { fieldDescriptionId, fieldErrorId } from '@/components/form-field'
import { theme } from '@/theme'
import { ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS } from '@/lib/outputs-review'
import { FEEDBACK_INPUT_ID, OutputsDecisionSection } from './outputs-decision-section'

const LAB = 'Rice Lab'

// singleUserEditing renders the standalone Lexical surface, so the editor is interactive here
// instead of held behind the collaborative skeleton (which needs a live websocket).
const renderSection = (overrides: Record<string, unknown> = {}) => {
    const props = {
        jobId: faker.string.uuid(),
        studyId: faker.string.uuid(),
        labName: LAB,
        maxWords: ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS,
        wordCount: 0,
        feedbackError: undefined,
        onFeedbackChange: vi.fn(),
        onFeedbackBlur: vi.fn(),
        selected: null,
        onSelect: vi.fn(),
        onDecisionBlur: vi.fn(),
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

    it('renders the word counter against the errored-run cap of 300', () => {
        renderSection({ wordCount: 12 })

        expect(screen.getByText('12/300')).toBeInTheDocument()
    })

    it('associates the counter with the editor via aria-describedby', async () => {
        renderSection({ wordCount: 12 })

        const editor = await screen.findByLabelText('Decision feedback')
        expect(editor.getAttribute('aria-describedby')).toContain(fieldDescriptionId(FEEDBACK_INPUT_ID))
        expect(document.getElementById(fieldDescriptionId(FEEDBACK_INPUT_ID))).toHaveTextContent('12/300')
    })

    it('marks the editor invalid and describes the error when over the limit', async () => {
        renderSection({
            wordCount: 301,
            feedbackError: 'Feedback exceeds the 300 word limit. Shorten it to continue.',
        })

        const editor = await screen.findByLabelText('Decision feedback')
        expect(editor).toHaveAttribute('aria-invalid', 'true')
        expect(editor.getAttribute('aria-describedby')).toContain(fieldErrorId(FEEDBACK_INPUT_ID))
        expect(screen.getByText('Feedback exceeds the 300 word limit. Shorten it to continue.')).toBeInTheDocument()
    })

    // Polite, not assertive: the over-limit message can fire on every keystroke past the cap, and
    // an assertive region would interrupt the user mid-sentence.
    it('announces field messages politely', () => {
        renderSection({ feedbackError: 'Feedback exceeds the 300 word limit. Shorten it to continue.' })

        const region = document.getElementById(fieldErrorId(FEEDBACK_INPUT_ID))!
        expect(region).toHaveAttribute('aria-live', 'polite')
        expect(region).not.toHaveAttribute('aria-live', 'assertive')
    })

    // The editor draws its own autosave indicator next to this counter; rendering a second one
    // here would show the reviewer two "All changes saved" messages in collaborative mode.
    it('renders exactly one autosave indicator, owned by the editor', async () => {
        renderSection()

        await screen.findByLabelText('Decision feedback')
        expect(screen.queryAllByTestId('autosave-status').length).toBeLessThanOrEqual(1)
    })

    it('shows the validation error beneath the field', () => {
        renderSection({ feedbackError: 'Enter your feedback for Rice Lab before submitting.' })

        expect(screen.getByText('Enter your feedback for Rice Lab before submitting.')).toBeInTheDocument()
    })

    // A real list, so a screen reader announces two items rather than one run-on sentence.
    it('renders the guidance clauses as a list', () => {
        renderSection()

        const items = screen.getAllByRole('listitem')
        expect(items).toHaveLength(2)
        expect(items[1]).toHaveTextContent('If they do not, share the outputs along with your feedback.')
    })

    // Guards against an accidental keyboard trap: an unresolved error must not pin the caret in
    // the editor. Tabs until the radio is reached rather than assuming a fixed count, because the
    // editor's formatting toolbar sits between the two and its size is not this test's business.
    it('does not trap focus while an error is active', async () => {
        renderSection({ feedbackError: 'Enter your feedback for Rice Lab before submitting.' })

        const editor = await screen.findByLabelText('Decision feedback')
        editor.focus()
        expect(editor).toHaveFocus()

        const firstRadio = screen.getByTestId('outputs-decision-share-outputs')
        for (let i = 0; i < 12 && !firstRadio.matches(':focus'); i++) {
            await userEvent.tab()
        }

        expect(firstRadio).toHaveFocus()
    })
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
        expect(screen.getByText('Sharing decision')).toBeInTheDocument()
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
})
