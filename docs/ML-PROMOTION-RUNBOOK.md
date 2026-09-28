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
- chronological training
- XGBoost training execution
- calibration
- promotion acceptance/rejection rules
- artifact bundle integrity

## 2. Run the real historical experiment

Use the GitHub Actions workflow:

`iBetPro Real Model Experiment`

The default run collects fixture-level historical results only. Enabling detailed per-fixture statistics/odds can use substantially more provider quota.

The workflow:
1. validates the ML suite
2. collects the configured historical corpus
3. merges and quality-checks the corpus
4. builds leak-safe features
5. trains the XGBoost candidate
6. evaluates ELO and market baselines
7. applies promotion gates
8. renders an experiment report
9. uploads the evidence bundle

A rejected candidate is a valid experiment outcome and must not be manually promoted.

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

Passing means **eligible for shadow**, not active production.

## 4. Install candidate artifacts

Place the complete candidate bundle in a dedicated directory on the ML host and set:

```
IBETPRO_MODEL_DIR=/absolute/path/to/model
```

The service verifies required files and SHA-256 checksums before loading.

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
- candidate vs baseline log loss
- candidate vs baseline Brier score
- accuracy as a secondary metric
- model stability across leagues and time windows
- material baseline/candidate probability divergence
- data completeness

## 7. Active mode

Only after the candidate has passed the research and shadow checks, intentionally set:

```
ML_MODEL_MODE=active
```

Active mode uses the trained model when its service/artifact contract is valid and falls back to the baseline if the ML service is unavailable.

## Rollback

Set:

```
ML_MODEL_MODE=baseline
```

and restart/reload the web application. This immediately removes the trained model from the user-facing prediction path without deleting research evidence.
