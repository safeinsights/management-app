import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    // https://gist.github.com/kjmph/5bd772b2c2df145aa645b837da7eca74
    await sql`
create or replace function v7uuid()
returns uuid
as $$
begin
  -- use random v4 uuid as starting point (which has the same variant we need)
  -- then overlay timestamp
  -- then set version 7 by flipping the 2 and 1 bit in the version 4 string
  return encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
                placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
                from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex')::uuid;
end
$$
language plpgsql
volatile;
`.execute(db)

    await sql`
create or replace function uuid_to_b64(uuid uuid) returns text as $$
  select translate(
    encode(
      decode(
        replace(
          uuid::text,
          '-', ''
        ),
        'hex'
      ),
      'base64'
    ),
    '+/=', '-_'
  );
$$ language sql;
`.execute(db)

    await sql`
create or replace function b64_to_uuid(encoded_uuid text) returns uuid as $$
  select regexp_replace(
    encode(
      decode(
        translate(
          encoded_uuid,
          '-_', '+/'
        ) || '==',
        'base64'
      ),
      'hex'
    ),
    '(\\.{8})(\\.{4})(\\.{4})(\\.{4})(\\.{12})', '\\1-\\2-\\3-\\4-\\5'
  )::uuid;
$$ language sql;
`.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`drop function v7uuid()`.execute(db)
    await sql`drop function uuid_to_b64()`.execute(db)
    await sql`drop function b64_to_uuid()`.execute(db)
}
