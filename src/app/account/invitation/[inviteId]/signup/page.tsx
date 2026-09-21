'use client'

import { useQuery } from '@/common'
import { LoadingMessage } from '@/components/loading'
import { useAuth } from '@clerk/nextjs'
import { FC, use } from 'react'
import { getOrgInfoForInviteAction } from '../create-account.action'
import { InvalidInvitePanel } from '../invalid-invite-panel'
import { SetupAccountForm } from './setup-account-form'

type InviteProps = {
    params: Promise<{ inviteId: string }>
}

const SignupAccountPanel: FC<InviteProps> = ({ params }) => {
    const { inviteId } = use(params)
    const { isLoaded: isLoadedAuth, isSignedIn } = useAuth()

    const {
        data,
        isLoading: isLoadingData,
        isError,
    } = useQuery({
        queryKey: ['orgInfoForInvite', inviteId],
        queryFn: () => getOrgInfoForInviteAction({ inviteId }),
    })

    // A claimed or deleted invite no longer resolves; data stays undefined after the query errors,
    // so without this the spinner never stops.
    if (isError) return <InvalidInvitePanel />

    if (!isLoadedAuth || isLoadingData || !data) return <LoadingMessage message="Loading" />

    return isSignedIn ? null : <SetupAccountForm inviteId={inviteId} orgName={data.name} {...data} />
}

export default SignupAccountPanel
