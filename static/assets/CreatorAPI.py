import logging
import os
import re
import shutil
import subprocess
import tempfile
from typing import Iterable, List, Optional

from PyPDF2 import PdfMerger

logger = logging.getLogger(__name__)

BASE_DIR = os.environ.get("WANO_BASE_DIR", "/home/wano")
EXCEL_PATH = os.environ.get("WANO_EXCEL_PATH") or os.path.join(BASE_DIR, "cenniki", "Cennik Partnera WANO.xlsm")
EXPORT_DIR = os.environ.get("WANO_EXPORT_DIR") or os.path.join(BASE_DIR, "ex")
PDFY_DIR = os.environ.get("WANO_PDFY_DIR") or os.path.join(BASE_DIR, "pdfy")
OUTPUT_DIR = os.environ.get("WANO_OUTPUT_DIR") or os.path.join(BASE_DIR, "cennikiPDF")
OUTPUT_FILE_PL = os.environ.get("WANO_OUTPUT_PL") or os.path.join(OUTPUT_DIR, "Cennik B2B WANO.pdf")
OUTPUT_FILE_EN = os.environ.get("WANO_OUTPUT_EN") or os.path.join(OUTPUT_DIR, "Price List B2B WANO.pdf")


class GenerationError(Exception):
    """Raised when PDF generation cannot be completed."""


def _validate_assets(language_token: str, excel_path: Optional[str] = None):
    source_excel = os.path.abspath(excel_path or EXCEL_PATH)
    if not os.path.exists(source_excel):
        raise GenerationError(f"Nie znaleziono pliku Excela: {source_excel}")

    required = [
        os.path.join(PDFY_DIR, f"Start{language_token}.pdf"),
        os.path.join(PDFY_DIR, f"End{language_token}.pdf"),
    ]
    for path in required:
        if not os.path.exists(path):
            raise GenerationError(f"Brak wymaganych plików PDF: {path}")


def _merge_pdf_list(paths: Iterable[str], output_file: str) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(output_file)) or ".", exist_ok=True)
    merger = PdfMerger()
    try:
        for p in paths:
            merger.append(os.path.abspath(p))
        merger.write(output_file)
        logger.info("Zapisano PDF: %s", output_file)
        return os.path.abspath(output_file)
    except Exception as exc:
        raise GenerationError(f"Błąd scalania PDF: {exc}") from exc
    finally:
        merger.close()


def _convert_excel_to_pdf(excel_path: str, dest_dir: str) -> str:
    os.makedirs(dest_dir, exist_ok=True)
    excel_abs = os.path.abspath(excel_path)
    out_name = os.path.splitext(os.path.basename(excel_abs))[0] + ".pdf"
    out_path = os.path.join(dest_dir, out_name)

    soffice = shutil.which("libreoffice") or shutil.which("soffice")
    if not soffice:
        raise GenerationError("Brak libreoffice/soffice w PATH (wymagane do konwersji Excela na PDF).")

    cmd = [
        soffice,
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        dest_dir,
        excel_abs,
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as exc:
        stderr_msg = exc.stderr.decode(errors="ignore") if exc.stderr else str(exc)
        raise GenerationError(f"Konwersja przez libreoffice nie powiodła się: {stderr_msg}") from exc

    if not os.path.exists(out_path):
        raise GenerationError(f"Nie znaleziono wyjściowego PDF: {out_path}")
    return out_path


def generate_price_list(language: str, excel_path: Optional[str] = None) -> str:
    """Generuje cennik PDF (Linux, libreoffice)."""
    language = language.lower()
    if language not in {"pl", "en"}:
        raise GenerationError("Język musi być 'pl' lub 'en'.")

    token = "PL" if language == "pl" else "EN"
    output_file = OUTPUT_FILE_PL if language == "pl" else OUTPUT_FILE_EN

    _validate_assets(token, excel_path)

    with tempfile.TemporaryDirectory() as tmpdir:
        workbook_pdf = _convert_excel_to_pdf(excel_path or EXCEL_PATH, tmpdir)
        parts = [
            os.path.join(PDFY_DIR, f"Start{token}.pdf"),
            workbook_pdf,
            os.path.join(PDFY_DIR, f"End{token}.pdf"),
        ]
        return _merge_pdf_list(parts, output_file)


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Generator cennika WANO (wersja web/CLI, libreoffice).")
    parser.add_argument("--lang", choices=["pl", "en"], default="pl", help="Wybierz język PDF.")
    parser.add_argument("--excel", default=None, help="Ścieżka do pliku Excela.")
    args = parser.parse_args()

    try:
        output = generate_price_list(args.lang, args.excel)
        print(f"✅ Wygenerowano: {output}")
    except GenerationError as exc:
        print(f"❌ {exc}")
