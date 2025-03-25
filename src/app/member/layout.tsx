'use server'

import React, { ReactNode } from 'react'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getMemberUserPublicKey } from '@/server/db/queries'

export default async function MemberLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    const { sessionClaims } = await auth()

    if (!sessionClaims?.userId) return null

    const publicKey = await getMemberUserPublicKey(sessionClaims.userId)

    if (!publicKey) {
        redirect('/account/keys')
    }

    return <>{children}</>
}
