import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { IncompleteFieldsHint } from './incomplete-fields-hint'

describe('IncompleteFieldsHint', () => {
    it('renders nothing when nothing is missing', () => {
        renderWithProviders(<IncompleteFieldsHint missing={[]} />)
        expect(screen.queryByTestId('incomplete-fields-hint')).not.toBeInTheDocument()
    })

    it('names a single outstanding field', () => {
        renderWithProviders(<IncompleteFieldsHint missing={['Study title']} />)
        expect(screen.getByTestId('incomplete-fields-hint')).toHaveTextContent(
            'Study title is required before submitting.',
        )
    })

    it('joins several outstanding fields', () => {
        renderWithProviders(<IncompleteFieldsHint missing={['Study title', 'Impact', 'Principal Investigator']} />)
        expect(screen.getByTestId('incomplete-fields-hint')).toHaveTextContent(
            'Study title, Impact and Principal Investigator are required before submitting.',
        )
    })
})
