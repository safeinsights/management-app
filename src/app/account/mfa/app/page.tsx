'use client'

import { useUser } from '@clerk/nextjs'
import { TOTPResource } from '@clerk/types'
import * as React from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { GenerateBackupCodes } from '../backup-codes'
import { useForm } from '@mantine/form'
import { Button, TextInput, Text, Flex, Container } from '@mantine/core'
import { errorToString, reportError } from '@/components/errors'
import { Panel } from '@/components/panel'
import { ButtonLink } from '@/components/links'

type AddTotpSteps = 'add' | 'verify' | 'backupcodes' | 'success'

type DisplayFormat = 'qr' | 'uri'

function AddTotpScreen({ setStep }: { setStep: React.Dispatch<React.SetStateAction<AddTotpSteps>> }) {
    const { user } = useUser()
    const [totp, setTOTP] = React.useState<TOTPResource | undefined>(undefined)
    const [displayFormat, setDisplayFormat] = React.useState<DisplayFormat>('qr')

    React.useEffect(() => {
        void user
            ?.createTOTP()
            .then((totp: TOTPResource) => {
                setTOTP(totp)
            })
            .catch((err) => reportError(err, 'Error generating MFA'))
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Panel title="Add MFA">
            <Flex gap="md" mb="lg" align={'flex-end'}>
                {totp && displayFormat === 'qr' && (
                    <>
                        <div>
                            <QRCodeSVG value={totp?.uri || ''} size={200} />
                        </div>
                        <Button onClick={() => setDisplayFormat('uri')}>Use URI instead</Button>
                    </>
                )}

                {totp && displayFormat === 'uri' && (
                    <>
                        <div>
                            <p>{totp.uri}</p>
                        </div>
                        <Button onClick={() => setDisplayFormat('qr')}>Use QR Code instead</Button>
                    </>
                )}

                <Button onClick={() => setStep('add')}>Re generate</Button>
            </Flex>
            <p>Once you have set up your authentication app, verify your code</p>
            <Button onClick={() => setStep('verify')}>Verify</Button>
        </Panel>
    )
}

function VerifyTotpScreen({ setStep }: { setStep: React.Dispatch<React.SetStateAction<AddTotpSteps>> }) {
    const { user } = useUser()

    const form = useForm({
        mode: 'uncontrolled',
        initialValues: {
            code: '',
        },
        validate: {
            code: (c: string) => (String(Number(c)).length != 6 ? 'Code must be six digits' : null),
        },
    })

    const verifyTotp = async (e: { code: string }) => {
        try {
            await user?.verifyTOTP({ code: e.code })
            setStep('backupcodes')
        } catch (err: unknown) {
            form.setErrors({ code: errorToString(err) || 'Invalid Code' })
        }
    }

    return (
        <Panel gap="lg" maw={400} title="Verify MFA code">
            <form onSubmit={form.onSubmit(verifyTotp)}>
                <TextInput
                    mb="lg"
                    autoFocus
                    maxLength={8}
                    name="code"
                    label="Enter the code from your authentication app"
                    placeholder="000 000"
                    {...form.getInputProps('code')}
                />
                <Flex gap="lg" justify={'center'}>
                    <Button variant="light" onClick={() => setStep('add')}>
                        Retry
                    </Button>
                    <Button type="submit">Verify code</Button>
                </Flex>
            </form>
        </Panel>
    )
}

function BackupCodeScreen({ setStep }: { setStep: React.Dispatch<React.SetStateAction<AddTotpSteps>> }) {
    return (
        <Panel title="Verification was a success!">
            <Text>
                Save this list of backup codes somewhere safe in case you need to access your account in an emergency
            </Text>
            <GenerateBackupCodes />
            <Button onClick={() => setStep('success')}>Finish</Button>
        </Panel>
    )
}

function SuccessScreen() {
    return (
        <Panel title="Success!">
            <Text>You have successfully added TOTP MFA with an authentication application.</Text>

            <ButtonLink href="/">Return to homepage</ButtonLink>
        </Panel>
    )
}

export default function AddMFaScreen() {
    const [step, setStep] = React.useState<AddTotpSteps>('add')
    const { isLoaded, user } = useUser()

    if (!isLoaded) return null

    if (!user) {
        return <p>You must be logged in to access this page</p>
    }

    return (
        <Container>
            {step === 'add' && <AddTotpScreen setStep={setStep} />}
            {step === 'verify' && <VerifyTotpScreen setStep={setStep} />}
            {step === 'backupcodes' && <BackupCodeScreen setStep={setStep} />}
            {step === 'success' && <SuccessScreen />}
        </Container>
    )
}
