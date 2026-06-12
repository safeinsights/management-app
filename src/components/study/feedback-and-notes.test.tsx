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

// Entries arrive newest-first from getCodeReviewFeedbackAction.
// happy-dom has no layout, so force overflow to make the View more/less toggle render.
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

    it('renders nothing when there are no entries', () => {
        const { container } = renderWithProviders(<FeedbackAndNotesSection entries={[]} />)
        expect(container.querySelector('[data-testid="feedback-and-notes-section"]')).toBeNull()
    })
})
