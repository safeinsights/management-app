import { Panel } from '../panel'
import { Flex, Text, Button, TextInput } from '@mantine/core'
import { isNotEmpty, useForm } from '@mantine/form'
import { useSignIn } from '@clerk/nextjs'

import type { MFAState } from './logic'

export const RequestMFA: React.FC<{ mfa: MFAState; onReset: () => void }> = ({ mfa, onReset }) => {
    const { isLoaded, setActive } = useSignIn()

    const form = useForm({
        initialValues: {
            code: '',
        },

        validate: {
            code: isNotEmpty('Required'),
        },
    })

    if (!mfa || !isLoaded) return null

    const onMFASubmit = form.onSubmit(async (values) => {
        const signInAttempt = await mfa.signIn.attemptSecondFactor({
            strategy: mfa.usingSMS ? 'phone_code' : 'totp',
            code: values.code,
        })

        if (signInAttempt.status === 'complete') {
            await setActive({ session: signInAttempt.createdSessionId })
            onReset()
        } else {
            reportError(`Unknown signIn status: ${signInAttempt.status}`)
        }
    })

    return (
        <Panel title="Enter MFA Code">
            <Text>Enter the code from {mfa.usingSMS ? 'the text message we sent' : 'your app'}</Text>
            <form onSubmit={onMFASubmit}>
                <TextInput
                    withAsterisk
                    label="Code"
                    placeholder="123456"
                    key={form.key('code')}
                    {...form.getInputProps('code')}
                />
                <Flex justify="space-between" mt="md">
                    <Button variant="light" onClick={onReset}>
                        ReEnter Email/Password
                    </Button>
                    <Button type="submit">Login</Button>
                </Flex>
            </form>
        </Panel>
    )
}
