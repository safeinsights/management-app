'use client'

import { useUser } from '@clerk/nextjs'
import { Avatar } from '@mantine/core'

export function UserAvatar({ user: providedUser }: { user?: { fullName: string; imageUrl?: string } }) {
    const { user: currentUser } = useUser()
    const user = providedUser || currentUser
    if (!user) {
        return null
    }

    return (
        <Avatar src={user.imageUrl} bg="purple.3" color="gray.1" name={user.fullName || undefined} alt="User profile" />
    )
}
