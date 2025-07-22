import { Paper, Title } from '@mantine/core'

export default async function InviteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <Paper bg="white" p="xxl" radius="sm" w={600} my={{ base: '1rem', lg: 0 }}>
            <Title mb="md" ta="center" order={3}>
                Welcome to SafeInsights!
            </Title>
            {children}
        </Paper>
    )
}
