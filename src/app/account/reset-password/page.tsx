import FlexWrapper from '../flex-wrapper'
import { ResetPassword } from './reset-password'
import { Container } from '@/styles/generated/jsx'

export const dynamic = 'force-dynamic'

export default function ResetPasswordPage() {
    return (
        <FlexWrapper>
            <Container w={600}>
                <ResetPassword />
            </Container>
        </FlexWrapper>
    )
}
