import { SignedIn, SignedOut } from '@clerk/nextjs'
import { LoginOrSignup } from '@/components/login-or-signup'
import { footerStyles, mainStyles, pageStyles } from './page.css'
import { db } from '@/database'
import { unstable_noStore as noStore } from 'next/cache'

async function getDB() {
    return await db.selectFrom('study').select('title').execute()
}

const Body: React.FC<{ studies: Awaited<ReturnType<typeof getDB>> }> = ({ studies }) => {
    return (
        <div className={pageStyles}>
            <SignedOut>
                <LoginOrSignup />
            </SignedOut>
            <SignedIn>
                <main className={mainStyles}>Hello World, found {studies.length} records</main>
            </SignedIn>
            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}

export default async function Home() {
    noStore()

    const recs = await getDB()

    return <Body studies={recs} />
}
