import os
import json
from datetime import datetime
from pathlib import Path
from io import BytesIO
from typing import List, Any

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

import pandas as pd
from pypdf import PdfWriter
from dotenv import load_dotenv

import google.generativeai as genai

# ------------------ INIT ------------------

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://smart-conveyor.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

BASE_DIR = Path(__file__).resolve().parent

RAW_PDF_DIR = BASE_DIR / "uploads" / "raw_pdfs"
MERGED_DIR = BASE_DIR / "uploads" / "merged"
EXTRACTED_DIR = BASE_DIR / "uploads" / "extracted"
REFERENCE_DIR = BASE_DIR / "uploads" / "reference"

RAW_PDF_DIR.mkdir(parents=True, exist_ok=True)
MERGED_DIR.mkdir(parents=True, exist_ok=True)
EXTRACTED_DIR.mkdir(parents=True, exist_ok=True)
REFERENCE_DIR.mkdir(parents=True, exist_ok=True)

# ------------------ GLOBAL STORES ------------------

reference_data_store: List[dict] = []
reference_source: str | None = None
hardware_data_store: List[dict] = []


# ------------------ CANONICAL SCHEMA ------------------
#
# Every item in this system — whether from Excel, Gemini/PDF, or hardware
# sensors — must conform to this schema before being stored or compared:
#
# {
#     "id":         str,    # unique package / box identifier
#     "name":       str,
#     "cargo_type": str,
#     "weight":     float,  # kilograms
#     "volume":     float,  # cubic meters (m³)
#     "hs_code":    str,
# }


# ------------------ MODELS ------------------

class HardwareItem(BaseModel):
    id: str
    name: str
    cargo_type: str
    weight: float
    volume: float
    hs_code: str


# ------------------ HELPERS ------------------

def safe_float(value: Any, default: float = 0.0) -> float:
    """Safely coerce any value to float, returning `default` on failure."""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if not text:
        return default

    cleaned = ""
    dot_seen = False
    minus_seen = False

    for ch in text:
        if ch.isdigit():
            cleaned += ch
        elif ch == "." and not dot_seen:
            cleaned += ch
            dot_seen = True
        elif ch == "-" and not minus_seen and not cleaned:
            cleaned += ch
            minus_seen = True

    try:
        return float(cleaned)
    except Exception:
        return default


def normalize_reference_rows(rows: List[dict], source: str) -> List[dict]:
    """
    Convert Excel or Gemini/PDF extracted rows into the canonical schema.

    Canonical schema (all normalizers must produce this):
        id, name, cargo_type, weight (kg), volume (m³), hs_code
    """
    normalized = []

    for row in rows:
        if source == "pdf":
            # Gemini output fields: name, unique_id, cargo_type, hs_code, weight, volume
            # Units are already standardised by the Gemini prompt (kg, m³).
            normalized.append(
                {
                    "id":         str(row.get("unique_id", "")).strip(),
                    "name":       str(row.get("name", "")).strip(),
                    "cargo_type": str(row.get("cargo_type", "")).strip(),
                    "weight":     safe_float(row.get("weight", 0)),
                    "volume":     safe_float(row.get("volume", 0)),
                    "hs_code":    str(row.get("hs_code", "")).strip(),
                }
            )
        else:
            # Excel may supply either a pre-computed `volume` column
            # or raw dimension columns (length, width, height) in metres.
            raw_volume = safe_float(row.get("volume", 0))
            if raw_volume == 0.0:
                length = safe_float(row.get("length", 0))
                width  = safe_float(row.get("width",  0))
                height = safe_float(row.get("height", 0))
                raw_volume = length * width * height

            normalized.append(
                {
                    "id":         str(row.get("id", "")).strip(),
                    "name":       str(row.get("name", "")).strip(),
                    "cargo_type": str(row.get("cargo_type", "")).strip(),
                    "weight":     safe_float(row.get("weight", 0)),
                    "volume":     raw_volume,
                    "hs_code":    str(row.get("hs_code", "")).strip(),
                }
            )

    # Drop completely empty rows (no id AND no name)
    normalized = [r for r in normalized if r["id"] or r["name"]]
    return normalized


def save_uploaded_pdfs(files: List[UploadFile]) -> List[Path]:
    saved_paths = []
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for idx, file in enumerate(files):
        filename = f"{timestamp}_{idx}_{file.filename}"
        file_path = RAW_PDF_DIR / filename

        with open(file_path, "wb") as f:
            f.write(file.file.read())

        saved_paths.append(file_path)

    return saved_paths


