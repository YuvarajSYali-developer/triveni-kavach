"""Ranks diseases by how well the observed signs match the knowledge base.

The score is a transparent match index (0–100), not a probability:
    coverage  = weight of matched signs / total weight of the disease's signs
    precision = matched signs / signs the user selected
    score     = 0.6 * coverage + 0.4 * precision
              + 0.10 if a characteristic (weight 3) sign matched
              + 0.05 if the age group is typical for the disease (-0.05 if not)
              + 0.05 if sudden high deaths were reported and the disease is known for them
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.services.symptoms import knowledge as kb

STRONG, MODERATE = 60, 35
DISCLAIMER = (
    "This checker compares the signs you selected with published descriptions of diseases. It is not a diagnosis. "
    "Several diseases share the same signs, and confirming any of them usually needs a veterinarian and often a laboratory test."
)


class CheckError(ValueError):
    pass


@dataclass
class Match:
    disease: dict
    score: int
    matched: list[str]
    missing_characteristic: list[str]
    strength: str
    notes: list[str] = field(default_factory=list)


def species_list() -> list[str]:
    return list(kb.DISEASES)


def check(species: str, signs: list[str], age_group: str | None = None, sudden_deaths: bool = False, top_k: int = 5) -> dict:
    if species not in kb.DISEASES:
        raise CheckError(f"Species must be one of: {', '.join(kb.DISEASES)}.")
    index = kb.sign_index(species)
    signs = list(dict.fromkeys(signs))
    unknown = [s for s in signs if s not in index]
    if unknown:
        raise CheckError(f"Unknown sign(s) for {species}: {', '.join(unknown)}.")
    if not signs:
        raise CheckError("Select at least one sign.")
    ages = {a for a, _ in kb.AGE_GROUPS[species]}
    if age_group is not None and age_group not in ages:
        raise CheckError(f"Age group must be one of: {', '.join(sorted(ages))}.")

    selected = set(signs)
    matches: list[Match] = []
    for d in kb.DISEASES[species]:
        dsigns: dict[str, int] = d["signs"]
        matched = [s for s in signs if s in dsigns]
        if not matched:
            continue
        coverage = sum(dsigns[s] for s in matched) / sum(dsigns.values())
        precision = len(matched) / len(selected)
        score = 0.6 * coverage + 0.4 * precision
        notes = []
        if any(dsigns[s] == 3 for s in matched):
            score += 0.10
        if age_group:
            if age_group in d["ages"]:
                score += 0.05
            else:
                score -= 0.05
                notes.append("Less typical for this age group.")
        if sudden_deaths and d["high_mortality"]:
            score += 0.05
        pct = max(0, min(100, round(score * 100)))
        missing = [index[s] for s, w in sorted(dsigns.items(), key=lambda kv: -kv[1]) if w >= 2 and s not in selected][:4]
        strength = "strong" if pct >= STRONG else "moderate" if pct >= MODERATE else "weak"
        matches.append(Match(d, pct, [index[s] for s in matched], missing, strength, notes))

    matches.sort(key=lambda m: (-m.score, m.disease["name"]))
    top = matches[:top_k]
    urgent = [m.disease["name"] for m in matches if m.disease["urgent_report"] and m.score >= MODERATE]
    return {
        "species": species,
        "kb_version": kb.KB_VERSION,
        "review_status": kb.REVIEW_STATUS,
        "selected_signs": [index[s] for s in signs],
        "results": [
            {
                "disease_id": m.disease["id"],
                "name": m.disease["name"],
                "match_score": m.score,
                "strength": m.strength,
                "category": m.disease["category"],
                "urgent_report": m.disease["urgent_report"],
                "zoonotic": m.disease["zoonotic"],
                "summary": m.disease["summary"],
                "matched_signs": m.matched,
                "also_check_for": m.missing_characteristic,
                "actions": m.disease["actions"],
                "notes": m.notes,
                "sources": [{"title": kb.SOURCES[s][0], "url": kb.SOURCES[s][1]} for s in m.disease["sources"]],
            }
            for m in top
        ],
        "urgent_warning": (
            f"The signs are consistent with {', '.join(urgent)}, which must be reported. Contact the government veterinary "
            "officer immediately and stop all movement of animals and products."
            if urgent
            else None
        ),
        "general_advice": [
            "Isolate sick animals and limit visitors until a veterinarian has examined them.",
            "Record deaths (including zero-death days) and the signs you see in Triveni Kavach.",
        ],
        "disclaimer": DISCLAIMER,
        "no_match": not top,
    }


def library(species: str | None = None) -> dict:
    sp = [species] if species else list(kb.DISEASES)
    out = {}
    for s in sp:
        if s not in kb.DISEASES:
            raise CheckError(f"Unknown species {s}.")
        index = kb.sign_index(s)
        out[s] = {
            "signs": [
                {"group": g, "items": [{"id": i, "label": label, "help": h} for i, label, h in items]}
                for g, items in kb.SIGNS[s].items()
            ],
            "age_groups": [{"id": a, "label": label} for a, label in kb.AGE_GROUPS[s]],
            "diseases": [
                {
                    "id": d["id"],
                    "name": d["name"],
                    "category": d["category"],
                    "urgent_report": d["urgent_report"],
                    "zoonotic": d["zoonotic"],
                    "summary": d["summary"],
                    "actions": d["actions"],
                    "signs": [{"label": index[k], "weight": w} for k, w in sorted(d["signs"].items(), key=lambda kv: -kv[1])],
                    "ages": d["ages"],
                    "sources": [{"title": kb.SOURCES[x][0], "url": kb.SOURCES[x][1]} for x in d["sources"]],
                }
                for d in kb.DISEASES[s]
            ],
        }
    return {
        "kb_version": kb.KB_VERSION,
        "review_status": kb.REVIEW_STATUS,
        "species": out,
        "counts": {s: len(kb.DISEASES[s]) for s in kb.DISEASES},
        "sign_counts": {s: len(kb.sign_index(s)) for s in kb.DISEASES},
    }
