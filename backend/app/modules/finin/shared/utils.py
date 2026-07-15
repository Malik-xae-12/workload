"""Utility functions for safe statistics calculations."""

import math
import numbers
import pandas as pd


def safe_float(value, default: float = 0.0) -> float:
    """Convert a value to float while handling NaN/Inf/None safely."""
    if value is None:
        return default

    if isinstance(value, bool):
        return float(value)

    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned or cleaned.lower() in {"nan", "none", "null", "inf", "-inf", "+inf"}:
            return default
        try:
            parsed = float(cleaned)
        except ValueError:
            return default
        return parsed if math.isfinite(parsed) else default

    if isinstance(value, numbers.Real):
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            return default
        return parsed if math.isfinite(parsed) else default

    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if math.isfinite(parsed) else default


def safe_mean(series: pd.Series, default: float = 0.0) -> float:
    """Calculate mean of a pandas Series, returning default if NaN or empty."""
    if len(series) == 0:
        return default

    numeric = pd.to_numeric(series, errors="coerce")
    mean_val = numeric.mean()

    if pd.isna(mean_val) or math.isnan(float(mean_val)):
        return default

    return float(mean_val)


def safe_round(value, decimals: int = 3, default: float = 0.0) -> float:
    """Round a value, handling NaN/Inf gracefully."""
    try:
        parsed = safe_float(value, default)
        return round(parsed, decimals)
    except (TypeError, ValueError):
        return default


def sanitize_for_json(obj):
    """Recursively replace non-JSON-safe values with JSON-compatible ones."""
    if isinstance(obj, dict):
        return {str(k): sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(item) for item in obj]
    if isinstance(obj, (str, bool)) or obj is None:
        return obj
    if isinstance(obj, numbers.Real):
        if not math.isfinite(float(obj)):
            return None
        return float(obj)
    if pd.isna(obj):
        return None
    return obj
