import { Title } from '@mantine/core'
import { UserNav } from './user-nav'
import { pageStyles, mainStyles, footerStyles } from '@/styles/common'

export const dynamic = 'force-dynamic'

// TODO Remove this root page?,
//  or route users based on their roles to correct pages?
export default function Home() {
    return (
        <div className={pageStyles}>
            <main className={mainStyles}>
                <Title>Welcome to the SafeInsights management app.</Title>
                <UserNav />
            </main>

            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}
