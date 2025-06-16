'use client'

import { useUser } from '@clerk/nextjs'
import { Avatar } from '@mantine/core'

export function UserAvatar({ user: providedUser }: { user?: { fullName: string; imageUrl?: string } }) {
    const { user: currentUser } = useUser()
    const user = providedUser || currentUser
    if (!user) {
        return null
    }

    function getInitials(user: string) {
        const words = user.trim().split(/\s+/)
        if (words.length === 0) return ''
        if (words.length === 1) return words[0][0].toUpperCase()
        return (words[0][0] + words[words.length - 1][0]).toUpperCase()
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
