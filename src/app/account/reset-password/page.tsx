import { Container } from '@mantine/core'
import { ResetPassword } from './reset-password'

export const dynamic = 'force-dynamic'

export default function ResetPasswordPage() {
    return (
        <Container w={500}>
            <ResetPassword />
        </Container>
    )
}
