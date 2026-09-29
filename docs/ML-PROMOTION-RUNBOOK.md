# iBetPro ML Promotion Runbook

## Safety principle

A successful training job does **not** make a model production-ready. The allowed progression is:

```
candidate -> research gates -> shadow -> settled-match evaluation -> active
```

The default application mode is `baseline`.

## 1. Run normal CI

Both web and ML jobs must pass before running a real experiment.

The ML test suite validates:
- current-fixture leakage protection
- chronological training and walk-forward horizons
- candidate training/calibration execution
- bookmaker-market and ELO comparisons
- selective deviation policy behavior
- cross-season approval requirements
- licensed provider mapping and causal odds joins
- paid historical-odds planning/credit estimation
- promotion acceptance/rejection rules
- artifact bundle checksums and shadow packaging

## 2. Use the licensed commercial experiment path

For production-oriented research use:

`iBetPro Licensed Model Experiment`

The initial supported competition pair is:
- Sportmonks Premier League league ID `8`
- The Odds API sport key `soccer_epl`

The workflow is manual-only and begins with historical-odds execution disabled.

Required repository secret:
- `SPORTMONKS_API_TOKEN`

Required only when paid historical odds execution is enabled:
- `ODDS_API_KEY`

The safe sequence is:
1. validate the ML test suite before provider calls
2. validate the Sportmonks ↔ Odds API competition pair
3. collect licensed Sportmonks historical fixture/stat context
4. verify every walk-forward fold has sufficient history
5. generate a historical Odds API call plan
6. review planned calls and worst-case credit estimate
7. rerun with paid execution enabled only after the plan is accepted
8. causally join only odds snapshots captured before kickoff
9. enforce enriched-stat plus opening/near-kickoff market coverage gates
10. build leak-safe features
11. run chronological multi-season walk-forward evaluation
12. identify only divergence bands with repeatable market-relative edge
13. package a shadow candidate only when cross-season approval exists
14. upload the complete evidence bundle

Historical odds use the featured historical endpoint. The dry run estimates the maximum credit requirement and the executed collector records observed usage headers.

A rejected candidate—or a run with zero stable selective bands—is a valid experiment outcome and must not be manually promoted.

### Public-data workflows

Public Football-Data/OpenFootball experiments are research benchmarks only. Do not use those free datasets as the commercial production-training corpus unless their applicable license explicitly permits the intended use.

## 3. Review research gates

A candidate must pass the configured checks for:
- multiclass log loss
- multiclass Brier score
- accuracy floor
- Expected Calibration Error
- Ranked Probability Score
- home/away goal MAE
- ELO baseline comparison
- bookmaker market baseline comparison when market coverage exists

Passing a single candidate test is not enough. A selective candidate becomes **eligible for shadow** only when its approved divergence band(s) demonstrate the required market-relative edge across every configured walk-forward fold and the shadow packager successfully verifies the artifact bundle.

## 4. Install candidate artifacts

Place the complete candidate bundle in a dedicated directory on the ML host and set:

```
IBETPRO_MODEL_DIR=/absolute/path/to/model
```

The service verifies required files and SHA-256 checksums before loading.

For selective models, use the generated `shadow-candidate` package rather than copying a raw fold directory. The package contains the mechanically stamped cross-season approval and a shadow manifest. A policy that merely exists in metadata is ignored by live inference unless that approval is present.

## 5. Enable shadow mode

Set on the web application:

```
ML_MODEL_MODE=shadow
```

In shadow mode:
- users continue receiving the baseline prediction
- the trained candidate runs through the strict candidate endpoint
- candidate failures never silently become baseline candidate results
- baseline/candidate comparisons are persisted
- settled outcomes are evaluated in the admin Model Research dashboard

Do not switch to active mode from training metrics alone.

## 6. Shadow evaluation

Use the authenticated endpoint:

`GET /api/admin/ml/shadow`

and the Admin → Model Research card.

The system currently flags 200 settled shadow matches as the minimum useful research sample. This is a floor, not proof of production quality.

Review:
- candidate vs baseline and market Log Loss
- candidate vs baseline Brier score
- RPS and ECE/calibration
- home/away goal MAE
- accuracy as a secondary metric
- model stability across leagues and time windows
- selective deviation rate and approved divergence bands
- market-consensus freshness and coverage
- material baseline/candidate probability divergence
- data completeness and imputation rate

## 7. Active mode

Only after the candidate has passed the research and shadow checks, intentionally set:

```
ML_MODEL_MODE=active
```

Active mode uses the trained model only when its service/artifact contract is valid. An approved selective model additionally requires genuine, sufficiently fresh market consensus for the fixture; otherwise it falls back to the Poisson baseline rather than serving an unapproved global-model deviation.

## Rollback

Set:

```
ML_MODEL_MODE=baseline
```

and restart/reload the web application. This immediately removes the trained model from the user-facing prediction path without deleting research evidence.
