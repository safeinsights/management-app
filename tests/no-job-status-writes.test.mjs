import { RuleTester } from 'eslint'
import typescriptEslint from 'typescript-eslint'
import { describe, it } from 'vitest'
import noJobStatusWrites from './no-job-status-writes.mjs'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parser: typescriptEslint.parser,
    },
})

const errors = [{ messageId: 'directWrite' }]

ruleTester.run('noJobStatusWrites', noJobStatusWrites, {
    valid: [
        "db.selectFrom('jobStatusChange').selectAll()",
        "db.insertInto('studyJobFile').values(row)",
        "db.updateTable('studyJob').set({ createdAt })",
        "db.deleteFrom('studyJob').where('id', '=', id)",
        'db.insertInto(table).values(row)',
        "transitionJob(db, jobId, 'CODE-SUBMITTED', { actor: 'researcher' })",
        'sql`select * from job_status_change where study_job_id = ${id}`',
        "sql.raw('select 1 from job_status_change')",
        'other`insert into job_status_change values (1)`',
    ],
    invalid: [
        { code: "db.insertInto('jobStatusChange').values(row)", errors },
        { code: "trx.insertInto('job_status_change').values(row)", errors },
        { code: "db.insertInto('jobStatusChange as jsc').values(row)", errors },
        { code: 'db.insertInto(`jobStatusChange`).values(row)', errors },
        { code: "db.updateTable('jobStatusChange').set({ message })", errors },
        { code: "db.deleteFrom('jobStatusChange').where('id', '=', id)", errors },
        { code: "db.replaceInto('jobStatusChange').values(row)", errors },
        { code: "db.mergeInto('job_status_change as target').using(source)", errors },
        { code: "db.insertInto('studyJob').values({ studyId })", errors },
        { code: "db.insertInto('study_job').values({ study_id })", errors },
        { code: 'sql`insert into job_status_change (status) values (${status})`', errors },
        { code: 'sql`UPDATE "public"."job_status_change" SET message = ${m}`', errors },
        { code: 'sql`delete from job_status_change where id = ${id}`', errors },
        { code: "sql.raw('INSERT INTO job_status_change (status) VALUES (1)')", errors },
    ],
})
