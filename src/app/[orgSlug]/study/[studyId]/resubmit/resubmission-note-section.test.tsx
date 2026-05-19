import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { EditCodeResubmitProvider } from '@/contexts/edit-code-resubmit'
import { ResubmissionNoteSection } from './resubmission-note-section'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

const renderSection = (initialNote = '') =>
    renderWithProviders(
        <EditCodeResubmitProvider studyId={STUDY_ID} initialNote={initialNote}>
            <ResubmissionNoteSection orgName="Rice University" />
        </EditCodeResubmitProvider>,
    )

describe('ResubmissionNoteSection', () => {
    it('renders the textarea and word counter', () => {
        renderSection()
        expect(screen.getByRole('textbox', { name: 'Resubmission Note' })).toBeInTheDocument()
        expect(screen.getByText('0/300')).toBeInTheDocument()
    })

    it('updates word counter as the user types', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.paste('one two three')
        expect(screen.getByText('3/300')).toBeInTheDocument()
    })

    it('renders the autosave status when a draft has been saved', async () => {
        renderSection('a pre-existing draft note')
        expect(screen.getByRole('textbox', { name: 'Resubmission Note' })).toHaveValue('a pre-existing draft note')
    })
})
