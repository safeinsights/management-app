import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { EditCodeResubmitProvider } from '@/contexts/edit-code-resubmit'
import { EditStudyCodeFooter } from './edit-study-code-footer'

vi.mock('next/navigation', async () => {
    const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation')
    return {
        ...actual,
        useParams: () => ({ orgSlug: 'lab-1' }),
        useRouter: () => ({ push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    }
})

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

const wordsString = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

const renderFooter = (opts: { initialNote?: string; mainFileName?: string; fileNames?: string[] } = {}) =>
    renderWithProviders(
        <EditCodeResubmitProvider studyId={STUDY_ID} initialNote={opts.initialNote ?? ''}>
            <EditStudyCodeFooter
                mainFileName={opts.mainFileName ?? ''}
                fileNames={opts.fileNames ?? []}
                hasFiles={(opts.fileNames ?? []).length > 0}
            />
        </EditCodeResubmitProvider>,
    )

describe('EditStudyCodeFooter', () => {
    it('disables Resubmit when there are no files', () => {
        renderFooter({ initialNote: wordsString(5) })
        const resubmit = screen.getByRole('button', { name: 'Resubmit' })
        expect(resubmit).toBeDisabled()
    })

    it('disables Resubmit when the note is empty even with files present', () => {
        renderFooter({ mainFileName: 'main.R', fileNames: ['main.R'] })
        const resubmit = screen.getByRole('button', { name: 'Resubmit' })
        expect(resubmit).toBeDisabled()
    })

    it('opens the confirmation modal when Resubmit is clicked with a valid note + files', async () => {
        const user = userEvent.setup()
        renderFooter({
            initialNote: wordsString(10),
            mainFileName: 'main.R',
            fileNames: ['main.R'],
        })
        await user.click(screen.getByRole('button', { name: 'Resubmit' }))
        expect(screen.getByText(/Are you sure you want to resubmit/i)).toBeInTheDocument()
    })
})
