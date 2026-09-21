import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { StudyPageHeader } from '@/components/study/study-page-header'

const study = {
    title: 'Impact of highlighting on student learning outcomes',
    submittingLabName: 'Genius Lab',
    submittedByOrgSlug: 'genius',
    isTestStudy: false,
}

describe('StudyPageHeader', () => {
    it('renders the study title as the level-1 heading', () => {
        renderWithProviders(<StudyPageHeader study={study} />)

        expect(screen.getByRole('heading', { level: 1, name: study.title })).toBeInTheDocument()
    })

    it('renders the submitting research lab as the eyebrow', () => {
        renderWithProviders(<StudyPageHeader study={study} />)

        expect(screen.getByText('Genius')).toBeInTheDocument()
    })

    it('falls back to the submitting org slug when the lab name is missing', () => {
        renderWithProviders(<StudyPageHeader study={{ ...study, submittingLabName: null }} />)

        expect(screen.getByText('genius')).toBeInTheDocument()
    })

    it('marks a test study beside the title', () => {
        renderWithProviders(<StudyPageHeader study={{ ...study, isTestStudy: true }} />)

        expect(screen.getByText('Test study')).toBeInTheDocument()
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
