from __future__ import annotations

from dataclasses import dataclass

import numpy as np


DEFAULT_DIVERGENCE_BINS = (0.0, 0.02, 0.05, 0.10, 1.01)


@dataclass(frozen=True)
class SelectivePolicyRules:
    min_rows: int = 80
    min_log_loss_improvement: float = 0.003
    require_ci_below_zero: bool = True
    bootstrap_iterations: int = 3000
    seed: int = 101


def row_log_losses(y_true: np.ndarray, probabilities: np.ndarray) -> np.ndarray:
    indices = np.arange(len(y_true))
    return -np.log(
        np.clip(probabilities[indices, y_true.astype(int)], 1e-12, 1.0)
    )


def bootstrap_mean_delta(
    deltas: np.ndarray,
    iterations: int,
    seed: int,
) -> tuple[float, float]:
    if len(deltas) == 0:
        return (float("nan"), float("nan"))

    rng = np.random.default_rng(seed)
    means = np.empty(iterations, dtype=float)
    for index in range(iterations):
        sample = rng.integers(0, len(deltas), size=len(deltas))
        means[index] = float(deltas[sample].mean())
    low, high = np.quantile(means, [0.025, 0.975])
    return float(low), float(high)


def divergence_from_market(
    candidate_probs: np.ndarray,
    market_probs: np.ndarray,
) -> np.ndarray:
    return np.max(np.abs(candidate_probs - market_probs), axis=1)


def learn_selective_policy(
    y_true: np.ndarray,
    candidate_probs: np.ndarray,
    market_probs: np.ndarray,
    *,
    bins: tuple[float, ...] = DEFAULT_DIVERGENCE_BINS,
    rules: SelectivePolicyRules = SelectivePolicyRules(),
) -> dict:
    if len(y_true) != len(candidate_probs) or len(y_true) != len(market_probs):
        raise ValueError("Selective policy inputs must have the same row count")
    if len(bins) < 2:
        raise ValueError("At least two divergence-bin boundaries are required")

    candidate_losses = row_log_losses(y_true, candidate_probs)
    market_losses = row_log_losses(y_true, market_probs)
    deltas = candidate_losses - market_losses
    divergence = divergence_from_market(candidate_probs, market_probs)

    bands: list[dict] = []
    enabled = 0

    for index in range(len(bins) - 1):
        lower = float(bins[index])
        upper = float(bins[index + 1])
        if index == len(bins) - 2:
            mask = (divergence >= lower) & (divergence <= upper)
        else:
            mask = (divergence >= lower) & (divergence < upper)

        rows = int(mask.sum())
        mean_delta = float(deltas[mask].mean()) if rows else None
        ci_low = ci_high = None
        if rows:
            ci_low, ci_high = bootstrap_mean_delta(
                deltas[mask],
                rules.bootstrap_iterations,
                rules.seed + index,
            )

        passes_rows = rows >= rules.min_rows
        passes_edge = (
            mean_delta is not None
            and mean_delta <= -rules.min_log_loss_improvement
        )
        passes_ci = (
            not rules.require_ci_below_zero
            or (ci_high is not None and ci_high < 0.0)
        )
        use_candidate = bool(passes_rows and passes_edge and passes_ci)
        if use_candidate:
            enabled += 1

        bands.append(
            {
                "lower": lower,
                "upper": upper,
                "rows": rows,
                "candidate_minus_market_log_loss": mean_delta,
                "bootstrap_ci95_low": ci_low,
                "bootstrap_ci95_high": ci_high,
                "use_candidate": use_candidate,
            }
        )

    return {
        "version": "selective-divergence-v1",
        "rules": {
            "min_rows": rules.min_rows,
            "min_log_loss_improvement": rules.min_log_loss_improvement,
            "require_ci_below_zero": rules.require_ci_below_zero,
            "bootstrap_iterations": rules.bootstrap_iterations,
        },
        "bands": bands,
        "enabled_band_count": enabled,
        "calibration_rows": int(len(y_true)),
    }


def apply_selective_policy(
    candidate_probs: np.ndarray,
    market_probs: np.ndarray,
    policy: dict,
) -> tuple[np.ndarray, np.ndarray]:
    if len(candidate_probs) != len(market_probs):
        raise ValueError("Candidate and market rows must match")

    divergence = divergence_from_market(candidate_probs, market_probs)
    choose_candidate = np.zeros(len(candidate_probs), dtype=bool)

    for index, band in enumerate(policy.get("bands", [])):
        if not band.get("use_candidate"):
            continue
        lower = float(band["lower"])
        upper = float(band["upper"])
        if index == len(policy.get("bands", [])) - 1:
            mask = (divergence >= lower) & (divergence <= upper)
        else:
            mask = (divergence >= lower) & (divergence < upper)
        choose_candidate |= mask

    selected = market_probs.copy()
    selected[choose_candidate] = candidate_probs[choose_candidate]
    selected = selected / selected.sum(axis=1, keepdims=True)
    return selected, choose_candidate


def policy_allows_divergence(divergence: float, policy: dict) -> bool:
    bands = policy.get("bands", [])
    for index, band in enumerate(bands):
        if not band.get("use_candidate"):
            continue
        lower = float(band["lower"])
        upper = float(band["upper"])
        is_last = index == len(bands) - 1
        if divergence >= lower and (
            divergence <= upper if is_last else divergence < upper
        ):
            return True
    return False
