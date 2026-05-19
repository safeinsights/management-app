import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { EditResubmitProvider, type EditResubmitDraftData } from '@/contexts/edit-resubmit'
import { lexicalJson } from '@/lib/lexical'
import { EditResubmitFooter } from './footer'
import { ResubmissionNoteSection } from './resubmission-note-section'
import { RESUBMIT_NOTE_MIN_WORDS } from './schema'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

// Pre-fill the proposal-side of the form so `form.isValid()` is true. This
// isolates the note gate: any disabled-state we observe is the note gate's
// doing, not a side-effect of the proposal form being empty.
const VALID_PROPOSAL_DRAFT: EditResubmitDraftData = {
    title: 'A valid title',
    datasets: ['some-dataset'],
    researchQuestions: lexicalJson('Some research questions'),
    projectSummary: lexicalJson('A project summary'),
    impact: lexicalJson('Some impact'),
    piName: 'PI Name',
    piUserId: '22222222-2222-4222-8222-222222222222',
}

const renderFooter = (draft: EditResubmitDraftData = VALID_PROPOSAL_DRAFT) =>
    renderWithProviders(
        <EditResubmitProvider studyId={STUDY_ID} draftData={draft}>
            <ResubmissionNoteSection orgName="Rice University" />
            <EditResubmitFooter researcherName="Test Researcher" researcherId="" />
        </EditResubmitProvider>,
    )

const wordsString = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

describe('EditResubmitFooter — Resubmit gating', () => {
    // OTTER-521 regression: the prior implementation relied on Mantine's
    // `noteForm.isValid()` for the disabled check, but Mantine doesn't validate
    // initial values. With a valid proposal form, `form.isValid()` returned true
    // AND empty-note `noteForm.isValid()` falsely returned true — Resubmit was
    // enabled on first paint. Footer now derives note validity from the schema
    // against `noteForm.values` directly.
    it('disables Resubmit on first paint when the resubmission note is empty, even if the proposal form is otherwise valid', () => {
        renderFooter()
        const resubmit = screen.getByRole('button', { name: /Resubmit initial request/i })
        expect(resubmit).toBeDisabled()
    })

    it('keeps Resubmit disabled while the note is below the minimum word count', async () => {
        const user = userEvent.setup()
        renderFooter()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.type(textarea, 'too short')
        const resubmit = screen.getByRole('button', { name: /Resubmit initial request/i })
        expect(resubmit).toBeDisabled()
    })

    it('enables Resubmit once a valid-length note is pasted and the proposal form is valid', async () => {
        const user = userEvent.setup()
        renderFooter()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.paste(wordsString(RESUBMIT_NOTE_MIN_WORDS))
        const resubmit = screen.getByRole('button', { name: /Resubmit initial request/i })
        expect(resubmit).toBeEnabled()
    })
})
