import { AuthRole } from '@/lib/types'
import { useSession } from '../hooks/session'

type ProtectProps = {
    role: AuthRole
    orgSlug?: string
    children: React.ReactNode
}

export const Protect: React.FC<ProtectProps> = ({ role, children }) => {
    const { isLoaded, session } = useSession()

    if (!isLoaded || !session) return null

    if (role == AuthRole.Admin && session.team.isAdmin) return children
    if (role == AuthRole.Researcher && session.team.isResearcher) return children
    if (role == AuthRole.Reviewer && session.team.isReviewer) return children

    return null
}
