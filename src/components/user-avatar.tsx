'use client'

import { useUser } from '@clerk/nextjs'
import { Avatar, type AvatarProps } from '@mantine/core'
import { initialsFromNames } from '@/lib/string'

type Props = Pick<AvatarProps, 'size' | 'bg' | 'color'> & {
    user?: { firstName: string | null; lastName: string | null; imageUrl?: string }
}

// Initials go in as children: Avatar's `name` prop re-derives them and splits a character such as 𠮷.
export function UserAvatar({ user: providedUser, size, bg = 'purple.3', color = 'gray.1' }: Props) {
    const { user: currentUser } = useUser()
    const user = providedUser || currentUser
    if (!user) {
        return null
    }

    const initials = initialsFromNames(user.firstName, user.lastName)

    return (
        <Avatar src={user.imageUrl} size={size} bg={bg} color={color} alt="User profile">
            {initials}
        </Avatar>
    )
}
