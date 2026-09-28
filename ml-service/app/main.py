from __future__ import annotations

from fastapi import FastAPI

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
