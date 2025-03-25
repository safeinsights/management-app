import { useParams } from 'next/navigation'

export function useMemberIdentifier() {
    const { memberIdentifier } = useParams<{ memberIdentifier: string }>()
    return memberIdentifier
}
