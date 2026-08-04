import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { FormFieldLabel } from './form-field-label'

// OTTER-647: the default branch passed `fw="semibold"`, which is not a valid CSS font-weight
// keyword, so it was dropped and the label fell back to the h5 default of 500. Fields already
// moved to `FormField` (labelProps fw 600) then sat beside these at a different weight.
describe('FormFieldLabel', () => {
    it('renders at the same weight FormField uses', () => {
        renderWithProviders(<FormFieldLabel label="Researcher" required inputId="researcher" />)

        expect(screen.getByRole('heading', { level: 5 })).toHaveStyle({ fontWeight: '600' })
    })

    it('keeps the lighter weight for the optional variant', () => {
        renderWithProviders(<FormFieldLabel label="Nickname" variant="optional" inputId="nickname" />)

        expect(screen.getByRole('heading', { level: 5 })).toHaveStyle({ fontWeight: '550' })
    })
})
