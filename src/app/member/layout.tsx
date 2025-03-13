import React, { ReactNode } from 'react'
import { getMemberUserPublicKey } from '@/server/actions/user-actions'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function MemberLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    const { userId: clerkId } = await auth()

    if (!clerkId) return null

    const publicKey = await getMemberUserPublicKey(clerkId)

    if (!publicKey) {
        redirect('/account/keys')
    }

    return <>{children}</>
}
