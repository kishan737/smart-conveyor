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


# ------------------ MODELS ------------------

class HardwareItem(BaseModel):
    id: str
    name: str
    weight: float
    length: float
    width: float
    height: float


# ------------------ HELPERS ------------------

def safe_float(value: Any, default: float = 0.0) -> float:
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
    Convert Excel or PDF extracted rows into one internal format so the
    rest of the app can compare against a single structure.
    """
    normalized = []

    for idx, row in enumerate(rows):
        if source == "pdf":
            normalized.append(
                {
                    "id": str(row.get("unique_id", "")).strip(),
                    "name": str(row.get("product_name", "")).strip(),
                    "weight": safe_float(row.get("gross_weight", 0)),
                    "length": 0.0,
                    "width": 0.0,
                    "height": 0.0,
                    "hs_code": str(row.get("hs_code", "")).strip(),
                    "volume": safe_float(row.get("volume", 0)),
                    "source": "pdf",
                }
            )
        else:
            normalized.append(
                {
                    "id": str(row.get("id", "")).strip(),
                    "name": str(row.get("name", "")).strip(),
                    "weight": safe_float(row.get("weight", 0)),
                    "length": safe_float(row.get("length", 0)),
                    "width": safe_float(row.get("width", 0)),
                    "height": safe_float(row.get("height", 0)),
                    "hs_code": str(row.get("hs_code", "")).strip(),
                    "volume": safe_float(row.get("volume", 0)),
                    "source": "excel",
                }
            )

    normalized = [row for row in normalized if row["id"] or row["name"]]
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


def extract_cargo_data_with_gemini(pdf_path: Path) -> list:
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY missing")

    genai.configure(api_key=GEMINI_API_KEY)

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    model = genai.GenerativeModel("gemini-1.5-flash")

    prompt = """Extract cargo data from this PDF.

Return JSON only.

Fields:
- product_name
- hs_code
- unique_id
- gross_weight
- volume

Rules:
- Ignore headers, addresses, totals
- If HS code not present, return ""
- Do not guess values
"""

    response = model.generate_content(
        [
            {"mime_type": "application/pdf", "data": pdf_bytes},
            prompt
        ]
    )

    text = response.text.strip()

    try:
        parsed = json.loads(text)
    except Exception:
        raise ValueError("Gemini did not return valid JSON")

    if isinstance(parsed, dict):
        if "items" in parsed and isinstance(parsed["items"], list):
            return parsed["items"]
        return [parsed]

    if not isinstance(parsed, list):
        raise ValueError("Gemini output is not a list")

    return parsed


def save_extracted_outputs(raw_data: list, normalized_data: list):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    raw_json_path = EXTRACTED_DIR / f"extracted_raw_{timestamp}.json"
    normalized_json_path = REFERENCE_DIR / f"reference_{timestamp}.json"
    excel_path = REFERENCE_DIR / f"reference_{timestamp}.xlsx"

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
        "reference_count": len(reference_data_store),
        "hardware_count": len(hardware_data_store),
    }


# ------------------ EXCEL ROUTE (OLD FLOW KEPT) ------------------

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
        "message": "Excel uploaded successfully",
        "reference_source": reference_source,
        "rows_loaded": len(reference_data_store),
        "data": reference_data_store,
    }


# ------------------ PDF ROUTE (NEW FLOW) ------------------

@app.post("/upload-pdfs")
async def upload_pdfs(files: List[UploadFile] = File(...)):
    global reference_data_store, reference_source

    if not files:
        return {"error": "No files uploaded"}

    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            return {"error": f"{file.filename} is not a PDF"}

    try:
        saved_paths = save_uploaded_pdfs(files)
        merged_pdf_path = merge_pdfs(saved_paths)

        raw_extracted = extract_cargo_data_with_gemini(merged_pdf_path)
        normalized = normalize_reference_rows(raw_extracted, source="pdf")

        reference_data_store = normalized
        reference_source = "pdf"

        raw_json_path, normalized_json_path, excel_path = save_extracted_outputs(
            raw_extracted, normalized
        )

        return {
            "message": "PDFs processed successfully",
            "reference_source": reference_source,
            "pdf_count": len(files),
            "items_extracted": len(reference_data_store),
            "merged_pdf": merged_pdf_path.name,
            "raw_json_file": raw_json_path.name,
            "normalized_json_file": normalized_json_path.name,
            "excel_file": excel_path.name,
            "data": reference_data_store,
        }

    except Exception as e:
        return {"error": str(e)}


# ------------------ HARDWARE / LIVE DATA ROUTES ------------------

@app.post("/sensor-data")
def receive_sensor_data(item: HardwareItem):
    hardware_data_store.append(item.dict())
    return {
        "message": "Data received",
        "current_count": len(hardware_data_store),
    }


@app.get("/hardware-data")
def get_hardware_data():
    return hardware_data_store


@app.get("/live-data")
def get_live_data():
    """
    Optional compatibility route if frontend polls /live-data instead of /hardware-data.
    If a reference dataset exists, this returns comparison results.
    Otherwise it returns raw hardware data with status placeholders.
    """
    if not hardware_data_store:
        return []

    if not reference_data_store:
        return [
            {
                **item,
                "status": "No reference loaded",
                "time": datetime.now().strftime("%I:%M:%S %p"),
            }
            for item in hardware_data_store
        ]

    results = []

    for item in hardware_data_store:
        match = next((ref for ref in reference_data_store if ref["id"] == item["id"]), None)

        if not match:
            status = "Missing in document"
        else:
            msgs = []

            if match["name"] and match["name"] != item["name"]:
                msgs.append("Name mismatch")

            if abs(float(match["weight"]) - float(item["weight"])) > 0.001:
                msgs.append("Weight mismatch")

            if (
                match["length"] > 0
                or match["width"] > 0
                or match["height"] > 0
            ):
                if abs(float(match["length"]) - float(item["length"])) > 0.001:
                    msgs.append("Length mismatch")
                if abs(float(match["width"]) - float(item["width"])) > 0.001:
                    msgs.append("Width mismatch")
                if abs(float(match["height"]) - float(item["height"])) > 0.001:
                    msgs.append("Height mismatch")

            status = ", ".join(msgs) if msgs else "OK"

        results.append(
            {
                **item,
                "status": status,
                "time": datetime.now().strftime("%I:%M:%S %p"),
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
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


@app.post("/reset")
def reset_all():
    global reference_source
    hardware_data_store.clear()
    reference_data_store.clear()
    reference_source = None
    return {"message": "System reset"}
