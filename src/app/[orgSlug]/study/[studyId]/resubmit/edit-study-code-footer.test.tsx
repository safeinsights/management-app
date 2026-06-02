import { useParams } from 'next/navigation'
import { type Mock, describe, expect, it } from 'vitest'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { EditCodeResubmitProvider } from '@/contexts/edit-code-resubmit'
import { EditStudyCodeFooter } from './edit-study-code-footer'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

const wordsString = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

const renderFooter = (
    opts: { initialNote?: string; mainFileName?: string; fileNames?: string[]; filesChanged?: boolean } = {},
) => {
    ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
    return renderWithProviders(
        <EditCodeResubmitProvider studyId={STUDY_ID} initialNote={opts.initialNote ?? ''}>
            <EditStudyCodeFooter
                mainFileName={opts.mainFileName ?? ''}
                fileNames={opts.fileNames ?? []}
                hasFiles={(opts.fileNames ?? []).length > 0}
                filesChanged={opts.filesChanged ?? false}
            />
        </EditCodeResubmitProvider>,
    )
}

describe('EditStudyCodeFooter', () => {
    it('disables Resubmit when there are no files', () => {
        renderFooter({ initialNote: wordsString(5) })
        expect(screen.getByRole('button', { name: 'Resubmit study code' })).toBeDisabled()
    })

    it('disables Resubmit when the note is empty even with files present', () => {
        renderFooter({ mainFileName: 'main.R', fileNames: ['main.R'] })
        expect(screen.getByRole('button', { name: 'Resubmit study code' })).toBeDisabled()
    })

    it('opens the confirmation modal when Resubmit is clicked with a valid note + files', async () => {
        const user = userEvent.setup()
        renderFooter({
            initialNote: wordsString(10),
            mainFileName: 'main.R',
            fileNames: ['main.R'],
        })
        await user.click(screen.getByRole('button', { name: 'Resubmit study code' }))
        expect(screen.getByText(/Are you sure you want to resubmit/i)).toBeInTheDocument()
    })

    it('shows Cancel (not Save and exit) when no changes have been made', () => {
        renderFooter()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Save and exit' })).not.toBeInTheDocument()
    })

    it('shows Save and exit (not Cancel) when the note has content', () => {
        renderFooter({ initialNote: wordsString(3) })
        expect(screen.getByRole('button', { name: 'Save and exit' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    it('shows Save and exit when files have changed even with an empty note', () => {
        renderFooter({ mainFileName: 'main.R', fileNames: ['main.R'], filesChanged: true })
        expect(screen.getByRole('button', { name: 'Save and exit' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })
})
