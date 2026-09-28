# iBetPro Production Foundation

## Decision

Build on the existing root application. Do not restart from scratch.

The root app already contains useful product and infrastructure work: Next.js/React UI, Prisma/MySQL, authentication, match ingestion, live fixture support, analysis screens, broker abstractions, notifications, admin tooling, monitoring, and deployment configuration.

The nested `ibetpro/` application appears to duplicate substantial portions of the root application. It must be reconciled before removal; no destructive deletion should happen until file-by-file comparison confirms the root app contains all required functionality.

## Product target

iBetPro should be a simple mobile-first football intelligence product with:

- responsive web portal
- iOS and Android clients sharing API contracts and design tokens
- live and upcoming matches
- provider/bookmaker filtering
- match detail analysis
- calibrated 1X2 probabilities
- expected home/away goals
- scoreline probability distribution
- totals, BTTS, double chance, DNB, team totals and handicap probabilities
- model confidence and data-quality indicators
- transparent evidence/reasoning
- historical prediction tracking and calibration monitoring

Predictions must be presented as probabilities, not guarantees.

## Target architecture

### Web
- Next.js app router
- shared TypeScript domain contracts
- responsive/PWA-capable UI

### Mobile
- React Native with Expo
- shared API client, schemas, domain types and selected UI tokens
- native navigation and push notifications

### Core API
The existing Next.js API can continue serving product/auth/admin functions initially. Prediction serving should be isolated behind a versioned contract so it can move independently.

### Data
- PostgreSQL is preferred for the long-term analytics/model platform because of stronger analytical capabilities, JSONB, extensions and time-series tooling.
- Existing MySQL can remain during the first refactor if changing databases would slow validation.
- Redis for caching/live-state/queues.
- Object storage for raw historical datasets, feature snapshots and model artifacts.

### ML service
A separate Python service is recommended for training and inference:
- FastAPI
- Polars/Pandas
- LightGBM/XGBoost/CatBoost
- scikit-learn calibration
- Poisson/Dixon-Coles score modelling
- MLflow-style model registry/artifact metadata

Do not put production model training inside Next.js.

## Current model assessment

The current `src/lib/ai-engine-v2.ts` is a useful baseline but is not a trained production model. It uses manually selected weights for ELO, form, attack/defence, market probabilities and momentum, then applies Monte Carlo sampling to the resulting probabilities.

Keep it as `heuristic-baseline-v1` for comparison.

The production model should be trained chronologically and evaluated against this baseline.

## Prediction stack

1. Team-strength/ELO baseline
2. Dixon-Coles/Poisson expected-goals model
3. Gradient-boosted expected-goals models
4. Gradient-boosted 1X2 classifier
5. Probability calibration
6. Ensemble/meta-model
7. Score distribution
8. Derived market probabilities
9. Live-state model trained separately from pre-match model

## Required training data

Every historical row must represent only information available at prediction time.

Feature families:
- opponent-adjusted form
- ELO/team strength
- home/away strength
- xG/xGA
- goals, shots, shots on target
- possession and set pieces
- lineups and player availability
- injuries/suspensions
- rest days
- manager changes
- league/season context
- bookmaker implied probabilities and line movement
- live events for in-play models

## Validation

Never use random train/test splitting.

Use walk-forward chronological validation and maintain a final untouched holdout period.

Primary metrics:
- multiclass log loss
- Brier score
- calibration error / reliability curves
- ranked probability score
- goal MAE/RMSE
- Poisson deviance
- prediction interval coverage

Accuracy alone is not an acceptance gate.

## Data providers

The current repository already includes integration hooks for The Odds API, API-Football and SportMonks.

Provider selection must be made based on:
- historical depth
- live-event latency
- lineup/injury coverage
- xG/statistics coverage
- bookmaker/market coverage
- rate limits
- redistribution/licensing terms
- stable entity IDs

## Immediate engineering sequence

1. Security cleanup and secret rotation
2. Reconcile root vs nested duplicate application
3. Freeze current heuristic engine as a measurable baseline
4. Normalize fixture/team/league/provider IDs
5. Introduce immutable historical raw-data ingestion
6. Build timestamp-safe feature store
7. Train ELO + Dixon-Coles baselines
8. Train first gradient-boosted models
9. Calibrate probabilities
10. Add score matrix and market derivation service
11. Add live prediction pipeline
12. Add React Native/Expo mobile app
13. Shadow-run predictions and record every forecast before kickoff/live state transition
14. Promote models only after holdout and shadow-production gates pass

## Security note

A Telegram bot token was previously committed to repository history. Removing it from the current tree does not invalidate the historical secret. Rotate/revoke that token before further production use. Environment files and provider keys must not be committed.
