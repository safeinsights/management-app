import { Panel } from '@/components/panel'
import { Button, Flex, Loader, Text, TextInput } from '@mantine/core'
import { isNotEmpty, useForm } from '@mantine/form'
import { useSignIn, useUser } from '@clerk/nextjs'
import { useMutation } from '@tanstack/react-query'
import type { SignInResource } from '@clerk/types'
import type { MFAState } from './logic'
import { errorToString } from '@/lib/errors'
import { useRouter, useSearchParams } from 'next/navigation'
import { onUserSignInAction } from '@/server/actions/user.actions'

export const RequestMFA: React.FC<{ mfa: MFAState; onReset: () => void }> = ({ mfa, onReset }) => {
    const { isLoaded, setActive } = useSignIn()
    const router = useRouter()
    const { isSignedIn } = useUser()
    const searchParams = useSearchParams()
    const inviteId = searchParams.get('inviteId')

    const form = useForm({
        initialValues: {
            code: '',
        },

        validate: {
            code: isNotEmpty('Required'),
        },
    })

    const { isPending, mutate: onMFASubmit } = useMutation({
        async mutationFn(form: { code: string }) {
            if (!isLoaded || !mfa) return

            return await mfa.signIn.attemptSecondFactor({
                strategy: mfa.usingSMS ? 'phone_code' : 'totp',
                code: form.code,
            })
        },
        onError(error: unknown) {
            form.setErrors({
                code: errorToString(error),
            })
        },
        async onSuccess(signInAttempt?: SignInResource) {
            if (signInAttempt?.status === 'complete' && setActive) {
                await setActive({ session: signInAttempt.createdSessionId })
                await onUserSignInAction()
                if (inviteId) {
                    router.push(`/account/invitation/${inviteId}`)
                } else {
                    router.push('/')
                }
            } else {
                // clerk did not throw an error but also did not return a signIn object
                form.setErrors({
                    code: `Unknown signIn status: ${signInAttempt?.status || 'unknown'}`,
                })
            }
        },
    })

    if (isSignedIn) return null
    if (!mfa) return null
    if (!isLoaded) return <Loader />

    return (
        <Panel title="Enter MFA Code">
            <Text>Enter the code from {mfa.usingSMS ? 'the text message we sent' : 'your app'}</Text>
            <form onSubmit={form.onSubmit((values) => onMFASubmit(values))}>
                <TextInput
                    withAsterisk
                    label="MFA Code"
                    placeholder="123456"
                    key={form.key('code')}
                    {...form.getInputProps('code')}
                />
                <Flex justify="space-between" mt="md">
                    <Button variant="light" onClick={onReset}>
                        ReEnter Email/Password
                    </Button>
                    <Button type="submit" loading={isPending}>
                        Login
                    </Button>
                </Flex>
            </form>
        </Panel>
    )
}
