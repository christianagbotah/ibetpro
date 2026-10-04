# Market-Movement Research Specification

## Purpose

Static team/form/core-stat features did not demonstrate an incremental pre-match 1X2 edge beyond bookmaker consensus. The next research family adds **causal market movement** rather than weakening the existing promotion gates.

## Causal rule

Every movement feature for a prediction timestamp `asOf` may use only consensus snapshots whose `capturedAt <= asOf`.

No closing price, later snapshot, final result, or post-kickoff market observation may be joined backward into an earlier prediction.

## Online feature definitions

For each match and `asOf`:

- `market_snapshot_count`: number of consensus snapshots available by `asOf`.
- `market_history_minutes`: minutes between the earliest available consensus snapshot and latest snapshot at/before `asOf`.
- `home_market_prob_move_open`, `draw_market_prob_move_open`, `away_market_prob_move_open`: current normalized probability minus earliest normalized probability.
- `market_overround_move_open`: current raw implied-probability sum minus opening sum.
- `*_market_prob_move_6h`: current normalized probability minus the latest snapshot at or before `asOf - 6h`.
- `*_market_prob_move_24h`: current normalized probability minus the latest snapshot at or before `asOf - 24h`.

If the required historical snapshot does not exist, the feature is null and must be imputed from training-only statistics. It must not be backfilled with a future snapshot.

## Collection cadence

The production Odds API path already retains a consensus snapshot on each paid odds refresh.

Current default paid refresh interval is six hours. At that cadence:

- 2 snapshots establish basic direction.
- ~6h gives one short-window movement observation.
- ~24h gives a more stable pre-match movement history.
- repeated snapshots across many fixtures allow calibration of movement effects without using post-hoc closing prices.

The admin research-readiness endpoint tracks:

- fresh-consensus coverage;
- 2+ snapshot coverage;
- 6h history coverage;
- 24h history coverage;
- 48h history coverage;
- league-level 24h coverage.

Initial research-readiness floor:

- at least 20 upcoming fixtures;
- at least 90% with 2+ snapshots;
- at least 75% with 24h history.

This readiness flag means the live collection mechanism is mature enough to inspect. It does **not** by itself authorize model training or promotion.

## Training corpus requirement

A market-movement candidate may be trained only from historical rows that reproduce the same timestamp semantics. Acceptable sources include:

1. timestamped bookmaker/consensus snapshots captured by iBetPro itself;
2. a provider that supplies historical odds snapshots with reliable timestamps;
3. an external historical dataset where each quote's availability time is explicit.

A generic "closing odds" column must not be treated as a 6h/24h causal snapshot for predictions made earlier than closing time.

## Evaluation

Movement candidates use the existing protocol:

1. chronological train/calibration/test split;
2. training-only imputation;
3. market consensus benchmark on the identical test rows;
4. bootstrap confidence interval for candidate-minus-market Log Loss;
5. selective deviation policy learned only from calibration data;
6. minimum selective coverage gate;
7. untouched 2025/26 holdout only after all pre-holdout gates pass.

## Production behavior

Until market-movement evidence passes those gates:

- fresh market consensus remains the pre-match 1X2 baseline;
- expected goals and score-derived markets remain model-derived;
- no movement feature is allowed to create a user-facing "AI edge";
- selective deviations remain disabled unless a promoted artifact contains a validated policy.

## Why this is different from the closed core-stats track

Market movement adds genuinely new time-series information: how collective pricing changes as kickoff approaches. It is not a new weighting of the same form, ELO, shots, corners, cards, venue, and static market features that already failed to establish repeatable incremental 1X2 information.
