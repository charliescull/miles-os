"""
ProfitScorer — pure-python ridge regression predicting an opportunity's REALIZED
net profit ($) from its feature vector. No numpy/sklearn: closed-form ridge on
standardized features, solved by Gaussian elimination. Right-sized for a single-user
system (tens–hundreds of samples, ~19 features) and dependency-free so SCORING needs
nothing extra — only training touches this module's math.

Serializes to/from a plain dict so the fitted model lives in Supabase `ml_model.params`.
"""
from __future__ import annotations

import statistics
from typing import Optional

from .features import FEATURE_NAMES

MIN_SAMPLES_TO_FIT = 5
N_TRUST = 30  # samples at which we trust the model's own quality estimate fully


def _solve(A: list[list[float]], b: list[float]) -> list[float]:
    """Solve A w = b (A square, symmetric PD after ridge) via Gaussian elimination."""
    n = len(A)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        # partial pivot
        piv = max(range(col, n), key=lambda r: abs(M[r][col]))
        if abs(M[piv][col]) < 1e-12:
            continue
        M[col], M[piv] = M[piv], M[col]
        pivval = M[col][col]
        M[col] = [v / pivval for v in M[col]]
        for r in range(n):
            if r != col and M[r][col] != 0.0:
                factor = M[r][col]
                M[r] = [a - factor * b for a, b in zip(M[r], M[col])]
    return [M[i][n] for i in range(n)]


class ProfitScorer:
    """Standardized ridge regressor. Predicts realized net profit in dollars."""

    def __init__(self, feature_names: list[str] | None = None):
        self.feature_names = feature_names or list(FEATURE_NAMES)
        self.weights: list[float] = []
        self.intercept: float = 0.0
        self.mu: list[float] = []
        self.sigma: list[float] = []
        self.lam: float = 1.0
        self.metrics: dict = {}
        self.n_samples: int = 0
        self.fitted: bool = False

    # ── training ──────────────────────────────────────────────────────────
    def fit(self, X: list[list[float]], y: list[float], lam: float = 1.0,
            compute_cv: bool = True) -> dict:
        n = len(X)
        if n < MIN_SAMPLES_TO_FIT:
            raise ValueError(f"need >= {MIN_SAMPLES_TO_FIT} samples to fit, got {n}")
        p = len(self.feature_names)
        self.lam = lam
        self.n_samples = n

        # standardize features
        self.mu = [statistics.fmean(col) for col in zip(*X)]
        self.sigma = [(statistics.pstdev(col) or 1.0) for col in zip(*X)]
        Z = [[(X[i][j] - self.mu[j]) / self.sigma[j] for j in range(p)] for i in range(n)]

        y_mean = statistics.fmean(y)
        yc = [v - y_mean for v in y]
        self.intercept = y_mean

        # A = ZᵀZ + λI ; b = Zᵀyc
        A = [[sum(Z[i][a] * Z[i][b] for i in range(n)) + (lam if a == b else 0.0)
              for b in range(p)] for a in range(p)]
        bvec = [sum(Z[i][a] * yc[i] for i in range(n)) for a in range(p)]
        self.weights = _solve(A, bvec)
        self.fitted = True

        # in-sample metrics + honest k-fold CV
        preds = [self._raw_predict(x) for x in X]
        self.metrics = {
            "r2": _r2(y, preds),
            "mae": _mae(y, preds),
            "baseline_mae": _mae(y, [y_mean] * n),
            "cv_r2": _kfold_cv_r2(X, y, lam, p) if (compute_cv and n >= 10) else None,
        }
        return self.metrics

    # ── prediction ────────────────────────────────────────────────────────
    def _raw_predict(self, x: list[float]) -> float:
        z = [(x[j] - self.mu[j]) / self.sigma[j] for j in range(len(x))]
        return self.intercept + sum(self.weights[j] * z[j] for j in range(len(z)))

    def predict(self, x: list[float]) -> tuple[float, float]:
        """Return (predicted_realized_net_profit, confidence 0..1)."""
        if not self.fitted:
            return 0.0, 0.0
        return self._raw_predict(x), self.confidence()

    def confidence(self) -> float:
        """Trust grows with sample count and CV quality; clamped to [0,1]."""
        cv = self.metrics.get("cv_r2")
        quality = max(0.0, min(1.0, cv)) if cv is not None else 0.3
        coverage = min(1.0, self.n_samples / N_TRUST)
        return round(quality * coverage, 4)

    # ── serialization (for Supabase ml_model.params) ──────────────────────
    def to_dict(self) -> dict:
        return {
            "weights": self.weights, "intercept": self.intercept,
            "mu": self.mu, "sigma": self.sigma, "lambda": self.lam,
        }

    @classmethod
    def from_dict(cls, feature_names: list[str], params: dict, metrics: dict | None = None,
                  n_samples: int = 0) -> "ProfitScorer":
        m = cls(feature_names)
        m.weights = params["weights"]; m.intercept = params["intercept"]
        m.mu = params["mu"]; m.sigma = params["sigma"]; m.lam = params.get("lambda", 1.0)
        m.metrics = metrics or {}; m.n_samples = n_samples; m.fitted = True
        return m


# ── metric helpers ─────────────────────────────────────────────────────────
def _mae(y: list[float], p: list[float]) -> float:
    return sum(abs(a - b) for a, b in zip(y, p)) / len(y)


def _r2(y: list[float], p: list[float]) -> float:
    ym = statistics.fmean(y)
    ss_tot = sum((a - ym) ** 2 for a in y) or 1e-9
    ss_res = sum((a - b) ** 2 for a, b in zip(y, p))
    return 1.0 - ss_res / ss_tot


def _kfold_cv_r2(X: list[list[float]], y: list[float], lam: float, p: int, k: int = 5) -> Optional[float]:
    n = len(X)
    k = min(k, n)
    folds = [list(range(i, n, k)) for i in range(k)]
    preds = [0.0] * n
    for test_idx in folds:
        train_idx = [i for i in range(n) if i not in set(test_idx)]
        if len(train_idx) < MIN_SAMPLES_TO_FIT:
            return None
        m = ProfitScorer()
        m.fit([X[i] for i in train_idx], [y[i] for i in train_idx], lam=lam, compute_cv=False)
        for i in test_idx:
            preds[i] = m._raw_predict(X[i])
    return _r2(y, preds)
