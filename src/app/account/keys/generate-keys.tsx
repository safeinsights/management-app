'use client'

import { Button, Container, CopyButton, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { FC, useState } from 'react'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { setMemberUserPublicKey } from '@/server/actions/user-key-actions'
import { useUser } from '@clerk/nextjs'
import Link from 'next/link'

export const GenerateKeys: FC = () => {
    const user = useUser()
    const [keys, setKeys] = useState<{
        binaryPublicKey: ArrayBuffer
        privateKey: string
        fingerprint: string
    }>()

    const onGenerateKeys = async () => {
        const { privateKeyString, fingerprint, exportedPublicKey } = await generateKeyPair()

        const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyString}\n-----END PRIVATE KEY-----`

        setKeys({
            binaryPublicKey: exportedPublicKey,
            privateKey: privateKeyPem,
            fingerprint,
        })
    }

    const saveKeys = async () => {
        if (keys?.binaryPublicKey && keys.fingerprint) {
            await setMemberUserPublicKey(keys.binaryPublicKey, keys.fingerprint)
        }
    }

    if (keys) {
        return (
            <Container>
                <Stack>
                    <Stack>
                        <Title>Private key: </Title>
                        <ScrollArea>{keys.privateKey}</ScrollArea>
                        <CopyButton value={keys.privateKey}>
                            {({ copied, copy }) => (
                                <Button
                                    color={copied ? 'teal' : 'blue'}
                                    disabled={copied}
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

                    <Button component={Link} href="/dashboard">
                        Go To Dashboard
                    </Button>
                </Stack>
            </Container>
        )
    }

    return (
        <Container>
            <Stack>
                <Title>Create your Private Key</Title>
                <Text>Hello {user.user?.firstName}, welcome to SafeInsights!</Text>
                <Text>
                    You’ve been invited to join this team in the role of a Reviewer, giving you the permissions to
                    access and review research proposals and associated code.{' '}
                </Text>
                <Text>
                    For security reasons, this role requires you to have an encryption key linked to your account.
                </Text>
                <Text>To get started, click the button below to generate your private key.</Text>
            </Stack>
            <Button onClick={() => onGenerateKeys()}>Generate Keypair</Button>
        </Container>
    )
}
