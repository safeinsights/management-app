import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import { FileViewer } from './index'

describe('csvViewer', () => {
    it('renders headers and cells', () => {
        renderWithProviders(<FileViewer path="results.csv" text={'a,b\n1,2\n'} />)

        expect(screen.getByRole('columnheader', { name: 'a' })).toBeInTheDocument()
        expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument()
    })

    // A fixed table height stretched a single row down the whole viewer.
    it('caps the viewer height rather than fixing it', () => {
        const { container } = renderWithProviders(<FileViewer path="summary.csv" text={'metric,value\ntotal,5\n'} />)

        const wrapper = container.querySelector('[style*="max-height"]')
        expect(wrapper).toBeInTheDocument()
        expect(wrapper).toHaveStyle({ maxHeight: '500px' })
        expect(wrapper).not.toHaveStyle({ height: '500px' })
    })

    it('keeps wide values on a single line so columns stay aligned', () => {
        renderWithProviders(<FileViewer path="wide.csv" text={'when\n2023-01-09 14:05:21.267016\n'} />)

        expect(screen.getByRole('cell', { name: '2023-01-09 14:05:21.267016' })).toHaveStyle({ whiteSpace: 'nowrap' })
    })
})
