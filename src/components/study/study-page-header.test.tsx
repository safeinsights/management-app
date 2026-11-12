import { describe, expect, it, renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { StudyPageHeader } from '@/components/study/study-page-header'

const study = {
    title: 'Impact of highlighting on student learning outcomes',
    submittingLabName: 'Genius Lab',
    isTestStudy: false,
}

describe('StudyPageHeader', () => {
    it('renders the study title as the level-1 heading', () => {
        renderWithProviders(<StudyPageHeader study={study} />)

        expect(screen.getByRole('heading', { level: 1, name: study.title })).toBeInTheDocument()
    })

    it('names the current step in the level-1 heading', () => {
        renderWithProviders(<StudyPageHeader study={study} step={{ label: 'Step 3', heading: 'Submit code' }} />)

        expect(
            screen.getByRole('heading', { level: 1, name: `${study.title} — Step 3: Submit code` }),
        ).toBeInTheDocument()
    })

    it('renders the submitting research lab as the eyebrow', () => {
        renderWithProviders(<StudyPageHeader study={study} />)

        expect(screen.getByText('Genius Lab')).toBeInTheDocument()
    })

    it('marks a test study under the title without adding the badge to the heading', () => {
        renderWithProviders(<StudyPageHeader study={{ ...study, isTestStudy: true }} />)

        expect(screen.getByText('Test study')).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1, name: study.title })).toBeInTheDocument()
    })

    it('explains a test study when its badge is hovered', async () => {
        renderWithProviders(<StudyPageHeader study={{ ...study, isTestStudy: true }} />)

        await userEvent.hover(screen.getByText('Test study'))

        expect(
            await screen.findByText('This is a test study. It does not require a Study Agreement.'),
        ).toBeInTheDocument()
    })

    it('says nothing for an ordinary study', () => {
        renderWithProviders(<StudyPageHeader study={study} />)

        expect(screen.queryByText('Test study')).toBeNull()
    })

    // Role independence cannot be shown here: this reads only the study it is handed. The two
    // personas are driven through their real routes in study-header-personas.test.tsx.

    it('names an untitled study rather than rendering an empty heading', () => {
        renderWithProviders(<StudyPageHeader study={{ ...study, title: null }} />)

        expect(screen.getByRole('heading', { level: 1, name: 'Untitled study' })).toBeInTheDocument()
    })
})
