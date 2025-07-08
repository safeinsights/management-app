'use client'

import {
    Button,
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
import { useMutation } from '@tanstack/react-query'
import { FC, useEffect, useState } from 'react'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from '@/components/modal'
import { CheckIcon } from '@phosphor-icons/react/dist/ssr'
import { setReviewerPublicKeyAction, updateReviewerPublicKeyAction } from '@/server/actions/user-keys.actions'
import { useRouter, useSearchParams } from 'next/navigation'
import { reportMutationError } from '@/components/errors'

interface Keys {
    binaryPublicKey: ArrayBuffer
    privateKey: string
    fingerprint: string
}

type GenerateKeysProps = {
    isRegenerating?: boolean
}

export const GenerateKeys: FC<GenerateKeysProps> = ({ isRegenerating = false }) => {
    const theme = useMantineTheme()
    const [keys, setKeys] = useState<Keys>()
    const [confirmationOpened, { open: openConfirmKeyCopied, close: closeConfirmKeyCopied }] = useDisclosure(false)
    const [isKeyCopied, setIsKeyCopied] = useState<boolean>(false)

    const onGenerateKeys = async () => {
        const { privateKeyString, fingerprint, exportedPublicKey } = await generateKeyPair()
        const privateKeyLines = (privateKeyString.match(/.{1,112}/g) || []).join('\n')

        const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyLines}\n-----END PRIVATE KEY-----`

        setKeys({
            binaryPublicKey: exportedPublicKey,
            privateKey: privateKeyPem,
            fingerprint,
        })
    }

    useEffect(() => {
        onGenerateKeys()
    }, [])

    if (keys) {
        return (
            <Paper p="xl" mx="sm" radius="sm" maw={900} my={{ base: '1rem', lg: 0 }}>
                <Title mb="xxl">Reviewer key</Title>
                <Paper shadow="xs" p="xl">
                    <Stack>
                        <Title size="xl">Store reviewer key</Title>
                        <Divider c="charcoal.1" />
                        <Stack>
                            <Text size="md" mb="xs">
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
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                }}
                            >
                                {keys.privateKey}
                            </Code>
                            <Text size="sm" mb="xs">
                                Note: Please store your reviewer key securely, such as in your password manager.
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
                                            w="150px"
                                        >
                                            Copy key
                                        </Button>
                                    )}
                                </CopyButton>
                            </Group>
                            <Group>
                                <Button variant="outline" onClick={() => openConfirmKeyCopied()} w="150px">
                                    Go to dashboard
                                </Button>
                            </Group>
                        </Group>
                        {isKeyCopied && (
                            <Flex gap="xs">
                                <CheckIcon size={16} color={theme.colors.green[9]} />
                                <Text c="green.9" size="xs" fw={500}>
                                    Copied!
                                </Text>
                            </Flex>
                        )}
                    </Stack>
                </Paper>
                <ConfirmationModal
                    onClose={closeConfirmKeyCopied}
                    isOpen={confirmationOpened}
                    keys={keys}
                    isRegenerating={isRegenerating}
                />
            </Paper>
        )
    }
}

const ConfirmationModal: FC<{ onClose: () => void; isOpen: boolean; keys: Keys; isRegenerating: boolean }> = ({
    onClose,
    isOpen,
    keys,
    isRegenerating,
}) => {
    const router = useRouter()
    const searchParams = useSearchParams()

    const { mutate: saveReviewerKey, isPending: isSavingKey } = useMutation({
        mutationFn: () => {
            if (isRegenerating) {
                return updateReviewerPublicKeyAction({
                    publicKey: keys.binaryPublicKey,
                    fingerprint: keys.fingerprint,
                })
            } else {
                return setReviewerPublicKeyAction({
                    publicKey: keys.binaryPublicKey,
                    fingerprint: keys.fingerprint,
                })
            }
        },
        onError: reportMutationError('Failed to save reviewer key'),
        onSuccess() {
            const redirectUrl = searchParams.get('redirect_url')
            router.push(redirectUrl || '/')
        },
    })

    return (
        <AppModal isOpen={isOpen} onClose={onClose} title="Have you stored your reviewer key?">
            <Stack>
                <Text size="md">Make sure you have securely saved your reviewer key. </Text>
                <Text size="sm" c="red.9">
                    <b>Note:</b> SafeInsights does not store your reviewer key. If you lose your key, you won&apos;t be
                    able to access study results and will need to generate a new key.
                </Text>
                <Text size="md" mb="md">
                    Do you want to proceed?
                </Text>
                <Group>
                    <Button variant="outline" onClick={onClose}>
                        Take me back
                    </Button>
                    <Button onClick={() => saveReviewerKey()} loading={isSavingKey}>
                        Yes, go to dashboard
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
