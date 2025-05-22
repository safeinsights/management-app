'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getReviewerPublicKeyAction } from '@/server/actions/org.actions'
import { UserLayout } from '@/components/layout/user-layout'

type Props = { children: ReactNode }

export default function ReviewerLayout({ children }: Props) {
    const pathname = usePathname()
    const router = useRouter()
    const [loading, setLoading] = useState(!pathname.startsWith('/account'))

    useEffect(() => {
        if (pathname.startsWith('/account')) {
            setLoading(false)
            return
        }

        const checkKey = async () => {
            try {
                const key = await getReviewerPublicKeyAction()

                if (!key) {
                    router.push('/account/keys')
                } else {
                    setLoading(false)
                }
            } catch (error) {
                console.error('Error checking reviewer key:', error)
            }
        }

        checkKey()
    }, [pathname, router])

    return <UserLayout showOverlay={loading}>{children}</UserLayout>
}
