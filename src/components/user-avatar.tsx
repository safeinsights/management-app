import { Avatar } from '@mantine/core'

export const UserInitialsAvatar: React.FC<{ name: string }> = ({ name }) => (
    <Avatar bg="purple.2" color="gray.2" radius="xl">
        {name
            .split(' ')
            .slice(0, 2)
            .map((name) => name[0] || '')
            .join('')}
    </Avatar>
)
