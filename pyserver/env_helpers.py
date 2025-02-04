from trilogy import Environment
from io_models import (
    ModelInSchema,
)

from trilogy.core.models.environment import DictImportResolver, EnvironmentOptions

PARSE_DEPENDENCY_RESOLUTION_ATTEMPTS = 10


def parse_env_from_full_model(input: ModelInSchema | None) -> Environment:
    if not input:
        return Environment()
    resolver = DictImportResolver(
        content={source.alias: source.contents for source in input.sources}
    )
    env = Environment(config=EnvironmentOptions(import_resolver=resolver))

    return env
