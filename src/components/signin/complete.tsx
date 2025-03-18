import { useUser } from '@clerk/nextjs'
import { Panel } from '../panel'
import { Flex, Title, Text } from '@mantine/core'
import { Link } from '../links'

export const SigninComplete = () => {
    const { user } = useUser()

    if (!user) return null

    return (
        <Panel title={user.twoFactorEnabled ? 'Signin Success' : 'Your account lacks MFA protection'}>
            {user.twoFactorEnabled ? (
                <Title order={4}>
                    You have successfully signed in. Visit the <Link href="/">homepage</Link> to get started.
                </Title>
            ) : (
                <Flex direction="column">
                    <Title order={3}>Your account lacks MFA protection</Title>
                    <Text>In order to use SafeInsights, you must have MFA enabled on your account</Text>
                    <Text>
                        Please Visit our <Link href="/account/mfa">MFA page</Link> in order to enable it.
                    </Text>
                </Flex>
            )}
        </Panel>
    )
}
