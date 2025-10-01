import 'dotenv/config'

import { deleteClerkTestUsers } from '../tests/clerk'
import dayjs from 'dayjs'

const cutoff = dayjs(process.argv[2]).toDate()

deleteClerkTestUsers(cutoff).catch((err: unknown) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
