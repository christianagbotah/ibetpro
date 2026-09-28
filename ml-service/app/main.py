from __future__ import annotations

from fastapi import FastAPI

from .baselines import poisson_baseline
from .schemas import MatchPrediction, PredictionInput

app = FastAPI(
    title="iBetPro ML Service",
    version="0.1.0",
    description="Versioned football probability inference service.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "ibetpro-ml",
        "model": "poisson-baseline-v1",
    }


@app.post("/v1/predict", response_model=MatchPrediction)
def predict(payload: PredictionInput) -> MatchPrediction:
    # Baseline path. Trained models will be promoted behind this same contract
    # after chronological holdout + calibration gates pass.
    return poisson_baseline(payload)
