import { AuthRole, getLabOrg, getEnclaveOrg, getAdminOrg } from '@/lib/types'
import { useSession } from '../hooks/session'

type ProtectProps = {
    role: AuthRole
    orgSlug?: string
    children: React.ReactNode
}

export const Protect: React.FC<ProtectProps> = ({ role, children }) => {
    const { isLoaded, session } = useSession()

    if (!isLoaded || !session) return null

    if (role == AuthRole.Admin && getAdminOrg(session)) return children
    if (role == AuthRole.Researcher && getLabOrg(session)) return children
    if (role == AuthRole.Reviewer && getEnclaveOrg(session)) return children

    return null
}
