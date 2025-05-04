from trilogy.authoring import Concept


def concept_to_description(concept: Concept) -> str | None:
    base = f"Derivation: {str(concept.lineage)}. " if concept.lineage else None
    if concept.metadata:
        base = (
            base + str(concept.metadata.description)
            if base
            else str(concept.metadata.description)
        )

    return base
