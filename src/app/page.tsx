import { footerStyles, mainStyles, pageStyles } from './page.css'
import { db } from '@/database'
import { unstable_noStore as noStore } from 'next/cache'

async function getDB() {
    try {
        return await db.selectFrom('study').selectAll().execute()
    } catch (error) {
        console.warn(error)
        return 'Error getting studies'
    }
}

export default async function Home() {
    noStore()

    const recs = await getDB()

    return (
        <div className={pageStyles}>
            <main className={mainStyles}>Hello World, found {recs.length} studies</main>
            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}
