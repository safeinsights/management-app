'use client'

import { useUser } from '@clerk/nextjs'
import { Avatar } from '@mantine/core'

export function UserAvatar() {
    const { user } = useUser()
    if (!user) {
        return null
    }
    return <Avatar src={user.imageUrl} alt="User profile" />
}
