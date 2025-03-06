'use client'

import { Container, Button, Stack, Text } from '@mantine/core'
import { useUserContext } from '@clerk/shared/react'

export default function Keys() {
    const user = useUserContext()

    return (
        <Container>
            <Stack>
                <Text>Create your Private Key</Text>
                <Text>Hello {user?.firstName}, welcome to SafeInsights!</Text>
                <Text>
                    You’ve been invited to join this team in the role of a Reviewer, giving you the permissions to
                    access and review research proposals and associated code.{' '}
                </Text>
                <Text>
                    For security reasons, this role requires you to have an encryption key linked to your account.
                </Text>
                <Text>To get started, click the button below to generate your private key.</Text>
            </Stack>
            <Button onClick={() => {}}>Create Private Key</Button>
        </Container>
    )
}
