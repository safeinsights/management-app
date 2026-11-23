import { describe, expect, it } from '@/tests/unit.helpers'
import { parseSemgrepStatus } from '@/server/db/queries'
import { scanLog } from './content'
import { SAMPLE_STUDIES } from './studies'

describe('scanLog', () => {
    it('reads as a passed Semgrep scan on the reviewer scan panel', () => {
        expect(parseSemgrepStatus(scanLog(SAMPLE_STUDIES[11]))).toBe('PASSED')
    })
})
