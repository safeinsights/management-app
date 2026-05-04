import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { EditResubmitProvider } from '@/contexts/edit-resubmit'
import { ResubmissionNoteSection } from './resubmission-note-section'
import { RESUBMIT_NOTE_MIN_WORDS } from './schema'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

const renderSection = () =>
    renderWithProviders(
        <EditResubmitProvider studyId={STUDY_ID}>
            <ResubmissionNoteSection orgName="Rice University" />
        </EditResubmitProvider>,
    )

const wordsString = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

describe('ResubmissionNoteSection', () => {
    it('renders the section title and the data org name in the secondary text', () => {
        renderSection()
        expect(screen.getByRole('heading', { name: 'Resubmission Note' })).toBeInTheDocument()
        expect(screen.getByText(/Rice University/)).toBeInTheDocument()
    })

    it('renders a 0/300 word counter when empty', () => {
        renderSection()
        expect(screen.getByText('0/300')).toBeInTheDocument()
    })

    it('updates the word counter live as the user types', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.type(textarea, 'one two three')
        expect(screen.getByText('3/300')).toBeInTheDocument()
    })

    it('shows a validation error when the note is below the minimum word count and the field is blurred', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.type(textarea, 'too short')
        await user.tab()
        expect(screen.getByText(/between 50 and 300 words/i)).toBeInTheDocument()
    })

    it('accepts a note at the minimum word count without surfacing a range error', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        // paste avoids per-keystroke validation thrash for a 50-word seed
        await user.paste(wordsString(RESUBMIT_NOTE_MIN_WORDS))
        expect(screen.queryByText(/between 50 and 300 words/i)).not.toBeInTheDocument()
    })
})
