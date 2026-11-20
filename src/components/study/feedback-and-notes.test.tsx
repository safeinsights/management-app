import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { FeedbackAndNotesSection } from './feedback-and-notes'

const reviewerEntry = {
    id: 'reviewer-v1',
    entryType: 'REVIEWER-FEEDBACK',
    authorName: 'Dr. Reviewer',
    createdAt: new Date('2026-04-18T10:00:00Z'),
    version: 1,
    body: JSON.parse(lexicalJson('Reviewer feedback for the first round.')),
}

const noteEntry = {
    id: 'note-v2',
    entryType: 'RESUBMISSION-NOTE',
    authorName: 'Dr. Researcher',
    createdAt: new Date('2026-04-20T10:00:00Z'),
    version: 2,
    body: JSON.parse(lexicalJson('Addressed all the requested changes.')),
}

// happy-dom has no layout, so overflow must be forced for the View more/less toggle to render.
const forceOverflow = () => vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)

describe('FeedbackAndNotesSection', () => {
    it('expands the latest reviewer-feedback entry by default', () => {
        const spy = forceOverflow()
        try {
            renderWithProviders(<FeedbackAndNotesSection entries={[reviewerEntry, noteEntry]} />)

            expect(screen.getByTestId('feedback-toggle-reviewer-v1')).toHaveAttribute('aria-expanded', 'true')
            expect(screen.getByTestId('feedback-toggle-note-v2')).toHaveAttribute('aria-expanded', 'false')
        } finally {
            spy.mockRestore()
        }
    })

    it('leaves a latest resubmission note collapsed by default (proposal surfaces)', () => {
        const spy = forceOverflow()
        try {
            renderWithProviders(<FeedbackAndNotesSection entries={[noteEntry, reviewerEntry]} />)

            expect(screen.getByTestId('feedback-toggle-note-v2')).toHaveAttribute('aria-expanded', 'false')
        } finally {
            spy.mockRestore()
        }
    })

    it('expands a latest resubmission note when alwaysExpandLatest is set (code surfaces, OTTER-558)', () => {
        const spy = forceOverflow()
        try {
            renderWithProviders(<FeedbackAndNotesSection entries={[noteEntry, reviewerEntry]} alwaysExpandLatest />)

            expect(screen.getByTestId('feedback-toggle-note-v2')).toHaveAttribute('aria-expanded', 'true')
            expect(screen.getByTestId('feedback-toggle-reviewer-v1')).toHaveAttribute('aria-expanded', 'false')
        } finally {
            spy.mockRestore()
        }
    })

    it('toggles a collapsed prior entry open on click', async () => {
        const spy = forceOverflow()
        try {
            const user = userEvent.setup()
            renderWithProviders(<FeedbackAndNotesSection entries={[noteEntry, reviewerEntry]} alwaysExpandLatest />)

            const priorToggle = screen.getByTestId('feedback-toggle-reviewer-v1')
            expect(priorToggle).toHaveAttribute('aria-expanded', 'false')
            await user.click(priorToggle)
            expect(priorToggle).toHaveAttribute('aria-expanded', 'true')
        } finally {
            spy.mockRestore()
        }
    })

    it('clamps a collapsed entry at two lines and lifts the clamp when expanded (OTTER-957)', () => {
        renderWithProviders(<FeedbackAndNotesSection entries={[reviewerEntry, noteEntry]} />)

        expect(screen.getByTestId('feedback-body-note-v2').style.getPropertyValue('--text-line-clamp')).toBe('2')
        expect(screen.getByTestId('feedback-body-reviewer-v1').style.getPropertyValue('--text-line-clamp')).toBe('')
    })

    it('renders nothing when there are no entries', () => {
        const { container } = renderWithProviders(<FeedbackAndNotesSection entries={[]} />)
        expect(container.querySelector('[data-testid="feedback-and-notes-section"]')).toBeNull()
    })

    describe('compact', () => {
        const fourEntries = [
            { ...noteEntry, id: 'note-v3', version: 3 },
            { ...reviewerEntry, id: 'reviewer-v2', version: 2 },
            noteEntry,
            reviewerEntry,
        ]

        it('shows only the latest 2 entries with a toggle for the earlier ones', () => {
            renderWithProviders(<FeedbackAndNotesSection entries={fourEntries} compact />)

            expect(screen.getByTestId('feedback-entry-note-v3')).toBeInTheDocument()
            expect(screen.getByTestId('feedback-entry-reviewer-v2')).toBeInTheDocument()
            expect(screen.queryByTestId('feedback-entry-note-v2')).not.toBeInTheDocument()
            expect(screen.queryByTestId('feedback-entry-reviewer-v1')).not.toBeInTheDocument()
            expect(screen.getByTestId('feedback-show-all')).toHaveTextContent('View all notes and feedback')
        })

        it('has no toggle with only 2 entries', () => {
            renderWithProviders(<FeedbackAndNotesSection entries={[noteEntry, reviewerEntry]} compact />)

            expect(screen.queryByTestId('feedback-show-all')).not.toBeInTheDocument()
        })

        it('reveals the earlier entries and focuses the third, then hides them and focuses the toggle', async () => {
            const user = userEvent.setup()
            renderWithProviders(<FeedbackAndNotesSection entries={fourEntries} compact />)

            await user.click(screen.getByTestId('feedback-show-all'))

            expect(screen.getByTestId('feedback-entry-note-v2')).toHaveFocus()
            expect(screen.getByTestId('feedback-entry-reviewer-v1')).toBeInTheDocument()
            expect(screen.getByTestId('feedback-show-all')).toHaveTextContent('Hide earlier notes and feedback')

            await user.click(screen.getByTestId('feedback-show-all'))

            expect(screen.queryByTestId('feedback-entry-note-v2')).not.toBeInTheDocument()
            expect(screen.getByTestId('feedback-show-all')).toHaveFocus()
            expect(screen.getByTestId('feedback-show-all')).toHaveTextContent('View all notes and feedback')
        })

        it('announces how many entries show after each toggle', async () => {
            const user = userEvent.setup()
            renderWithProviders(<FeedbackAndNotesSection entries={fourEntries} compact />)

            await user.click(screen.getByTestId('feedback-show-all'))
            expect(screen.getByRole('status')).toHaveTextContent('Showing all 4 notes and feedback')

            await user.click(screen.getByTestId('feedback-show-all'))
            expect(screen.getByRole('status')).toHaveTextContent('Showing 2 of 4 notes and feedback')
        })

        it('clamps collapsed entries to 2 lines', () => {
            renderWithProviders(<FeedbackAndNotesSection entries={fourEntries} compact />)

            const body = screen.getByTestId('feedback-body-note-v3')
            expect(body.style.getPropertyValue('--text-line-clamp')).toBe('2')
        })

        it('starts collapsed even when the newest entry is reviewer feedback', () => {
            renderWithProviders(<FeedbackAndNotesSection entries={[reviewerEntry, noteEntry]} compact />)

            const body = screen.getByTestId('feedback-body-reviewer-v1')
            expect(body.style.getPropertyValue('--text-line-clamp')).toBe('2')
        })
    })
})
