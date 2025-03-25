'use server'

import React, { ReactNode } from 'react'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getMemberUserPublicKeyByClerkId } from '@/server/db/queries'

export default async function MemberLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
        redirect('/')
    }

    const publicKey = await getMemberUserPublicKeyByClerkId(clerkUserId)
    if (!publicKey) {
        redirect('/account/keys')
    }

    return <>{children}</>
}
