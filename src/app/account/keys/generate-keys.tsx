'use client'

import { useMutation } from '@/common'
import { reportMutationError } from '@/components/errors'
import { AppModal } from '@/components/modals/app-modal'
import { setUserPublicKeyAction, updateUserPublicKeyAction } from '@/server/actions/user-keys.actions'
import { Button, Code, Group, Paper, Stack, Text, Title, useMantineTheme } from '@mantine/core'
import { useClipboard, useDisclosure } from '@mantine/hooks'
import { CheckIcon, XIcon } from '@phosphor-icons/react/dist/ssr'
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

type GenerateKeysProps = {
    isRegenerating?: boolean
}

const SECONDARY_TEXT_LEAD =
    'This is your security key. You will need it to access your study outputs across every organization you belong to. '
const SECONDARY_TEXT_BOLD =
    'It is shown only once. Copy and store it somewhere safe, like a password manager, before you continue.'
const COPY_FAILED_MESSAGE = 'Copy did not work. Select the key above and copy it manually.'

export const GenerateKeys: FC<GenerateKeysProps> = ({ isRegenerating = false }) => {
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
                    {SECONDARY_TEXT_LEAD}
                    <Text component="b" fw={700} inherit>
                        {SECONDARY_TEXT_BOLD}
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
                    <CopyFailedIndicator isVisible={hasAttemptedCopy && clipboard.error != null} />
                </Stack>
            </Stack>

            <ConfirmationModal
                onClose={closeConfirm}
                isOpen={confirmationOpened}
                keys={keys}
                isRegenerating={isRegenerating}
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
                {COPY_FAILED_MESSAGE}
            </Text>
        </Group>
    )
}

const ConfirmationModal: FC<{ onClose: () => void; isOpen: boolean; keys: Keys; isRegenerating: boolean }> = ({
    onClose,
    isOpen,
    keys,
    isRegenerating,
}) => {
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
            // First-time onboarding carries an org-dashboard redirect_url; a reset carries none.
            router.push(safeRedirectUrl(searchParams.get('redirect_url'), Routes.dashboard))
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
