from datetime import UTC, datetime

import pytest

from app.ledger.timeutil import month_range


def test_month_range_uses_vietnam_midnight():
    start, end = month_range("2026-09")
    assert start == datetime(2026, 8, 31, 17, 0, tzinfo=UTC)
    assert end == datetime(2026, 9, 30, 17, 0, tzinfo=UTC)


def test_month_range_rolls_over_december():
    start, end = month_range("2026-12")
    assert start == datetime(2026, 11, 30, 17, 0, tzinfo=UTC)
    assert end == datetime(2026, 12, 31, 17, 0, tzinfo=UTC)


@pytest.mark.parametrize("bad", ["2026-13", "2026", "2026-09-01", "abcd-ef", ""])
def test_month_range_rejects_bad_input(bad):
    with pytest.raises(ValueError):
        month_range(bad)
