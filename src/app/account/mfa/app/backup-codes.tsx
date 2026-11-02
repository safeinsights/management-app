import { useState, type FC } from '@/common'
import { AppModal } from '@/components/modals/app-modal'
import { useSession } from '@/hooks/session'
import { useUser } from '@clerk/nextjs'
import { Button, CopyButton, Group, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { CheckIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { fontWeight, semanticColor } from '@/theme/tokens'

type ConfirmationModalProps = {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isLoading?: boolean
}

type BackupCodesProps = {
    isVisible: boolean
    codes?: string[] | null
    hasExistingCodes?: boolean
}

function useBackupCodes(enrolledCodes?: string[] | null) {
    const { isLoaded: isSessionLoaded, session } = useSession()
    const router = useRouter()
    const [hasCopied, setHasCopied] = useState(false)
    const [modalOpened, setModalOpened] = useState(false)
    const [isRedirecting, setIsRedirecting] = useState(false)

    const goToDashboard = () => {
        setModalOpened(false)
        setIsRedirecting(true)
        if (!isSessionLoaded || !session) return
        router.push(Routes.dashboard)
    }

    const codes = enrolledCodes ?? []
    const hasCodes = codes.length > 0

    // Leaving without copying gets a confirmation, since the codes are never shown again. With no codes
    // on screen there is nothing to lose.
    const leave = () => {
        if (hasCopied || !hasCodes) goToDashboard()
        else setModalOpened(true)
    }

    return {
        codes,
        hasCodes,
        isSessionLoaded,
        modalOpened,
        isRedirecting,
        markCopied: () => setHasCopied(true),
        closeModal: () => setModalOpened(false),
        leave,
        goToDashboard,
    }
}

type CodesProps = {
    isVisible: boolean
    codes: string[]
}

const RecoveryCodesList: FC<CodesProps> = ({ isVisible, codes }) => {
    if (!isVisible) return null

    return (
        <>
            <Text mb="xs" size="md">
                These are your recovery codes. Please store them in a secure location. You will need one of them to
                access your account <b>if you lose access</b> to your authentication device.
            </Text>

            <ScrollArea.Autosize
                mah={130}
                type="auto"
                bg={semanticColor('surface.sunken')}
                py="md"
                px="lg"
                bd={`1px solid ${semanticColor('border.dark')}`}
            >
                <Stack gap="xxs">
                    {codes.map((code, index) => (
                        <Text key={index} size="sm">
                            {code}
                        </Text>
                    ))}
                </Stack>
            </ScrollArea.Autosize>
        </>
    )
}

const NoCodesNotice: FC<{ isVisible: boolean; hasExistingCodes: boolean }> = ({ isVisible, hasExistingCodes }) => {
    if (!isVisible) return null

    return (
        <Text mb="xs" size="md">
            {hasExistingCodes
                ? 'Your existing recovery codes still work. Use one of them if you lose access to your authentication device.'
                : 'No recovery codes were created for your account. Keep your authentication device safe, because you will need it to sign in.'}
        </Text>
    )
}

const CopyCodesButton: FC<CodesProps & { onCopied: () => void }> = ({ isVisible, codes, onCopied }) => {
    if (!isVisible) return null

    return (
        <CopyButton value={codes.join('\n')} timeout={1000}>
            {({ copied, copy }) => (
                <Stack gap="xxs">
                    <Button
                        fullWidth
                        size="lg"
                        onClick={() => {
                            copy()
                            onCopied()
                        }}
                    >
                        Copy codes
                    </Button>
                    <CopiedNotice isVisible={copied} />
                </Stack>
            )}
        </CopyButton>
    )
}

const CopiedNotice: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null

    return (
        <Group gap="xs" justify="center" align="center">
            <CheckIcon size={16} color={semanticColor('success.text')} />
            <Text size="sm" c={semanticColor('success.text')} fw={fontWeight.semibold}>
                Copied!
            </Text>
        </Group>
    )
}

const BackupCodes = ({ isVisible, codes: enrolledCodes, hasExistingCodes = false }: BackupCodesProps) => {
    const { isLoaded } = useUser()
    const {
        codes,
        hasCodes,
        isSessionLoaded,
        modalOpened,
        isRedirecting,
        markCopied,
        closeModal,
        leave,
        goToDashboard,
    } = useBackupCodes(enrolledCodes)

    if (!isVisible || !isLoaded) return null

    return (
        <>
            <Stack gap="md" mb="xxl">
                <Title mb="xs" ta="center" order={3}>
                    Multi-factor authentication is set up successfully!
                </Title>
                <RecoveryCodesList isVisible={hasCodes} codes={codes} />
                <NoCodesNotice isVisible={!hasCodes} hasExistingCodes={hasExistingCodes} />

                <Stack gap="md" mt="xs">
                    <CopyCodesButton isVisible={hasCodes} codes={codes} onCopied={markCopied} />

                    <Button
                        loading={isRedirecting}
                        fullWidth
                        variant="outline"
                        mt="xs"
                        size="lg"
                        onClick={leave}
                        disabled={!isSessionLoaded}
                    >
                        Go to SafeInsights
                    </Button>
                </Stack>
            </Stack>

            <ConfirmationModal
                isOpen={modalOpened}
                onClose={closeModal}
                onConfirm={goToDashboard}
                isLoading={isRedirecting}
            />
        </>
    )
}

const ConfirmationModal: FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, isLoading = false }) => (
    <AppModal isOpen={isOpen} onClose={onClose} title="Have you stored your MFA recovery codes?">
        <Stack>
            <Text size="md">Make sure you have securely saved your MFA recovery codes.</Text>
            <Text size="sm" c={semanticColor('error.text')}>
                <b>Note:</b> Each code can be used once. We will not show these codes again.
            </Text>
            <Text size="md" mb="md">
                Do you want to proceed?
            </Text>
            <Group>
                <Button variant="outline" onClick={onClose} size="md">
                    Back
                </Button>
                <Button loading={isLoading} onClick={onConfirm} size="md">
                    Go to SafeInsights
                </Button>
            </Group>
        </Stack>
    </AppModal>
)

export default BackupCodes
