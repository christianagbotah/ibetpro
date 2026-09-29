# Core-Stats Research Decision — 2026-09-28

## Decision

The current public-data `core_stats` model family is **not eligible for shadow promotion**.

For pre-match 1X2, iBetPro will use fresh normalized market consensus as the evidence-backed interim baseline. Goal/score-derived markets remain model-derived and clearly identified.

The untouched 2025/26 holdout remains sealed.

## Evidence

### Pooled Premier League + La Liga

Three chronological walk-forward test seasons were evaluated:

- 2022/23
- 2023/24
- 2024/25

The selective-deviation policy authorized **0 model rows out of 2,280** test fixtures. All 2,280 fixtures correctly abstained to market consensus because no calibration divergence band had both adequate sample size and a bootstrap confidence interval fully below zero.

The pooled core-stats model therefore showed no demonstrated incremental 1X2 information beyond the market.

### League-specific models

Premier League and La Liga were then trained separately under the same chronological protocol.

Neither league produced a statistically validated selective band. Candidate-looking divergence regions sometimes had negative mean Log Loss deltas, but their 95% bootstrap confidence intervals crossed zero. They were correctly rejected.

Examples from the league-specific evidence:

- Premier League 2023/24: candidate Log Loss 0.927827 vs market 0.909250, so the candidate was materially worse.
- La Liga 2024/25: candidate Log Loss 0.954943 vs market 0.953199, again worse.
- La Liga calibration bands with apparent improvements such as roughly -0.009 Log Loss still had confidence intervals crossing zero and were therefore disabled.

### Over/Under 2.5

The goal-model-derived Over/Under 2.5 probabilities also failed to beat the historical market consistently. In the pooled three-fold study, the average goal-model minus totals-market Log Loss delta was approximately +0.0499, with zero folds beating the market.

## What this means

More threshold tuning, model-family swapping, or league reshuffling on the same static feature family is unlikely to be a productive next step and creates overfitting risk.

The next research phase should add genuinely new causal information:

1. timestamped consensus odds movement;
2. richer fixture-level xG and event statistics;
3. confirmed lineups, injuries and suspensions;
4. manager/context changes where timestamp provenance is available;
5. larger league-specific historical samples only where the same feature semantics can be reproduced online.

## Production policy

Until a candidate passes the pre-holdout gates:

- fresh market consensus is the authoritative 1X2 baseline;
- Poisson remains responsible for expected goals, scoreline distributions and derived goal markets;
- selective model deviations remain disabled unless a calibration-trained band passes sample-size, effect-size and bootstrap-confidence requirements;
- no candidate is promoted merely because its accuracy is higher;
- the 2025/26 untouched holdout is not opened.

## Promotion sequence

`research candidate -> chronological walk-forward -> market/ELO gates -> selective coverage gate -> untouched holdout -> shadow -> settled shadow evidence -> active`

Any failure returns the candidate to research without weakening the gate.
