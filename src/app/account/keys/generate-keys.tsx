'use client'

import { Button, Container, CopyButton, Stack, Text, Title } from '@mantine/core'
import { useUserContext } from '@clerk/shared/react'
import { FC, useState } from 'react'
import { setMemberUserPublicKey } from '@/app/account/keys/user-key-actions'
import { generateKeyPair } from 'si-encryption/util/keypair'

export const GenerateKeys: FC<{
    clerkId: string
}> = ({ clerkId }) => {
    const user = useUserContext()
    const [keys, setKeys] = useState<{ publicKey: string; privateKey: string; fingerprint: string }>()

    const onGenerateKeys = async () => {
        const { publicKeyString, privateKeyString, fingerprint } = await generateKeyPair()

        setKeys({
            publicKey: publicKeyString,
            privateKey: privateKeyString,
            fingerprint,
        })
    }

    const saveKeys = async () => {
        if (keys?.publicKey && keys.fingerprint) {
            await setMemberUserPublicKey(clerkId, keys.publicKey, keys.fingerprint)
        }
    }

    if (keys) {
        return (
            <Container>
                <Stack>
                    <Stack>
                        <Title>Public key: </Title>
                        <Text>{keys.publicKey}</Text>
                        <CopyButton value={keys.publicKey}>
                            {({ copied, copy }) => (
                                <Button color={copied ? 'teal' : 'blue'} onClick={copy}>
                                    {copied ? 'Copied public key!' : 'Copy public key'}
                                </Button>
                            )}
                        </CopyButton>
                    </Stack>

                    <Stack>
                        <Title>Private key: </Title>
                        <Text>{keys.privateKey}</Text>
                        <CopyButton value={keys.privateKey}>
                            {({ copied, copy }) => (
                                <Button
                                    color={copied ? 'teal' : 'blue'}
                                    onClick={() => {
                                        copy()
                                        saveKeys()
                                    }}
                                >
                                    {copied ? 'Copied private key!' : 'Copy private key'}
                                </Button>
                            )}
                        </CopyButton>
                        <Text>
                            Please make sure to securely store this private key in your password manager software, as
                            you will need it at a later stage to review data outputs.
                        </Text>
                        <Text>
                            Important disclaimer: SafeInsights does not store private keys. If you lose this key, we
                            won’t be able to recover it for you.
                        </Text>
                    </Stack>
                </Stack>
            </Container>
        )
    }

    return (
        <Container>
            <Stack>
                <Title>Create your Private Key</Title>
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
            <Button onClick={() => onGenerateKeys()}>Create Private Key</Button>
        </Container>
    )
}
