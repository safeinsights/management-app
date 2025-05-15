'use client'

import {
    Button,
    Container,
    Divider,
    Group,
    Paper,
    Stack,
    Text,
    Title,
    Code,
    useMantineTheme,
    CopyButton,
    Flex,
} from '@mantine/core'
import { FC, useEffect, useState } from 'react'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from '@/components/modal'
import Link from 'next/link'
import { Check } from '@phosphor-icons/react/dist/ssr'

export const GenerateKeys: FC = () => {
    const theme = useMantineTheme()
    const [keys, setKeys] = useState<{
        binaryPublicKey: ArrayBuffer
        privateKey: string
        fingerprint: string
    }>()
    const [confirmationOpened, { open: openConfirmKeyCopied, close: closeConfirmKeyCopied }] = useDisclosure(false)
    const [isKeyCopied, setIsKeyCopied] = useState(false)

    const onGenerateKeys = async () => {
        const { privateKeyString, fingerprint, exportedPublicKey } = await generateKeyPair()
        const privateKeyLines = (privateKeyString.match(/.{1,112}/g) || []).join('\n')

        const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyLines}\n-----END PRIVATE KEY-----`

        setKeys({
            binaryPublicKey: exportedPublicKey,
            privateKey: privateKeyPem,
            fingerprint,
        })

        // await setReviewerPublicKeyAction({ publicKey: exportedPublicKey, fingerprint: fingerprint })
    }

    useEffect(() => {
        onGenerateKeys()
    }, [])

    if (keys) {
        return (
            <Container>
                <Paper shadow="xs" p="xl">
                    <Stack gap="lg">
                        <Title size="xl">Store reviewer key</Title>
                        <Divider c="charcoal.1" />
                        <Stack>
                            <Text size="md">
                                For security reasons, this role requires you to create a reviewer key that is unique to
                                you. You will use this reviewer key to access encrypted results. Please copy and store
                                this key in a safe location.
                            </Text>
                            <Text size="sm" fw={600}>
                                Copy and store your reviewer key
                            </Text>
                            <Code
                                block
                                style={{
                                    maxHeight: 120,
                                    border: `1px solid ${theme.colors?.charcoal[1]} `,
                                }}
                            >
                                {keys.privateKey}
                            </Code>
                            <Text size="sm">
                                Note: Please store your reviewer key securely, such as in your password manager
                            </Text>
                        </Stack>
                        <Group>
                            <Group>
                                <CopyButton value={keys.privateKey}>
                                    {({ copied, copy }) => (
                                        <Button
                                            disabled={copied}
                                            onClick={() => {
                                                copy()
                                                setIsKeyCopied(true)
                                            }}
                                        >
                                            Copy key
                                        </Button>
                                    )}
                                </CopyButton>
                            </Group>
                            <Group>
                                <Button variant="outline" onClick={() => openConfirmKeyCopied()}>
                                    Go to dashboard
                                </Button>
                            </Group>
                        </Group>
                        {isKeyCopied && (
                            <Flex gap="xs">
                                <Check size={16} color={theme.colors.green[9]} />
                                <Text c="green.9" size="xs" fw={500}>
                                    Copied!
                                </Text>
                            </Flex>
                        )}
                    </Stack>
                </Paper>
                <ConfirmationModal onClose={closeConfirmKeyCopied} isOpen={confirmationOpened} />
            </Container>
        )
    }
}

const ConfirmationModal: FC<{ onClose: () => void; isOpen: boolean }> = ({ onClose, isOpen }) => {
    return (
        <AppModal isOpen={isOpen} onClose={onClose} title="Have you stored your reviewer key?" size="lg">
            <Stack>
                <Text size="md">Make sure you have securely saved your reviewer key. </Text>
                <Text size="sm" c="red.9">
                    <b>Note:</b> SafeInsights does not store your reviewer key. If you lose your key, you won&apos;t be
                    able to access study results and will need to generate a new key.
                </Text>
                <Text size="md">Do you want to proceed?</Text>
                <Group>
                    <Button variant="outline" onClick={onClose}>
                        Take me back
                    </Button>
                    <Button component={Link} href="/">
                        Yes, go to dashboard
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
