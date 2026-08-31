import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { StudyPageHeader } from '@/components/study/study-page-header'

describe('StudyPageHeader', () => {
    it('renders its children as a level-1 heading', () => {
        renderWithProviders(<StudyPageHeader>Study proposal</StudyPageHeader>)
        const heading = screen.getByRole('heading', { level: 1, name: 'Study proposal' })
        expect(heading).toBeDefined()
    })
})
