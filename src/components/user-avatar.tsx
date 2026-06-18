'use client'

import { useUser } from '@clerk/nextjs'
import { Avatar } from '@mantine/core'
import { getInitials } from '@/lib/string'

export function UserAvatar({ user: providedUser }: { user?: { fullName: string; imageUrl?: string } }) {
    const { user: currentUser } = useUser()
    const user = providedUser || currentUser
    if (!user) {
        return null
    }

    return (
        <Avatar
            src={user.imageUrl}
            bg="purple.3"
            color="gray.1"
            key={user.fullName}
            name={user.fullName ? getInitials(user.fullName) : ''}
            alt="User profile"
        />
    )
}
