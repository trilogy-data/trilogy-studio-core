import process_pool


def test_process_pool_uses_forkserver_by_default_on_linux(monkeypatch):
    monkeypatch.delenv("TRILOGY_PROCESS_POOL_START_METHOD", raising=False)
    monkeypatch.setattr(process_pool.sys, "platform", "linux")
    monkeypatch.setattr(
        process_pool.multiprocessing,
        "get_all_start_methods",
        lambda: ["fork", "spawn", "forkserver"],
    )

    assert process_pool.get_process_pool_start_method() == "forkserver"


def test_process_pool_uses_spawn_by_default_off_linux(monkeypatch):
    monkeypatch.delenv("TRILOGY_PROCESS_POOL_START_METHOD", raising=False)
    monkeypatch.setattr(process_pool.sys, "platform", "win32")
    monkeypatch.setattr(
        process_pool.multiprocessing,
        "get_all_start_methods",
        lambda: ["spawn"],
    )

    assert process_pool.get_process_pool_start_method() == "spawn"


def test_process_pool_honors_explicit_start_method_override(monkeypatch):
    monkeypatch.setenv("TRILOGY_PROCESS_POOL_START_METHOD", "spawn")
    monkeypatch.setattr(
        process_pool.multiprocessing,
        "get_all_start_methods",
        lambda: ["fork", "spawn", "forkserver"],
    )

    assert process_pool.get_process_pool_start_method() == "spawn"
