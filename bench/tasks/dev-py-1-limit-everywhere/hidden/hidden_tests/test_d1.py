from shop.limits import can_add
from shop.legacy_limits import legacy_can_add


def test_limit_is_20():
    assert can_add(19) is True
    assert can_add(20) is False
    assert legacy_can_add(19) is True
