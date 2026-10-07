"""Normalise a GitHub ruleset for export and comparison.

One function serves both: declared files are written in normalised form and
live rulesets are normalised before they are compared with them.
"""

import copy
from typing import Any, Dict

# Fields GitHub sets itself; they never belong to the declared state.
VOLATILE_KEYS = (
    "id",
    "source",
    "source_type",
    "node_id",
    "_links",
    "created_at",
    "updated_at",
    "current_user_can_bypass",
)


def normalise(ruleset: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy without volatile fields; rules and bypass_actors sorted.

    Everything else is kept exactly, ``enforcement`` included.
    """
    result = copy.deepcopy(ruleset)
    for key in VOLATILE_KEYS:
        result.pop(key, None)
    if "rules" in result:
        result["rules"] = sorted(result["rules"], key=lambda r: r["type"])
    if "bypass_actors" in result:
        result["bypass_actors"] = sorted(
            result["bypass_actors"],
            key=lambda a: (a["actor_type"], a["actor_id"] if a["actor_id"] is not None else -1),
        )
    return result
