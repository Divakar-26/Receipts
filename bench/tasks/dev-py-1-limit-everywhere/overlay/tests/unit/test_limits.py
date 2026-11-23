from shop.limits import can_add
from shop.legacy_limits import legacy_can_add


def test_can_add_stops_at_the_limit():
    assert can_add(10) is False


def test_legacy_can_add_stops_at_the_limit():
    assert legacy_can_add(10) is False