def merge_pdfs(pdf_paths: List[Path]) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    merged_path = MERGED_DIR / f"merged_{timestamp}.pdf"

    writer = PdfWriter()
    for pdf_path in pdf_paths:
        writer.append(str(pdf_path))

    with open(merged_path, "wb") as f:
        writer.write(f)

    return merged_path


GEMINI_PROMPT = """You are a cargo data extraction engine.

Extract every cargo item from the attached PDF and return ONLY a valid JSON array.
Do not include any explanation, markdown, or code fences — just the raw JSON array.

Each element of the array must have EXACTLY these six fields:
  "name"        — product / item name (string, "" if missing)
  "unique_id"   — package, box, or item identifier (string, "" if missing)
  "cargo_type"  — category or type of cargo (string, "" if missing)
  "hs_code"     — HS / harmonised tariff code (string, "" if missing)
  "weight"      — gross weight in KILOGRAMS (number, 0 if missing)
                  • convert lbs / pounds → kg  : kg = lb × 0.453592
  "volume"      — volume in CUBIC METRES (number, 0 if missing)
                  • if volume is given directly, convert to m³ as needed
                  • if only dimensions are given, compute volume = L × W × H
                    after converting each dimension to metres:
                      mm → ÷ 1000  |  cm → ÷ 100  |  in → × 0.0254  |  ft → × 0.3048
                  • if neither volume nor dimensions are present, use 0

Rules:
  • Ignore document headers, sender / receiver addresses, and grand-total rows.
  • Do NOT guess or invent values.
  • Missing text  → ""
  • Missing number → 0
  • Return a flat JSON array even if the PDF contains only one item.

Example output format:
[
  {
    "name": "Steel Rod Bundle",
    "unique_id": "PKG001",
    "cargo_type": "metal",
    "hs_code": "7207",
    "weight": 120.5,
    "volume": 0.48
  }
]
"""


def extract_cargo_data_with_gemini(pdf_path: Path) -> list:
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured on the server.")

    genai.configure(api_key=GEMINI_API_KEY)

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    model = genai.GenerativeModel("gemini-1.5-flash-latest")

    response = model.generate_content(
        [
            {"mime_type": "application/pdf", "data": pdf_bytes},
            GEMINI_PROMPT,
        ]
    )

    text = response.text.strip()

    # Strip accidental markdown code fences if the model adds them despite instructions
    if text.startswith("```"):
        lines = text.splitlines()
        # Remove opening fence (```json or ```)
        lines = lines[1:] if lines[0].startswith("```") else lines
        # Remove closing fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Gemini did not return valid JSON. Parser error: {exc}\n"
            f"Raw response (first 500 chars): {text[:500]}"
        )

    # Normalise to a list regardless of whether Gemini wrapped items in a dict
    if isinstance(parsed, dict):
        if "items" in parsed and isinstance(parsed["items"], list):
            return parsed["items"]
        return [parsed]

    if not isinstance(parsed, list):
        raise ValueError(
            f"Gemini output is not a JSON array. Got type: {type(parsed).__name__}"
        )

    return parsed


def save_extracted_outputs(raw_data: list, normalized_data: list):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    raw_json_path        = EXTRACTED_DIR / f"extracted_raw_{timestamp}.json"
    normalized_json_path = REFERENCE_DIR / f"reference_{timestamp}.json"
    excel_path           = REFERENCE_DIR / f"reference_{timestamp}.xlsx"

    with open(raw_json_path, "w", encoding="utf-8") as f:
        json.dump(raw_data, f, indent=2, ensure_ascii=False)

    with open(normalized_json_path, "w", encoding="utf-8") as f:
        json.dump(normalized_data, f, indent=2, ensure_ascii=False)

    df = pd.DataFrame(normalized_data)
    df.to_excel(excel_path, index=False)

    return raw_json_path, normalized_json_path, excel_path


# ------------------ BASIC ROUTES ------------------

@app.get("/")
def root():
    return {"message": "Backend running"}


@app.get("/reference-status")
def reference_status():
    return {
        "reference_source": reference_source,
        "reference_count":  len(reference_data_store),
        "hardware_count":   len(hardware_data_store),
    }


# ------------------ EXCEL ROUTE ------------------

