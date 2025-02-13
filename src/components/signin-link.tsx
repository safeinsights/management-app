'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const PATHNAME = '/account/signin'

export const SigninLink = () => {
    const pathname = usePathname()

    if (pathname == PATHNAME) {
        return null
    }

    return <Link href={PATHNAME}>Sign in</Link>
}
