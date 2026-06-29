import { describe, expect, it } from '@/tests/unit.helpers'
import fs from 'node:fs'
import path from 'node:path'
import { TEST_PUBLIC_KEY_PEM } from './seeds/1743608138837_test_users'

// This test lives outside src/database/seeds because the deploy pipeline bundles
// every *.ts file in that directory as a seed.
describe('test users seed', () => {
    it('embedded public key matches tests/support/public_key.pem', () => {
        const filePem = fs.readFileSync(path.resolve(process.cwd(), 'tests/support/public_key.pem'), 'utf8')
        expect(TEST_PUBLIC_KEY_PEM.trim()).toEqual(filePem.trim())
    })
})
