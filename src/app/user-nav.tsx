'use client'

import Link from 'next/link'
import { Button, LoadingOverlay, Title } from '@mantine/core'
import { useAuthInfo } from '@/components/auth'

export const UserNav = () => {
    const auth = useAuthInfo()

    if (!auth.isLoaded) {
        return <LoadingOverlay />
    }

    return (
        <div>
            <Title order={4}>
                You appear to be a {auth.role} and likely want to{' '}
                {auth.isResearcher && (
                    <>
                        <Link href="/researcher/studies" passHref>
                            <Button>View Studies</Button>
                        </Link>
                        <span> OR </span>
                        <Link href={`/researcher/study/request/openstax`} passHref>
                            <Button>Propose a Study</Button>
                        </Link>
                    </>
                )}
                {auth.isMember && (
                    <Link href={`/member/${auth.orgSlug}/studies/review`} passHref>
                        <Button>Review Studies</Button>
                    </Link>
                )}
                {auth.isAdmin && (
                    <Link href="/admin/members" passHref>
                        <Button>Administer Members</Button>
                    </Link>
                )}
            </Title>
        </div>
    )
}
