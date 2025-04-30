'use client'

import { useUser } from '@clerk/nextjs'
import { Avatar } from '@mantine/core'

export function UserProfileImage() {
    const { user } = useUser()
    if (!user) {
        return null
    }
    return <Avatar src={user.profileImageUrl} alt="User profile" />
}
