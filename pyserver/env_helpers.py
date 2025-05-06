from trilogy import Environment
from io_models import (
    ModelInSchema,
    Model,
    UIConcept,
    UIDatasource,
    ModelSource,
    ModelSourceInSchema,
)
from common import concept_to_description
from trilogy.parsing.parse_engine import ParseError
from trilogy.core.models.environment import DictImportResolver, EnvironmentOptions
from trilogy.authoring import (
    Concept,
)
from trilogy.core.enums import ConceptSource
from trilogy.core.models.datasource import Address

from common import flatten_lineage
PARSE_DEPENDENCY_RESOLUTION_ATTEMPTS = 10





def parse_env_from_full_model(sources: list[ModelSourceInSchema]) -> Environment:
    if not sources:
        return Environment()

    resolver = DictImportResolver(
        content={source.alias: source.contents for _, source in enumerate(sources)}
    )
    env = Environment(config=EnvironmentOptions(import_resolver=resolver))

    return env


def concept_to_ui_concept(concept: Concept) -> UIConcept:
    return UIConcept(
        name=concept.name,
        datatype=concept.datatype,
        purpose=concept.purpose,
        description=concept_to_description(concept),
        namespace=concept.namespace or "",
        address=concept.address,
        lineage=flatten_lineage(concept, depth=0),
        keys=list(concept.keys) if concept.keys else [],
    )


def source_to_model_source(
    source: ModelSourceInSchema, sources: list[ModelSourceInSchema]
) -> ModelSource:
    final_concepts: list[UIConcept] = []
    final_datasources: list[UIDatasource] = []
    env = parse_env_from_full_model(sources)
    try:
        env.parse(source.contents)
    except Exception as e:
        raise ParseError(
            f"Unable to process file '{source.alias}', parsing error: {e}"
        ) from e

    for skey, sconcept in env.concepts.items():
        # don't show private concepts
        if sconcept.name.startswith("_"):
            continue
        if "__preql_internal" in sconcept.address:
            continue
        if (
            sconcept.metadata
            and sconcept.metadata.concept_source == ConceptSource.AUTO_DERIVED
        ):
            continue
        final_concepts.append(concept_to_ui_concept(sconcept))
    final_concepts.sort(key=lambda x: x.address)

    for dkey, datasource in env.datasources.items():
        dconcepts: list[UIConcept] = []
        for cref in datasource.concepts:
            # don't show private concepts
            if cref.name.startswith("_"):
                continue

            sconcept = env.concepts[cref.address]
            dconcepts.append(concept_to_ui_concept(sconcept))
        dconcepts.sort(key=lambda x: x.address)
        if isinstance(datasource.address, Address):
            final_address = datasource.address.location
        else:
            final_address = datasource.address

        final_datasources.append(
            UIDatasource(
                name=dkey,
                location=final_address,
                concepts=dconcepts,
                grain=[
                    concept_to_ui_concept(env.concepts[x])
                    for x in datasource.grain.components
                ],
            )
        )
    return ModelSource(
        alias=source.alias, concepts=final_concepts, datasources=final_datasources
    )


def model_to_response(model: ModelInSchema) -> Model:
    return Model(
        name=model.name,
        sources=[
            source_to_model_source(source, model.sources) for source in model.sources
        ],
    )
