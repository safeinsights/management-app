import 'dotenv/config'

import { deleteClerkTestUsers } from '../tests/clerk'

deleteClerkTestUsers().catch((err: unknown) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
