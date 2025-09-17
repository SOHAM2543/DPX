# backend.py
from typing import Optional
import uvicorn # pyright: ignore[reportMissingImports]
from fastapi import FastAPI, HTTPException # pyright: ignore[reportMissingImports]
from fastapi.responses import FileResponse, HTMLResponse # type: ignore
from fastapi.staticfiles import StaticFiles # type: ignore
from pydantic import BaseModel # type: ignore
import pandas as pd
import requests
from functools import lru_cache
from datetime import datetime, timedelta

app = FastAPI(title="Diamond Price Xpert API")

# Serve static frontend
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/images", StaticFiles(directory="static/images"), name="images")

# --- Load CSV files (no header) and add column names ---
def load_csvs():
    # Adjust filenames if different
    df_round = pd.read_csv("CSV2_ROUND_8_4.csv", header=None)
    df_fancy = pd.read_csv("CSV2_PEAR_8_4.csv", header=None)

    cols = ["Shape", "Clarity", "Color", "From_Wt", "To_Wt", "Rap_Price_Ct", "Date"]
    df_round.columns = cols
    df_fancy.columns = cols

    # parse dates if present
    df_round["Date"] = pd.to_datetime(df_round["Date"], errors="coerce")
    df_fancy["Date"] = pd.to_datetime(df_fancy["Date"], errors="coerce")

    return df_round, df_fancy

DF_ROUND, DF_FANCY = load_csvs()

# create combined for metadata
DF_ALL = pd.concat([DF_ROUND, DF_FANCY], ignore_index=True)

# shape mapping used in original code (BR for round, PS otherwise)
SHAPE_MAPPING = {
    "RD": "BR",  # Round mapped to BR for round diamonds
    "PS": "PS"   # Pear mapped to PS for fancy shapes
}
# ----------------------------
# Currency rate caching
# ----------------------------
_rate_cache = {"rate": 85.50, "ts": datetime.min}

def fetch_usd_to_inr():
    global _rate_cache
    # ttl 1 hour
    if datetime.utcnow() - _rate_cache["ts"] < timedelta(hours=1):
        return _rate_cache["rate"]
    try:
        # exchangerate.host doesn't require API key for basic usage
        resp = requests.get("https://api.exchangerate.host/latest?base=USD&symbols=INR", timeout=6)
        data = resp.json()
        if data and "rates" in data and "INR" in data["rates"]:
            rate = float(data["rates"]["INR"])
            _rate_cache["rate"] = rate
            _rate_cache["ts"] = datetime.utcnow()
            return rate
        else:
            return _rate_cache["rate"]
    except Exception:
        return _rate_cache["rate"]

# ----------------------------
# Helper: Rap price lookup (same logic as your streamlit)
# ----------------------------
SPECIAL_COLOR_GROUPS = {"N", "OP", "QR", "ST", "UV", "WX", "YZ"}

def get_rap_price(df: pd.DataFrame, shape_code: str, clarity: str, color: str, weight: float, use_5cts_price: bool):
    clarity_lookup = "IF" if clarity == "FL" else clarity

    # Map special colors to 'M'
    if color in SPECIAL_COLOR_GROUPS:
        color = "M"

    # weight mapping logic from original
    if use_5cts_price and weight >= 5.0:
        search_weight = 5.0
    elif weight >= 10.0:
        search_weight = 10.0
    elif 6.0 <= weight < 10.0:
        search_weight = 5.0
    else:
        search_weight = weight

    match = df[
        (df["Shape"] == shape_code) &
        (df["Clarity"] == clarity_lookup) &
        (df["Color"] == color) &
        (df["From_Wt"] <= search_weight) &
        (df["To_Wt"] >= search_weight)
    ]

    if not match.empty:
        return float(match.iloc[0]["Rap_Price_Ct"])
    else:
        return None

# ----------------------------
# Pydantic models for requests
# ----------------------------
class GIARequest(BaseModel):
    weight: float
    shape: str
    color: str
    clarity: str
    use_5cts: bool = False
    discount_val: Optional[float] = None

class HRDRequest(BaseModel):
    weight: float
    shape: str
    color: str
    clarity: str
    use_5cts: bool = False
    disc_val: float = 10.0
    disc_val_gia: float = 10.0

class RecutStone(BaseModel):
    weight: float
    shape: str
    color: str
    clarity: str
    discount_val: float = 10.0  # no discount_mode needed

class RecutRequest(BaseModel):
    stone_a: RecutStone
    stone_b: RecutStone
    use_5cts: bool = False

class MetaResponse(BaseModel):
    shapes: list
    colors: list
    clarities: list
    last_updated: str

# ----------------------------
# API endpoints
# ----------------------------

@app.get("/", response_class=HTMLResponse)
def index():
    return FileResponse("static/index.html")

@app.get("/api/meta", response_model=MetaResponse)
def meta():
    shapes = sorted(DF_ALL["Shape"].dropna().unique().tolist())
    colors = sorted(DF_ALL["Color"].dropna().unique().tolist())
    clarities = sorted(DF_ALL["Clarity"].dropna().unique().tolist())
    latest_round = DF_ROUND["Date"].dropna().max()
    latest_fancy = DF_FANCY["Date"].dropna().max()
    latest = max(latest_round, latest_fancy)
    last_updated = latest.strftime("%d %B %Y") if pd.notna(latest) else ""
    return {"shapes": shapes, "colors": colors, "clarities": clarities, "last_updated": last_updated}

