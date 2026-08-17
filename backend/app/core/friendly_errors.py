"""Maps raw, often-technical error text to something a customer can
actually understand and act on.

Deliberately CONSERVATIVE: most `HTTPException(detail=...)` messages raised
throughout this codebase were already written to be read by a person (e.g.
"Please fill in Connection Name.") — those are passed through completely
unchanged. This only rewrites text that's recognizably technical/leaky:
driver errors, stack traces, upstream API error dumps, raw SQL states, etc.
Anything not matched falls through to a single generic fallback rather than
guessing, so nothing technical ever reaches the UI unfiltered.
"""

import re
from typing import Callable, Optional

_TECHNICAL_MARKERS = (
    "traceback",
    "Traceback",
    'File "',
    "odbc",
    "ODBC",
    "pyodbc",
    "sqlstate",
    "SQLSTATE",
    "sqlalchemy",
    "psycopg",
    "noneType",
    "NoneType",
    "object has no attribute",
    "KeyError",
    "AttributeError",
    "TypeError:",
    "ValueError:",
    "  at ",  # JS stack frame style, in case an upstream error embeds one
)

# (compiled regex, replacement-builder) pairs, checked in order — first
# match wins. Each replacement-builder takes the regex Match and returns
# the friendly string.
_KNOWN_PATTERNS: list[tuple[re.Pattern, Callable]] = [
    # Fabric: "A connection with name 'X' already exists ..." (varies by
    # exact wording across Fabric API versions, hence the loose match).
    (
        re.compile(r"connection.{0,40}(already exists|already in use|name.{0,20}conflict)", re.IGNORECASE),
        lambda m: "A connection with this name already exists in your Fabric workspace. Please choose a different connection name.",
    ),
    # Must come before the generic "login failed" pattern below — this
    # message also contains the literal text "login failed", but the
    # actual cause is a permissions/database-access issue, not a bad
    # credential, and must not be reported as one.
    (
        re.compile(r"cannot open database.{0,80}requested by the login", re.IGNORECASE),
        lambda m: "That login doesn't have access to the requested database on this server. Please check the login's database permissions.",
    ),
    (
        re.compile(r"(login timeout|connection timed? ?out|timeout expired)", re.IGNORECASE),
        lambda m: "We couldn't reach that database in time. Please double-check the server address and that it's reachable, then try again.",
    ),
    (
        re.compile(r"(login failed|authentication failed|invalid username or password|access denied for user)", re.IGNORECASE),
        lambda m: "That username or password wasn't accepted by the database. Please check your credentials and try again.",
    ),
    (
        re.compile(r"(could not translate host name|name or service not known|getaddrinfo failed|no such host)", re.IGNORECASE),
        lambda m: "We couldn't find that server address. Please double-check the server / host value.",
    ),
    (
        re.compile(r"(database .* does not exist|unknown database)", re.IGNORECASE),
        lambda m: "That database name wasn't found on the server. Please double-check the database name.",
    ),
    (
        re.compile(r"(ssl|tls).{0,30}(certificate|handshake)", re.IGNORECASE),
        lambda m: "We couldn't establish a secure connection to that server. Please check the server address and network/firewall settings.",
    ),
]


def to_friendly_message(raw_message: Optional[str], status_code: Optional[int] = None) -> str:
    if not raw_message:
        return _fallback_for_status(status_code)

    for pattern, build in _KNOWN_PATTERNS:
        m = pattern.search(raw_message)
        if m:
            return build(m)

    looks_technical = any(marker in raw_message for marker in _TECHNICAL_MARKERS) or len(raw_message) > 300
    if looks_technical:
        return _fallback_for_status(status_code)

    # Already looks like a normal, human-written message (the common case —
    # most of this codebase's HTTPException details already are) — pass
    # it through as-is.
    return raw_message


def _fallback_for_status(status_code: Optional[int]) -> str:
    if status_code == 404:
        return "We couldn't find what you were looking for. It may have been removed, or the link may be out of date."
    if status_code == 401:
        return "Your session has expired. Please sign in again."
    if status_code == 403:
        return "You don't have permission to do that."
    if status_code and 400 <= status_code < 500:
        return "That request couldn't be completed. Please check the details and try again."
    return "Something went wrong on our end. Please try again — if this keeps happening, contact support."