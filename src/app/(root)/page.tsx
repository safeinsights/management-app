import { mainStyles, pageStyles } from '@/styles/common'
import { UserNav } from './user-nav'

// TODO Remove this root page?,
//  or route users based on their roles to correct pages?
export default function Home() {
    return (
        <div className={pageStyles}>
            <main className={mainStyles}>
                <UserNav />
            </main>
        </div>
    )
}
