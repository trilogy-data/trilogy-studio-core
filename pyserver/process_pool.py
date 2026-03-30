import asyncio
import os
import sys
from concurrent.futures import Executor, ProcessPoolExecutor, ThreadPoolExecutor
from functools import partial
from logging import getLogger
from multiprocessing import get_context
import time
from typing import Any, Callable, TypeVar

T = TypeVar("T")

_executor: Executor | None = None
_semaphore: asyncio.Semaphore | None = None
_aux_executor: Executor | None = None
_aux_semaphore: asyncio.Semaphore | None = None
perf_logger = getLogger("trilogy.performance")


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


def get_aux_pool_size() -> int:
    configured = os.getenv("TRILOGY_AUX_POOL_SIZE")
    if configured:
        return max(1, int(configured))
    return max(2, get_process_pool_size())


def get_aux_pool_queue_limit(worker_count: int) -> int:
    configured = os.getenv("TRILOGY_AUX_POOL_QUEUE_LIMIT")
    if configured:
        return max(worker_count, int(configured))
    return worker_count * 4


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
    global _executor, _semaphore, _aux_executor, _aux_semaphore
    if (
        _executor is not None
        and _semaphore is not None
        and _aux_executor is not None
        and _aux_semaphore is not None
    ):
        return

    if _executor is None or _semaphore is None:
        worker_count = get_process_pool_size()
        if _use_thread_pool():
            _executor = ThreadPoolExecutor(max_workers=worker_count)
        else:
            _executor = ProcessPoolExecutor(
                max_workers=worker_count,
                mp_context=get_context("spawn"),
            )
        _semaphore = asyncio.Semaphore(get_process_pool_queue_limit(worker_count))

    if _aux_executor is None or _aux_semaphore is None:
        aux_worker_count = get_aux_pool_size()
        _aux_executor = ThreadPoolExecutor(max_workers=aux_worker_count)
        _aux_semaphore = asyncio.Semaphore(get_aux_pool_queue_limit(aux_worker_count))


async def shutdown_process_pool() -> None:
    global _executor, _semaphore, _aux_executor, _aux_semaphore
    executor = _executor
    aux_executor = _aux_executor
    _executor = None
    _semaphore = None
    _aux_executor = None
    _aux_semaphore = None
    if executor is not None:
        await asyncio.to_thread(executor.shutdown, True, cancel_futures=True)
    if aux_executor is not None:
        await asyncio.to_thread(aux_executor.shutdown, True, cancel_futures=True)


async def _run_with_executor(
    pool_name: str,
    executor: Executor | None,
    semaphore: asyncio.Semaphore | None,
    func: Callable[..., T],
    *args: Any,
    **kwargs: Any,
) -> T:
    if executor is None or semaphore is None:
        init_process_pool()
        if pool_name == "cpu":
            executor = _executor
            semaphore = _semaphore
        else:
            executor = _aux_executor
            semaphore = _aux_semaphore

    assert executor is not None
    assert semaphore is not None

    request_start = time.perf_counter()
    async with semaphore:
        queue_wait = time.perf_counter() - request_start
        loop = asyncio.get_running_loop()
        bound = partial(func, *args, **kwargs)
        execution_start = time.perf_counter()
        result = await loop.run_in_executor(executor, bound)
        execution_time = time.perf_counter() - execution_start
        total_time = time.perf_counter() - request_start
        perf_logger.info(
            "%s dispatch - Func: %s | Queue wait: %.6fs | "
            "Executor run: %.6fs | Total: %.6fs",
            pool_name.upper(),
            getattr(func, "__name__", repr(func)),
            queue_wait,
            execution_time,
            total_time,
        )
        return result


async def run_cpu_bound(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    return await _run_with_executor("cpu", _executor, _semaphore, func, *args, **kwargs)


async def run_aux_task(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    return await _run_with_executor(
        "aux", _aux_executor, _aux_semaphore, func, *args, **kwargs
    )
