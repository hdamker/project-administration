"""Default-owner check on a CODEOWNERS file.

Only the ``*`` line matters: the last one wins, as in GitHub's own matching.
A team counts as several people.
"""

from typing import List, Optional


def default_owners(text: str) -> Optional[List[str]]:
    """Owners of the last ``*`` line, or None when the file has none."""
    owners: Optional[List[str]] = None
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        pattern, *rest = line.split()
        if pattern == "*":
            owners = rest
    return owners


def is_single_codeowner(text: str) -> Optional[bool]:
    """True for exactly one user owner on the ``*`` line; None when undetermined."""
    owners = default_owners(text)
    if not owners:
        return None
    if len(owners) > 1:
        return False
    owner = owners[0]
    return not (owner.startswith("@") and "/" in owner)
