import type { Metadata } from 'next'
import { Container } from '@mantine/core'
import { ResetPassword } from './reset-password'

export const metadata: Metadata = { title: 'Reset password' }

export default function ResetPasswordPage() {
    return (
        <Container w={500}>
            <ResetPassword />
        </Container>
    )
}
