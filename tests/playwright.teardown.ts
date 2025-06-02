import { deleteClerkTestUsers } from './clerk'
import { test as teardown } from '@playwright/test'

teardown('global teardown', async ({}) => {
    await deleteClerkTestUsers()
})
