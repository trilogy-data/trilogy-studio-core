import asyncio
import os
import sys
from concurrent.futures import Executor, ProcessPoolExecutor, ThreadPoolExecutor
from functools import partial
from multiprocessing import get_context
from typing import Any, Callable, TypeVar

T = TypeVar("T")

_executor: Executor | None = None
_semaphore: asyncio.Semaphore | None = None


def get_process_pool_size() -> int:
    configured = os.getenv("TRILOGY_PROCESS_POOL_SIZE")
    if configured:
        return max(1, int(configured))
    return max(1, min(os.cpu_count() or 1, 4))


def get_process_pool_queue_limit(worker_count: int) -> int:
    configured = os.getenv("TRILOGY_PROCESS_POOL_QUEUE_LIMIT")
    if configured:
        return max(worker_count, int(configured))
    return worker_count * 2


def _use_thread_pool() -> bool:
    main_module = sys.modules.get("__main__")
    main_path = getattr(main_module, "__file__", "")
    return (
        os.getenv("TRILOGY_POOL_MODE") == "thread"
        or "PYTEST_CURRENT_TEST" in os.environ
        or "pytest" in sys.modules
        or "pytest" in " ".join(sys.argv).lower()
        or not main_path
        or str(main_path).startswith("<")
    )


def init_process_pool() -> None:
    global _executor, _semaphore
    if _executor is not None and _semaphore is not None:
        return

    worker_count = get_process_pool_size()
    if _use_thread_pool():
        _executor = ThreadPoolExecutor(max_workers=worker_count)
    else:
        _executor = ProcessPoolExecutor(
            max_workers=worker_count,
            mp_context=get_context("spawn"),
        )
    _semaphore = asyncio.Semaphore(get_process_pool_queue_limit(worker_count))


async def shutdown_process_pool() -> None:
    global _executor, _semaphore
    executor = _executor
    _executor = None
    _semaphore = None
    if executor is not None:
        await asyncio.to_thread(executor.shutdown, True, cancel_futures=True)


async def run_cpu_bound(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    if _executor is None or _semaphore is None:
        init_process_pool()

    assert _executor is not None
    assert _semaphore is not None

    async with _semaphore:
        loop = asyncio.get_running_loop()
        bound = partial(func, *args, **kwargs)
        return await loop.run_in_executor(_executor, bound)
