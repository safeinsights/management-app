'use client'

import { useUser } from '@clerk/nextjs'
import { Avatar, type AvatarProps } from '@mantine/core'
import { getInitials } from '@/lib/string'

type Props = Pick<AvatarProps, 'size' | 'bg' | 'color'> & {
    user?: { fullName: string; imageUrl?: string }
}

export function UserAvatar({ user: providedUser, size, bg = 'purple.3', color = 'gray.1' }: Props) {
    const { user: currentUser } = useUser()
    const user = providedUser || currentUser
    if (!user) {
        return null
    }

    return (
        <Avatar
            src={user.imageUrl}
            size={size}
            bg={bg}
            color={color}
            key={user.fullName}
            name={user.fullName ? getInitials(user.fullName) : ''}
            alt="User profile"
        />
    )
}
