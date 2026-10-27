# Symptom checker

A knowledge-based checker for pig and poultry diseases. The user selects the clinical signs
they see (plus, optionally, the age group and whether there have been sudden or unusually
high deaths); the checker ranks the diseases whose published descriptions best match those
signs, explains every match and tells the user when a disease must be reported.

It is **not** a trained model and **not** a diagnosis. It was built because no genuine,
openly licensed dataset of confirmed pig or poultry cases from India was available to train
on (the earlier screening model was trained on synthetic data only; see
[model-limitations](model-limitations.md)). Instead, the knowledge base encodes what
published veterinary references say, and the application collects veterinarian-confirmed
diagnoses so that a real model can be trained once enough cases exist.

## Knowledge base

`backend/app/services/symptoms/knowledge.py`, version `2026.10-draft`,
status **pending veterinary review**.

| Species | Conditions | Signs | Reportable conditions flagged |
|---|---|---|---|
| Pig | 14 | 33 | African swine fever, classical swine fever, foot-and-mouth disease |
| Poultry | 13 | 31 | Avian influenza, Newcastle disease |

Each condition records: the signs with a weight (3 = characteristic, 2 = common,
1 = sometimes seen), typical age groups, category (infectious / parasitic / management),
whether it is reportable, whether it can infect people, a one-line summary, recommended
actions, and its sources.

Sources (linked on every result and in the disease library):

* WOAH (World Organisation for Animal Health) disease technical cards — ASF, CSF, FMD,
  avian influenza, Newcastle disease, PRRS.
* Merck Veterinary Manual (online edition).
* Zimmerman J. J. et al., *Diseases of Swine*, 11th ed., Wiley-Blackwell, 2019.
* Swayne D. E. (ed.), *Diseases of Poultry*, 14th ed., Wiley-Blackwell, 2020.

The sign lists and weights are a **summary written for this project** from those sources;
they have not yet been reviewed by a veterinarian. Review by the Department's veterinary
officers is the first step before any field use.

## Scoring (`engine.py`)

For each disease that shares at least one sign with the selection:

```
coverage  = weight of matched signs / total weight of the disease's signs
precision = matched signs / signs selected
score     = 0.6 × coverage + 0.4 × precision
          + 0.10 if a characteristic (weight 3) sign matched
          + 0.05 if the age group is typical (−0.05 if not)
          + 0.05 if sudden high deaths were reported and the disease is known for them
```

The score is shown as a match index out of 100 with a strength band (strong ≥ 60,
moderate ≥ 35, weak < 35). It is **not a probability**. If any reportable disease scores
moderate or higher, the result starts with a "Report immediately" warning naming it.

The five closest matches are returned with the matched signs, the important signs not yet
selected ("also look for"), actions and sources.

## Where it appears

| Place | Who | Stores anything? |
|---|---|---|
| `/check` (public) and the landing-page "Try it now" panel | anyone | No |
| `/diseases` disease library (public) | anyone | No |
| `/symptom-checker` and a farm's *Symptom checks* tab | signed-in users | Yes, if "Check and save to records" is used |

## API

```
GET  /api/v1/public/symptom-library            signs, age groups, diseases, counts
POST /api/v1/public/symptom-check              {species, signs[], age_group?, sudden_deaths?}
POST /api/v1/symptom-checks                    same + farm_id?, animal_identifier? (saved)
GET  /api/v1/symptom-checks?farm_id&confirmed  scoped to the user's farms
POST /api/v1/symptom-checks/{id}/confirm       admin / veterinarian: diagnosis, method, notes
GET  /api/v1/symptom-checks/export             admin: CSV of confirmed cases, no identifiers
```

## Path to a real model

1. Farmers and veterinarians save checks against farms.
2. A veterinarian records the confirmed diagnosis and how it was confirmed
   (clinical examination, laboratory test or post-mortem).
3. An administrator exports the confirmed cases as CSV (no names, farms or animal IDs).
4. `backend/scripts/train_from_confirmed_cases.py` trains a logistic-regression classifier
   with stratified cross-validation. It **refuses to train** until at least two diagnoses
   have 30 or more confirmed cases each, and writes its cross-validated metrics next to the
   model so the result can be judged honestly.

## Limitations

* Many diseases share signs (ASF, CSF and erysipelas especially); the ranking cannot
  separate them reliably — that needs a veterinarian and usually a laboratory.
* Only the listed conditions are considered; anything else gives a weak or no match.
* Weights are judgement-based summaries of the literature, not estimated from data.
* Prevalence in Haveri is not used, because no reliable local prevalence data was available.
