import { AuthRole, isLabOrg, isEnclaveOrg } from '@/lib/types'
import { useSession } from '../hooks/session'

type ProtectProps = {
    role: AuthRole
    orgSlug?: string
    children: React.ReactNode
}

export const Protect: React.FC<ProtectProps> = ({ role, children }) => {
    const { isLoaded, session } = useSession()

    if (!isLoaded || !session) return null

    if (role == AuthRole.Admin && session.org.isAdmin) return children
    if (role == AuthRole.Researcher && isLabOrg(session.org)) return children
    if (role == AuthRole.Reviewer && isEnclaveOrg(session.org)) return children

    return null
}
