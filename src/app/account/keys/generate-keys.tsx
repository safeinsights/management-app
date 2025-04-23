'use client'

import { Button, Container, CopyButton, Group, Modal, Paper, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { FC, useState } from 'react'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { setMemberUserPublicKeyAction } from '@/server/actions/user-keys.actions'
import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { useDisclosure } from '@mantine/hooks'

export const GenerateKeys: FC = () => {
    const { user } = useUser()
    const [keys, setKeys] = useState<{
        binaryPublicKey: ArrayBuffer
        privateKey: string
        fingerprint: string
    }>()
    const [opened, { open, close }] = useDisclosure(false)

    const onGenerateKeys = async () => {
        const { privateKeyString, fingerprint, exportedPublicKey } = await generateKeyPair()
        const privateKeyLines = (privateKeyString.match(/.{1,64}/g) || []).join('\n')

        const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyLines}\n-----END PRIVATE KEY-----`

        setKeys({
            binaryPublicKey: exportedPublicKey,
            privateKey: privateKeyPem,
            fingerprint,
        })

        await setMemberUserPublicKeyAction({ publicKey: exportedPublicKey, fingerprint: fingerprint })
    }

    if (keys) {
        return (
            <Container>
                <Paper shadow="xs" p="xl">
                    <Modal opened={opened} onClose={close} centered title="Important disclaimer">
                        <Stack gap="xl">
                            <Text>
                                SafeInsights does not store private keys. Lost keys cannot be recovered. Please store
                                your key before proceeding.
                            </Text>
                            <Group justify="flex-end">
                                <Button variant="outline" onClick={close}>
                                    Take me back
                                </Button>
                                <Button component={Link} href="/">
                                    Proceed
                                </Button>
                            </Group>
                        </Stack>
                    </Modal>
                    <Stack>
                        <Stack gap="xl">
                            <Title>Private key</Title>
                            <ScrollArea>{keys.privateKey}</ScrollArea>

                            <Group>
                                <CopyButton value={keys.privateKey}>
                                    {({ copied, copy }) => (
                                        <Button
                                            disabled={copied}
                                            onClick={() => {
                                                copy()
                                            }}
                                        >
                                            {copied ? 'Copied private key!' : 'Copy private key'}
                                        </Button>
                                    )}
                                </CopyButton>
                            </Group>
                            <Text>
                                This Private Key is unique to you. Please store your private key securely, such as in
                                your password manager.{' '}
                                <Text fw="bold" component="span">
                                    It is important to note that SafeInsights does not store your private key.
                                </Text>{' '}
                                If lost, you cannot access encrypted results and will need to generate a new Private
                                Key.
                            </Text>
                        </Stack>

                        <Group>
                            <Button onClick={open}>Go To Dashboard</Button>
                        </Group>
                    </Stack>
                </Paper>
            </Container>
        )
    }

    return (
        <Container>
            <Paper shadow="xs" p="xl">
                <Stack gap="xl">
                    <Title>Create your Private Key</Title>
                    <Stack>
                        <Text>Hello {user?.fullName}, welcome to SafeInsights!</Text>
                        <Text>
                            You’ve been invited to join this team in the role of a Reviewer, allowing you to access and
                            review research proposals, associated code, and data outputs.
                        </Text>
                        <Text>
                            For security reasons, this role requires you to create a private key that’s unique to you.
                            You will use this private key to access encrypted results.
                        </Text>
                        <Text>To get started, click the button below to generate your private key.</Text>
                    </Stack>
                    <Group>
                        <Button onClick={() => onGenerateKeys()}>Create Private Key</Button>
                    </Group>
                </Stack>
            </Paper>
        </Container>
    )
}
