import { ResetPassword } from '@/components/reset-password'
import { pageStyles } from '@/styles/common'
import { Container } from '@/styles/generated/jsx'

export default function ResetPasswordPage() {
    return (
        <div className={pageStyles}>
            <Container>
                <ResetPassword />
            </Container>
        </div>
    )
}
