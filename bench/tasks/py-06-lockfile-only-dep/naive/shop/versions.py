from packaging.version import Version


def is_newer(a, b):
    return Version(a) > Version(b)
