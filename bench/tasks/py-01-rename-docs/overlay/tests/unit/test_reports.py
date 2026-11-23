from reports.summary import summary_line


def test_summary_line_formats_the_discounted_price():
    assert summary_line(100, 10) == "$90.00"
