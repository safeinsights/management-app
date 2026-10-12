import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { UserAvatar } from './user-avatar'

describe('UserAvatar', () => {
    it('shows the same initials as the account menu for a multi-word surname', () => {
        renderWithProviders(<UserAvatar user={{ firstName: 'Mary', lastName: 'Van Dyke' }} />)

        expect(screen.getByText('MV')).toBeInTheDocument()
    })

    it('keeps a name initial that spans two UTF-16 code units whole', () => {
        renderWithProviders(<UserAvatar user={{ firstName: '𠮷田', lastName: 'Lee' }} />)

        expect(screen.getByText('𠮷L')).toBeInTheDocument()
    })
})
