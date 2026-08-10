'use client'

import { useMutation } from '@/common'
import { reportMutationError } from '@/components/errors'
import { AppModal } from '@/components/modals/app-modal'
import { setUserPublicKeyAction, updateUserPublicKeyAction } from '@/server/actions/user-keys.actions'
import { Button, Code, Group, Paper, Stack, Text, Title, useMantineTheme } from '@mantine/core'
import { useClipboard, useDisclosure } from '@mantine/hooks'
import { CheckIcon, XIcon } from '@phosphor-icons/react/dist/ssr'
import type { Route } from 'next'
import { useRouter, useSearchParams } from 'next/navigation'
import { FC, useEffect, useState } from 'react'
import { generateKeyPair } from 'si-encryption/util/keypair'
import { Routes } from '@/lib/routes'
import { safeRedirectUrl } from '@/lib/utils'

interface Keys {
    binaryPublicKey: ArrayBuffer
    privateKey: string
    fingerprint: string
}

// AC: a reset returns to "My dashboard"; the first key ever generated returns to the landing the
// page resolved for this account. An explicit redirect_url (invite flows, deep links) overrides it.
// Keyed off account state rather than off the presence of that parameter: the RequireUserKey guard
// is the entry point most first keys arrive through, and it passes none (OTTER-655).
export function postKeyRedirect(isRegenerating: boolean, redirectParam: string | null, firstKeyRedirect: Route): Route {
    if (isRegenerating) return Routes.dashboard

    return safeRedirectUrl(redirectParam, firstKeyRedirect)
}

type GenerateKeysProps = {
    isRegenerating?: boolean
    /** Where a first key lands when no redirect_url is supplied; ignored for a reset. */
    firstKeyRedirect?: Route
}

export const GenerateKeys: FC<GenerateKeysProps> = ({
    isRegenerating = false,
    firstKeyRedirect = Routes.dashboard,
}) => {
    const theme = useMantineTheme()
    const [keys, setKeys] = useState<Keys>()
    const [confirmationOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)
    // Reveal Next after any copy attempt so a blocked clipboard doesn't trap the user.
    const [hasAttemptedCopy, setHasAttemptedCopy] = useState(false)
    const clipboard = useClipboard({ timeout: 2000 })

    const onGenerateKeys = async () => {
        const { privateKeyString, fingerprint, exportedPublicKey } = await generateKeyPair()
        const privateKeyLines = (privateKeyString.match(/.{1,112}/g) || []).join('\n')
        const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyLines}\n-----END PRIVATE KEY-----`

        setKeys({ binaryPublicKey: exportedPublicKey, privateKey: privateKeyPem, fingerprint })
    }

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        onGenerateKeys()
    }, [])

    if (!keys) return null

    const onCopy = () => {
        // useClipboard clears `error` only on reset, never on a later success, so without this a
        // retry after a blocked copy shows the green check and the red failure at once.
        clipboard.reset()
        clipboard.copy(keys.privateKey)
        setHasAttemptedCopy(true)
    }

    return (
        <Paper bg="white" p="xxl" mx="sm" radius="sm" maw={900} my={{ base: '1rem', lg: 0 }}>
            <Stack gap={24}>
                <Title order={3} fz={22}>
                    Security key
                </Title>

                <Text fz={16}>
                    This is your security key. You will need it to access your study outputs across every organization
                    you belong to.{' '}
                    <Text component="b" fw={700} inherit>
                        It is shown only once. Copy and store it somewhere safe, like a password manager, before you
                        continue.
                    </Text>
                </Text>

                <Stack gap={16}>
                    <Text fz={14} fw={600}>
                        Copy and store your security key
                    </Text>
                    <Code
                        block
                        style={{
                            maxHeight: 160,
                            border: `1px solid ${theme.colors.grey[7]}`,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                        }}
                    >
                        {keys.privateKey}
                    </Code>
                </Stack>

                <Stack gap="xs">
                    <Group>
                        <Button onClick={onCopy}>Copy key</Button>
                        <NextButton isVisible={hasAttemptedCopy} onClick={openConfirm} />
                    </Group>
                    <CopySucceededIndicator isVisible={clipboard.copied} />
                    <CopyFailedIndicator isVisible={clipboard.error != null} />
                </Stack>
            </Stack>

            <ConfirmationModal
                onClose={closeConfirm}
                isOpen={confirmationOpened}
                keys={keys}
                isRegenerating={isRegenerating}
                firstKeyRedirect={firstKeyRedirect}
            />
        </Paper>
    )
}

const NextButton: FC<{ isVisible: boolean; onClick: () => void }> = ({ isVisible, onClick }) => {
    if (!isVisible) return null
    return (
        <Button variant="outline" onClick={onClick}>
            Next
        </Button>
    )
}

const CopySucceededIndicator: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    const theme = useMantineTheme()
    if (!isVisible) return null
    return (
        <Group gap="xs">
            <CheckIcon size={16} color={theme.colors.green[9]} />
            <Text c="green.9" fz={14} fw={500}>
                Copied!
            </Text>
        </Group>
    )
}

const CopyFailedIndicator: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    const theme = useMantineTheme()
    if (!isVisible) return null
    return (
        <Group gap="xs">
            <XIcon size={16} color={theme.colors.red[9]} />
            <Text c="red.9" fz={14}>
                Copy did not work. Select the key above and copy it manually.
            </Text>
        </Group>
    )
}

const ConfirmationModal: FC<{
    onClose: () => void
    isOpen: boolean
    keys: Keys
    isRegenerating: boolean
    firstKeyRedirect: Route
}> = ({ onClose, isOpen, keys, isRegenerating, firstKeyRedirect }) => {
    const router = useRouter()
    const searchParams = useSearchParams()

    const { mutate: saveUserKey, isPending: isSavingKey } = useMutation({
        mutationFn: () => {
            if (isRegenerating) {
                return updateUserPublicKeyAction({ publicKey: keys.binaryPublicKey })
            }
            return setUserPublicKeyAction({ publicKey: keys.binaryPublicKey })
        },
        onError: reportMutationError('Failed to save security key'),
        onSuccess() {
            router.push(postKeyRedirect(isRegenerating, searchParams.get('redirect_url'), firstKeyRedirect))
        },
    })

    return (
        <AppModal isOpen={isOpen} onClose={onClose} title="Have you stored your security key?">
            <Stack>
                <Text fz={16} mb="md">
                    SafeInsights does not store your key. If you lose it, you will not be able to access your study
                    outputs.
                </Text>
                <Group>
                    <Button variant="outline" onClick={onClose}>
                        Back
                    </Button>
                    <Button onClick={() => saveUserKey()} loading={isSavingKey}>
                        Yes, I have stored my key
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
