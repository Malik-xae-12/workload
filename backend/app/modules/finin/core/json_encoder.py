"""Custom JSON encoder that handles NaN and Inf values."""

import json
import math
import numbers
import pandas as pd


class NaNSafeEncoder(json.JSONEncoder):
    """JSON encoder that converts NaN/Inf values to null."""

    def encode(self, o):
        o = self._convert_nan(o)
        return super().encode(o)

    def _convert_nan(self, obj):
        if isinstance(obj, dict):
            return {str(k): self._convert_nan(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [self._convert_nan(item) for item in obj]
        if isinstance(obj, numbers.Real) and not isinstance(obj, bool):
            try:
                value = float(obj)
            except (TypeError, ValueError):
                return None
            return None if not math.isfinite(value) else value
        if pd.isna(obj):
            return None
        return obj

    def iterencode(self, o, _one_shot=False):
        o = self._convert_nan(o)
        return super().iterencode(o, _one_shot)
