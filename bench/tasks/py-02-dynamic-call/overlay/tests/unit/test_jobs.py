from shop.jobs import nightly


def test_nightly_job_applies_the_discount():
    assert nightly() == 150
