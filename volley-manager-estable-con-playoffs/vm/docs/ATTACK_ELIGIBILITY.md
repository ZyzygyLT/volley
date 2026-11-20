# Attack eligibility and tactical families

## Purpose

This document separates what the current simulator actually represents from volleyball rules and from tactical concepts that are not yet modeled. It is a design contract for the next engine increment, not a claim that the current attack selection is already tactically realistic.

## 1. What the current engine represents

The six-player `Team.lineup` is ordered by rotational zone:

| Index | Court zone | Current `AttackOption.zone` |
|---:|---|---|
| 0 | 1 (back-right) | `backrow` |
| 1 | 6 (back-middle) | `backrow` |
| 2 | 5 (back-left) | `backrow` |
| 3 | 4 (front-left) | `front` |
| 4 | 3 (front-middle) | `front` |
| 5 | 2 (front-right) | `front` |

The lineup rotates when the receiving team wins the rally. These indices therefore describe the current rotational zones, not permanent player positions.

The current `buildAttackOptions` policy is:

| Current zone | Roles eligible | Notes |
|---|---|---|
| Front row | S, OH, MB, OP | Only if `params.atkWeight[role] > 0` and the resulting weight is positive. A front-row setter is intentionally eligible. |
| Back row | OH, OP | Central blockers and setters are excluded, preserving the previous inline selection policy. |
| Libero | None | The libero is stored separately and is not part of `lineup`; its role also has no positive attack weight. |

Each option now has a `kind` classification:
- `hitter-attack`: a non-setter attack option in the legacy model.
- `setter-attack-legacy`: the existing model allows a front-row setter to be selected as the attacker.

The second label is deliberately explicit about its limitation. It is **not** a modeled setter dump, second-ball attack, or tactical choice by the setter. The rally still selects it through the same historical weighted draw as any other option. This tag is descriptive metadata only and does not change weights, RNG consumption, or outcomes.

The option weight preserves the legacy calculation:

- role attack weight;
- player attack rating relative to 70;
- a 0.45 multiplier for back-row options;
- a 0.3 middle-blocker penalty when continuous reception quality is below 0.5 (front-row MBs only, because back-row MBs are not eligible).

The engine currently selects an attacker probabilistically from these weights. It does not ask the setter to choose a set, tempo, combination, or target.

## 2. Volleyball rules versus current abstraction

A back-row player may attack from behind the attack line, subject to the applicable take-off and net-height rules. A front-row player may complete an attack from the front zone. The current engine does not represent the take-off point, attack-line infringement, jump, contact height, or whether a back-row attack was completed illegally.

Consequently, `front` and `backrow` currently mean **rotational row**, not a fully validated legal attack trajectory. The current back-row role filter is a legacy modeling restriction, not a statement of the official rules.

The libero is not currently an attack option. Future libero rules must distinguish an attack completed while the ball is entirely above the net, a front-zone overhand finger pass and the resulting teammate attack; a simple role exclusion cannot model all those constraints.

## 3. Tactical families: what is and is not inferable

| Tactical family | What it requires | Can current state establish availability? |
|---|---|---|
| High/outside ball | A set with sufficient height and travel to an outside hitter or opposite | No. There is no set trajectory, height, tempo, or target. |
| Quick / first-tempo middle | A sufficiently precise and fast set, middle approach timing, and setter-attacker coordination | No. MB role and reception quality alone are insufficient. |
| Back-row pipe | An eligible back-row attacker, a set to the pipe lane, and a legal take-off behind the attack line | Only the rotational row and broad OH/OP eligibility are represented. Lane, set, take-off, and legality are absent. |
| Back-row D / other opposite attack | A suitable opposite approach and set location behind the attack line | No. The current option is only an abstract back-row attacker. |
| Combination / tandem | Coordinated approaches by multiple attackers and a set that manipulates the block | No. There are no coordinated approaches or decoy commitments. |
| Setter dump / second-ball attack | Setter location, contact opportunity, ball state, and tactical choice | No. The legacy setter option is only an attacker selected by the generic weighted draw; it has no second-touch state or dump action. |

Do not label an option as a quick, high ball, pipe, D, combination, or dump until the engine contains the state needed to support that label.

## 4. Safe implementation sequence

1. Keep the existing attacker eligibility and weights unchanged while adding characterization tests for all six rotation indices and each role.
2. Keep legacy setter attacks explicitly distinguishable from hitter attacks; do not silently reinterpret the legacy option as a setter dump.
3. Add an explicit set/distribution decision as a separate pure function. Its inputs must describe the actual setter, rotation, reception and available attackers; its output must describe a set choice rather than silently changing attacker weights.
4. Introduce set families only when the model can represent their prerequisites (at minimum set tempo/trajectory and target lane).
5. Resolve attack execution separately from the set decision, then model block matchup and defensive response.
6. Add event attribution and statistics only with explicit event contracts and save compatibility tests.

## 5. Non-regression requirements

- Preserve deterministic seeded outcomes unless a deliberate behavior change is separately approved and calibrated.
- Keep attack-option eligibility and legacy weights unchanged during the characterization/documentation phase.
- Do not change persisted match or save schemas for this phase.
- Test rotations, role eligibility, positive weights, and the front-row setter case.
- Keep measured observations, literature-derived assumptions, and design parameters clearly distinguished in calibration notes.
