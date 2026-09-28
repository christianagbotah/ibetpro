from __future__ import annotations

from fastapi import FastAPI, HTTPException

from .inference import predict as predict_match
from .model_registry import model_status
from .schemas import MatchPrediction, PredictionInput

app = FastAPI(
    title="iBetPro ML Service",
    version="0.1.0",
    description="Versioned football probability inference service.",
)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "ibetpro-ml",
        "model": model_status(),
    }


@app.post("/v1/predict", response_model=MatchPrediction)
def predict(payload: PredictionInput) -> MatchPrediction:
    # Baseline path. Trained models will be promoted behind this same contract
    # after chronological holdout + calibration gates pass.
    return predict_match(payload)


@app.post("/v1/predict/candidate", response_model=MatchPrediction)
def predict_candidate(payload: PredictionInput) -> MatchPrediction:
    """Run the configured trained candidate only.

    Unlike /v1/predict, this endpoint never falls back to a baseline. It is
    intended for shadow evaluation where failure must be visible and auditable.
    """
    try:
        return predict_match(payload, require_model=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
