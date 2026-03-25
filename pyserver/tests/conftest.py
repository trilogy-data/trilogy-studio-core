import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("TRILOGY_POOL_MODE", "thread")
os.environ.setdefault("ALLOWED_ORIGINS", "prod")
os.environ.setdefault("ENVIRONMENT", "production")
os.environ.setdefault("HOST", "testserver")
os.environ.setdefault("ENABLE_PERF_LOGGING", "false")

from main import app


@pytest.fixture
def test_client():
    with TestClient(app) as client:
        yield client