@app.post("/api/calc/gia")
def calc_gia(req: GIARequest):
    shape_code = SHAPE_MAPPING.get(req.shape, "PS")
    df = DF_ROUND if shape_code == "BR" else DF_FANCY

    rap = get_rap_price(df, shape_code, req.clarity, req.color, req.weight, req.use_5cts)
    if rap is None:
        raise HTTPException(status_code=404, detail="No matching Rapaport price found.")

    usd_to_inr = fetch_usd_to_inr()

    # Only use discount_val
    discount = abs(req.discount_val) if req.discount_val is not None else 0
    price_per_ct = rap * (1 - discount / 100)
    total_usd = price_per_ct * req.weight
    total_inr = total_usd * usd_to_inr

    latest_round = DF_ROUND["Date"].dropna().max()
    latest_fancy = DF_FANCY["Date"].dropna().max()
    latest = max(latest_round, latest_fancy)
    last_updated = latest.strftime("%d %B %Y") if pd.notna(latest) else None

    return {
        "rap_price_ct": rap,
        "discount_percent": discount,
        "price_per_ct": round(price_per_ct, 2),
        "total_usd": round(total_usd, 2),
        "total_inr": round(total_inr, 2),
        "usd_to_inr": round(usd_to_inr, 2),
        "last_updated": last_updated
    }

@app.post("/api/calc/hrd")
def calc_hrd(req: HRDRequest):
    shape_code = SHAPE_MAPPING.get(req.shape, "PS")
    df = DF_ROUND if shape_code == "BR" else DF_FANCY

    # GIA two-jump: pick color +2 positions if possible
    colors_list = sorted(DF_ALL["Color"].dropna().unique().tolist())
    try:
        idx = colors_list.index(req.color)
        gia_color = colors_list[min(idx+2, len(colors_list)-1)]
    except ValueError:
        gia_color = req.color

    rap = get_rap_price(df, shape_code, req.clarity, req.color, req.weight, req.use_5cts)
    rap_gia = get_rap_price(df, shape_code, req.clarity, gia_color, req.weight, req.use_5cts)

    if rap is None or rap_gia is None:
        raise HTTPException(status_code=404, detail="No matching Rapaport price found for one or both colors.")

    price_per_ct = rap * (1 - req.disc_val / 100)
    price_per_ct_gia = rap_gia * (1 - req.disc_val_gia / 100)
    total_usd = price_per_ct * req.weight
    usd_to_inr = fetch_usd_to_inr()
    total_inr = total_usd * usd_to_inr

    return {
        "rap_price_ct": rap,
        "rap_price_ct_gia": rap_gia,
        "gia_color": gia_color,
        "price_per_ct": round(price_per_ct,2),
        "price_per_ct_gia": round(price_per_ct_gia,2),
        "total_usd": round(total_usd,2),
        "total_inr": round(total_inr,2),
        "usd_to_inr": round(usd_to_inr,2)
    }

@app.post("/api/calc/recut")
def calc_recut(req: RecutRequest):
    # diamond A
    sA = req.stone_a
    sB = req.stone_b

    # function to compute for one stone
    def compute_for(stone: RecutStone):
        shape_code = SHAPE_MAPPING.get(stone.shape, "PS")
        df = DF_ROUND if shape_code == "BR" else DF_FANCY
        rap = get_rap_price(df, shape_code, stone.clarity, stone.color, stone.weight, req.use_5cts)
        if rap is None:
            return None
        discount = abs(stone.discount_val)
        price_per_ct = rap * (1 - discount / 100)
        total_usd = price_per_ct * stone.weight
        return {"rap": rap, "price_per_ct": price_per_ct, "total_usd": total_usd, "discount": discount, "weight": stone.weight}

    resA = compute_for(sA)
    resB = compute_for(sB)
    if resA is None or resB is None:
        raise HTTPException(status_code=404, detail="No matching Rapaport price found for one of the stones.")

    usd_to_inr = fetch_usd_to_inr()
    total_usd_1 = resA["total_usd"]
    total_usd_2 = resB["total_usd"]

    diff_usd = total_usd_2 - total_usd_1
    cost_usd = 0.0
    if resB["weight"] != 0 and resB["rap"] != 0:
        cost_usd = ((total_usd_1 / resB["weight"]) / resB["rap"] - 1) * 100

    up_down_percent = 0.0
    if total_usd_1 != 0:
        up_down_percent = ((total_usd_2 - total_usd_1) / total_usd_1) * 100

    return {
        "stone_a": {**resA, "total_inr": round(total_usd_1 * usd_to_inr,2)},
        "stone_b": {**resB, "total_inr": round(total_usd_2 * usd_to_inr,2)},
        "diff_usd": round(diff_usd,2),
        "cost_percent": round(cost_usd,2),
        "up_down_percent": round(up_down_percent,2),
        "usd_to_inr": round(usd_to_inr,2)
    }

# Run with: uvicorn backend:app --reload
if __name__ == "__main__":
    uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=True)
