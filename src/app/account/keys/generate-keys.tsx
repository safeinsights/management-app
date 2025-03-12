'use client'

import { Button, Container, CopyButton, Stack, Text, Title } from '@mantine/core'
import { useUserContext } from '@clerk/shared/react'
import { FC, useState } from 'react'
import { setMemberUserPublicKey } from '@/app/account/keys/user-key-actions'
import { createFingerprint, generateKeyPair } from 'si-encryption/util/keypair'

export const GenerateKeys: FC<{
    clerkId: string
}> = ({ clerkId }) => {
    const user = useUserContext()
    const [keys, setKeys] = useState<{ publicKey: string; privateKey: string }>()

    const onGenerateKeys = async () => {
        // TODO Store the public key at this point for the MemberUserPublicKey w/ react query mutation

        const { publicKey, privateKey } = await generateKeyPair()
        const fingerprint = createFingerprint(publicKey)

        // const keyPair = await window.crypto.subtle.generateKey(
        //     {
        //         name: 'RSA-OAEP',
        //         modulusLength: 2048,
        //         publicExponent: new Uint8Array([1, 0, 1]),
        //         hash: 'SHA-256',
        //     },
        //     true, // whether the key is extractable (i.e., can be used in exportKey)
        //     ['encrypt', 'decrypt'], // key usage - can be any combination of "encrypt" and "decrypt"
        // )
        // // Export the public key
        // const exportedPublicKey = await window.crypto.subtle.exportKey('spki', keyPair.publicKey)
        // const publicKeyString = btoa(String.fromCharCode(...new Uint8Array(exportedPublicKey)))
        //
        // // Export the private key
        // const exportedPrivateKey = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
        // const privateKeyString = btoa(String.fromCharCode(...new Uint8Array(exportedPrivateKey)))

        const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKeyString}\n-----END PUBLIC KEY-----`
        const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyString}\n-----END PRIVATE KEY-----`
        setKeys({
            publicKey: publicKeyPem,
            privateKey: privateKeyPem,
        })

        await setMemberUserPublicKey(clerkId, publicKeyPem, 'TODO')
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
                                <Button color={copied ? 'teal' : 'blue'} onClick={copy}>
                                    {copied ? 'Copied private key!' : 'Copy private key'}
                                </Button>
                            )}
                        </CopyButton>
                    </Stack>
                </Stack>
            </Container>
        )
    }

    return (
        <Container>
            <Stack>
                <Text>Create your Private Key</Text>
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
