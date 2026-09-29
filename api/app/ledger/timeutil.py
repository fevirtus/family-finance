import re
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")
_MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")


def month_range(month: str) -> tuple[datetime, datetime]:
    """Return the UTC [start, end) of a calendar month in Vietnam time."""
    match = _MONTH_RE.match(month)
    if not match:
        raise ValueError(f"invalid month: {month!r}")
    year, mon = int(match.group(1)), int(match.group(2))
    start = datetime(year, mon, 1, tzinfo=VN_TZ)  # raises ValueError for month 13
    if mon == 12:
        end = datetime(year + 1, 1, 1, tzinfo=VN_TZ)
    else:
        end = datetime(year, mon + 1, 1, tzinfo=VN_TZ)
    return start.astimezone(UTC), end.astimezone(UTC)
