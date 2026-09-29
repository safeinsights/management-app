import { type DBExecutor } from '@/database'

type Pair = { dataPartnerId: string; researchLabId: string }

export const isDesignatedTestLab = async (db: DBExecutor, { dataPartnerId, researchLabId }: Pair) =>
    Boolean(
        await db
            .selectFrom('orgTestLab')
            .select('id')
            .where('dataPartnerId', '=', dataPartnerId)
            .where('researchLabId', '=', researchLabId)
            .executeTakeFirst(),
    )

export const orgTestLabs = (db: DBExecutor, dataPartnerId: string) =>
    db
        .selectFrom('orgTestLab')
        .innerJoin('org as researchLab', 'researchLab.id', 'orgTestLab.researchLabId')
        .select([
            'orgTestLab.id',
            'orgTestLab.createdAt',
            'researchLab.id as researchLabId',
            'researchLab.name as researchLabName',
        ])
        .where('orgTestLab.dataPartnerId', '=', dataPartnerId)
        .orderBy('researchLab.name')
        .execute()

// Every lab: no schema ties a research lab to a data partner.
export const labsEligibleAsTestLabs = (db: DBExecutor, dataPartnerId: string) =>
    db
        .selectFrom('org')
        .select(['org.id', 'org.name'])
        .where('org.type', '=', 'lab')
        .where((eb) =>
            eb.not(
                eb.exists(
                    eb
                        .selectFrom('orgTestLab')
                        .select('orgTestLab.id')
                        .where('orgTestLab.dataPartnerId', '=', dataPartnerId)
                        .whereRef('orgTestLab.researchLabId', '=', 'org.id'),
                ),
            ),
        )
        .orderBy('org.name')
        .execute()

// No undesignate yet: stamped studies would stay exempt forever, and unstamping would unenforce an
// agreement a study may carry. The modal also promises permanence.
export const designateTestLabs = async (
    db: DBExecutor,
    {
        dataPartnerId,
        researchLabIds,
        createdByUserId,
    }: { dataPartnerId: string; researchLabIds: string[]; createdByUserId: string },
) => {
    await db
        .insertInto('orgTestLab')
        .values(researchLabIds.map((researchLabId) => ({ dataPartnerId, researchLabId, createdByUserId })))
        .onConflict((oc) => oc.constraint('org_test_lab_pair_unique').doNothing())
        .execute()
}
