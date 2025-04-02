'use client'

import { Text } from '@mantine/core'

import { useUser } from '@clerk/nextjs'

export function UserName() {
    const { user } = useUser()
    if (!user) {
        return null
    }
    return <span>{user.fullName}</span>
}
