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
        .select(['orgTestLab.id', 'researchLab.id as researchLabId', 'researchLab.name as researchLabName'])
        .where('orgTestLab.dataPartnerId', '=', dataPartnerId)
        .orderBy('researchLab.name')
        .execute()

// Every lab, not the ones this partner has worked with: no schema ties a research lab to a data
// partner, and the card leaves that out of scope.
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

// No undesignate yet, deliberately: a test lab is permanent for now. The write itself is a delete
// scoped to the pair, but two things need answering first. Studies already stamped is_test_study
// stay exempt forever, which is not what a Remove button reads like; unstamping them instead would
// unenforce an agreement a study may already carry. The modal copy also promises permanence.
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
