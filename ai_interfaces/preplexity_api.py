import os
import re
import json
from datetime import date
from pathlib import Path
from urllib import request, error

from ai_interfaces.file_utils import read_prompt_from_file


DEFAULT_MODEL = "sonar"
PERPLEXITY_BASE_URL = "https://api.perplexity.ai"
PROMPT_FILE = "Analysts_Recommendation_Prompt.txt"


def _normalize_name(value):
    text = str(value or "").lower()
    text = re.sub(r"[^a-z0-9]+", "", text)
    return text


def _extract_action_from_text(content):
    raw = str(content or "")
    upper = raw.upper()

    # Prefer the explicit consensus line if present.
    consensus_match = re.search(
        r"CONSENSUS\s+PROFESSIONAL\s+RECOMMENDATION\s*:\s*\**\s*(BUY|HOLD|SELL)\b",
        upper,
    )
    if consensus_match:
        return consensus_match.group(1)

    if "SELL" in upper or "REDUCE" in upper or "UNDERPERFORM" in upper:
        return "SELL"
    if "BUY" in upper or "OUTPERFORM" in upper or "OVERWEIGHT" in upper or "ADD" in upper:
        return "BUY"
    if "HOLD" in upper or "NEUTRAL" in upper:
        return "HOLD"
    return "HOLD"


def _safe_file_slug(text):
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", str(text or "").strip())
    cleaned = cleaned.strip("_")
    return cleaned or "unknown"


def _build_user_prompt(stock, symbol):
    today = date.today().isoformat()
    return (
        f"Stock to analyze: [{stock}]\n"
        f"Trading symbol: [{symbol}]\n"
        f"Current date: [{today}]\n"
        "Follow the system instructions exactly. "
        "At the end, add one final line exactly in this format: "
        "Consensus Professional Recommendation: BUY or HOLD or SELL"
    )


def _query_perplexity(stock, symbol, api_key, model=DEFAULT_MODEL):
    system_prompt = read_prompt_from_file(PROMPT_FILE)
    user_prompt = _build_user_prompt(stock, symbol)

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    req = request.Request(
        url=f"{PERPLEXITY_BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
    except error.HTTPError as ex:
        body = ex.read().decode("utf-8", errors="ignore") if ex.fp else ""
        raise RuntimeError(f"Perplexity HTTP error {ex.code}: {body}") from ex
    except Exception as ex:
        raise RuntimeError(f"Perplexity request failed: {ex}") from ex

    data = json.loads(body)
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("Perplexity response did not contain choices")
    message = choices[0].get("message") or {}
    return message.get("content") or ""


def _load_cached_recommendations():
    mock_dir = Path(__file__).resolve().parents[1] / "mockdata"
    recommendations = {}
    if not mock_dir.exists():
        return recommendations

    for file_path in mock_dir.iterdir():
        if not file_path.is_file():
            continue
        name = file_path.name
        if not name.lower().startswith("analyst_recommendation_"):
            continue

        stem = file_path.stem
        if stem.lower().startswith("analyst_recommendation_"):
            stock_name = stem[len("analyst_recommendation_"):].strip()
        else:
            stock_name = name[len("analyst_recommendation_"):].strip()
        normalized_stock = _normalize_name(stock_name)
        if not normalized_stock:
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        recommendations[normalized_stock] = _extract_action_from_text(content)

    return recommendations


def _write_recommendation_cache(stock, symbol, content):
    mock_dir = Path(__file__).resolve().parents[1] / "mockdata"
    mock_dir.mkdir(parents=True, exist_ok=True)
    # Save by symbol so subsequent lookups are stable even if stock names vary.
    file_slug = _safe_file_slug(symbol or stock)
    file_path = mock_dir / f"analyst_recommendation_{file_slug}.txt"
    file_path.write_text(str(content or ""), encoding="utf-8")


def get_holdings_recommendations(holdings_data, model=DEFAULT_MODEL):
    recommendations = _load_cached_recommendations()
    api_key = os.getenv("PERPLEXITY_API_KEY", "").strip()

    # If API key is unavailable, use cached recommendations and default HOLD for the rest.
    if not api_key:
        return recommendations

    for holding in holdings_data:
        stock = str(holding.get("stock") or "").strip()
        symbol = str(holding.get("symbol") or "").strip().upper()
        stock_key = _normalize_name(stock)
        symbol_key = _normalize_name(symbol)

        if not stock and not symbol:
            continue

        if stock_key in recommendations or symbol_key in recommendations:
            continue

        try:
            content = _query_perplexity(stock=stock or symbol, symbol=symbol, api_key=api_key, model=model)
            action = _extract_action_from_text(content)
            if stock_key:
                recommendations[stock_key] = action
            if symbol_key:
                recommendations[symbol_key] = action
            _write_recommendation_cache(stock=stock, symbol=symbol, content=content)
        except Exception:
            if stock_key and stock_key not in recommendations:
                recommendations[stock_key] = "HOLD"
            if symbol_key and symbol_key not in recommendations:
                recommendations[symbol_key] = "HOLD"

    return recommendations