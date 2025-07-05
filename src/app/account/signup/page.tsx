import { SignUp } from '@/components/signup'
import { pageStyles } from '@/styles/common'
import { Container } from '@/styles/generated/jsx'
import { PROD_ENV } from '@/server/config'

export const dynamic = 'force-dynamic'

export default function SignUpPage() {
    // https://openstax.atlassian.net/browse/OTTER-107
    // Temporarily remove signup page on production
    if (PROD_ENV) return null

    return (
        <div className={pageStyles}>
            <Container>
                <SignUp />
            </Container>
        </div>
    )
}
