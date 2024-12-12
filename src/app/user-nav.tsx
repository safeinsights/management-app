'use client'

import { Title } from '@mantine/core'
import { useAuthInfo } from '@/components/auth'
import { ButtonNav } from '@/components/button'

export const UserNav = () => {
    const auth = useAuthInfo()

    return (
        <div>
            <Title order={4}>
                You appear to be a {auth.role} and likely want to{' '}
                {auth.isResearcher && (
                    <>
                        <ButtonNav href="/researcher/studies">
                            View Studies
                        </ButtonNav>
                        <span> OR </span>
                        <ButtonNav href="/researcher/study/request/openstax">
                            Propose a Study
                        </ButtonNav>
                    </>
                )}
                {auth.isMember && (
                    <ButtonNav href="/member/openstax/studies/review">
                        Review Studies
                    </ButtonNav>
                )}
                {auth.isAdmin && (
                    <ButtonNav href="/admin/members">
                        Administer Members
                    </ButtonNav>
                )}
            </Title>
        </div>
    )
}
