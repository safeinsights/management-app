# Lambda has no /dev/shm, so the multiprocessing.Pool that Semgrep's fixture test builds fails there.
# Run the same test with a serial pool. Tied to the Semgrep version pinned in requirements.txt.
import itertools
import multiprocessing
import sys


class SerialPool:
    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starmap(self, fn, iterable):
        return list(itertools.starmap(fn, iterable))


multiprocessing.Pool = SerialPool

import semgrep.main  # noqa: E402

sys.exit(semgrep.main.main())
