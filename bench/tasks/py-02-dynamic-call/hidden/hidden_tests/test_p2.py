from shop.pricing import calculate_discount
from shop.jobs import nightly


def test_renamed_and_job_works():
    assert calculate_discount(200, 25) == 150
    assert nightly() == 150
