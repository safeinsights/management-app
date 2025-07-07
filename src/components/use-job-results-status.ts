import { useMemo } from "react";

type StatusFlags = {
  isApproved: boolean;
  isRejected: boolean;
  isComplete: boolean;
  isErrored: boolean;
};

type StatusChange = {
  status: string;
};

const statusMap: Record<string, keyof StatusFlags> = {
  'FILES-APPROVED': 'isApproved',
  'FILES-REJECTED': 'isRejected',
  'RUN-COMPLETE': 'isComplete',
  'JOB-ERRORED': 'isErrored',
};

const initialFlags: StatusFlags = {
  isApproved: false,
  isRejected: false,
  isComplete: false,
  isErrored: false,
};

export function useJobResultsStatus(statusChanges: StatusChange[]): StatusFlags {
  return useMemo(() => {
    return statusChanges.reduce((acc, sc) => {
      const key = statusMap[sc.status];
      if (key) acc[key] = true;
      return acc;
    }, { ...initialFlags });
  }, [statusChanges]);
}
