import { ResetPassword } from './reset-password'
import { pageStyles } from '@/styles/common'
import { Container } from '@/styles/generated/jsx'

export const dynamic = 'force-dynamic'

export default function ResetPasswordPage() {
    return (
        <div className={pageStyles}>
            <Container>
                <ResetPassword />
            </Container>
        </div>
    )
}