@app.post("/upload")
async def upload_excel(file: UploadFile = File(...)):
    global reference_data_store, reference_source

    if not file.filename.lower().endswith((".xlsx", ".xls")):
        return {"error": "Please upload an Excel file"}

    contents = await file.read()
    df = pd.read_excel(BytesIO(contents))
    rows = df.fillna("").to_dict(orient="records")

    normalized = normalize_reference_rows(rows, source="excel")

    reference_data_store = normalized
    reference_source = "excel"

    return {
        "message":          "Excel uploaded successfully",
        "reference_source": reference_source,
        "rows_loaded":      len(reference_data_store),
        "data":             reference_data_store,
    }


# ------------------ PDF ROUTE ------------------

@app.post("/upload-pdfs")
async def upload_pdfs(files: List[UploadFile] = File(...)):
    global reference_data_store, reference_source

    if not files:
        return {"error": "No files uploaded"}

    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            return {"error": f"{file.filename} is not a PDF"}

    try:
        saved_paths    = save_uploaded_pdfs(files)
        merged_pdf_path = merge_pdfs(saved_paths)

        raw_extracted = extract_cargo_data_with_gemini(merged_pdf_path)
        normalized    = normalize_reference_rows(raw_extracted, source="pdf")

        reference_data_store = normalized
        reference_source     = "pdf"

        raw_json_path, normalized_json_path, excel_path = save_extracted_outputs(
            raw_extracted, normalized
        )

        return {
            "message":               "PDFs processed successfully",
            "reference_source":      reference_source,
            "pdf_count":             len(files),
            "items_extracted":       len(reference_data_store),
            "merged_pdf":            merged_pdf_path.name,
            "raw_json_file":         raw_json_path.name,
            "normalized_json_file":  normalized_json_path.name,
            "excel_file":            excel_path.name,
            "data":                  reference_data_store,
        }

    except Exception as e:
        return {"error": str(e)}


# ------------------ HARDWARE / LIVE DATA ROUTES ------------------

@app.post("/sensor-data")
def receive_sensor_data(item: HardwareItem):
    hardware_data_store.append(item.dict())
    return {
        "message":       "Data received",
        "current_count": len(hardware_data_store),
    }


@app.get("/hardware-data")
def get_hardware_data():
    return hardware_data_store


@app.get("/live-data")
def get_live_data():
    """
    Returns each hardware item enriched with a comparison `status` field.

    Matching is done by `id` against the loaded reference dataset.
    Fields compared: name, cargo_type, hs_code, weight, volume.
    """
    if not hardware_data_store:
        return []

    timestamp = datetime.now().strftime("%I:%M:%S %p")

    if not reference_data_store:
        return [
            {
                **item,
                "status": "No reference loaded",
                "time":   timestamp,
            }
            for item in hardware_data_store
        ]

    results = []

    for item in hardware_data_store:
        ref = next(
            (r for r in reference_data_store if r["id"] == item["id"]),
            None,
        )

        if ref is None:
            status = "Missing in document"
        else:
            mismatches: List[str] = []

            # --- String field comparisons ---
            if ref["name"] and ref["name"] != item.get("name", ""):
                mismatches.append("Name mismatch")

            if ref["cargo_type"] and ref["cargo_type"] != item.get("cargo_type", ""):
                mismatches.append("Type mismatch")

            if ref["hs_code"] and ref["hs_code"] != item.get("hs_code", ""):
                mismatches.append("HS mismatch")

            # --- Numeric field comparisons (tolerance: 0.001) ---
            if abs(float(ref["weight"]) - float(item.get("weight", 0))) > 0.001:
                mismatches.append("Weight mismatch")

            if abs(float(ref["volume"]) - float(item.get("volume", 0))) > 0.001:
                mismatches.append("Volume mismatch")

            status = ", ".join(mismatches) if mismatches else "OK"

        results.append(
            {
                **item,
                "status": status,
                "time":   timestamp,
            }
        )

    return results


@app.delete("/clear-data")
def clear_data():
    hardware_data_store.clear()
    return {"message": "Hardware data cleared"}


@app.get("/download-excel/{filename}")
def download_excel(filename: str):
    file_path = REFERENCE_DIR / filename
    if not file_path.exists():
        return {"error": "File not found"}
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.post("/reset")
def reset_all():
    global reference_source
    hardware_data_store.clear()
    reference_data_store.clear()
    reference_source = None
    return {"message": "System reset"}
