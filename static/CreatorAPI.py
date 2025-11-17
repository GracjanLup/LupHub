import logging
import os
import re
from typing import Iterable, List

try:
    import pythoncom
except ImportError:  # pragma: no cover - pythoncom is Windows only
    pythoncom = None

try:
    import win32com.client  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    win32com = None  # type: ignore

from PyPDF2 import PdfMerger

logger = logging.getLogger(__name__)

EXCEL_PATH = os.environ.get("WANO_EXCEL_PATH", "Cennik Partnera WANO.xlsm")
EXPORT_DIR = os.environ.get("WANO_EXPORT_DIR", "ex")
PDFY_DIR = os.environ.get("WANO_PDFY_DIR", "pdfy")
OUTPUT_FILE_PL = os.environ.get("WANO_OUTPUT_PL", "Cennik B2B WANO.pdf")
OUTPUT_FILE_EN = os.environ.get("WANO_OUTPUT_EN", "Price List B2B WANO.pdf")


class GenerationError(Exception):
    """Raised when PDF generation cannot be completed."""


def _require_windows_stack():
    if win32com is None:
        raise GenerationError("win32com nie jest dostępny. Upewnij się, że środowisko venv ma tę bibliotekę.")
    if os.name != "nt":
        raise GenerationError("Generowanie wymaga środowiska Windows z zainstalowanym MS Excel.")
    if pythoncom:
        pythoncom.CoInitialize()


def _cleanup_com():
    if pythoncom:
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass


def _export_sheets(language_token: str) -> List[str]:
    """Eksportuje arkusze do PDF wg prefiksu (np. PL/EN) i zwraca listę prefiksów."""
    _require_windows_stack()
    os.makedirs(EXPORT_DIR, exist_ok=True)

    excel = None
    workbook = None
    exported_prefixes: List[str] = []

    try:
        excel = win32com.client.Dispatch("Excel.Application")  # type: ignore
        workbook = excel.Workbooks.Open(os.path.abspath(EXCEL_PATH))

        for sheet in workbook.Sheets:
            name = sheet.Name.strip()
            match = re.match(rf"^(\d+{language_token})", name)
            if not match:
                continue

            prefix = match.group(1)
            exported_prefixes.append(prefix)
            pdf_name = f"{prefix}ex.pdf"
            pdf_path = os.path.abspath(os.path.join(EXPORT_DIR, pdf_name))
            sheet.ExportAsFixedFormat(0, pdf_path)
            logger.info("Wyeksportowano arkusz: %s", prefix)

        if not exported_prefixes:
            raise GenerationError(f"Nie znaleziono arkuszy z prefiksem {language_token}.")

        return exported_prefixes
    except Exception as exc:
        raise GenerationError(f"Błąd eksportu arkuszy: {exc}") from exc
    finally:
        if workbook:
            workbook.Close(False)
        if excel:
            excel.Quit()
        _cleanup_com()


def _merge_pdfs(prefixes: Iterable[str], start_pdf: str, end_pdf: str, output_file: str) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(output_file)) or ".", exist_ok=True)
    merger = PdfMerger()

    try:
        merger.append(os.path.join(PDFY_DIR, start_pdf))
        prefixes = list(prefixes)

        if not prefixes:
            raise GenerationError("Brak arkuszy do połączenia.")

        merger.append(os.path.join(EXPORT_DIR, f"{prefixes[0]}ex.pdf"))

        for prefix in prefixes[1:]:
            merger.append(os.path.join(PDFY_DIR, f"{prefix}.pdf"))
            merger.append(os.path.join(EXPORT_DIR, f"{prefix}ex.pdf"))

        merger.append(os.path.join(PDFY_DIR, end_pdf))
        merger.write(output_file)
        logger.info("Zapisano PDF: %s", output_file)
        return os.path.abspath(output_file)
    except Exception as exc:
        raise GenerationError(f"Błąd scalania PDF: {exc}") from exc
    finally:
        merger.close()


def _validate_assets(language_token: str):
    if not os.path.exists(EXCEL_PATH):
        raise GenerationError(f"Nie znaleziono pliku Excela: {EXCEL_PATH}")

    required = [
        os.path.join(PDFY_DIR, f"Start{language_token}.pdf"),
        os.path.join(PDFY_DIR, f"End{language_token}.pdf"),
    ]
    for path in required:
        if not os.path.exists(path):
            raise GenerationError(f"Brak wymaganych plików PDF: {path}")


def generate_price_list(language: str) -> str:
    """Generuje cennik w formacie PDF na podstawie arkuszy Excela."""
    language = language.lower()
    if language not in {"pl", "en"}:
        raise GenerationError("Język musi być 'pl' lub 'en'.")

    token = "PL" if language == "pl" else "EN"
    output_file = OUTPUT_FILE_PL if language == "pl" else OUTPUT_FILE_EN

    _validate_assets(token)
    prefixes = _export_sheets(token)
    return _merge_pdfs(prefixes, f"Start{token}.pdf", f"End{token}.pdf", output_file)


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Generator cennika WANO (wersja web/CLI).")
    parser.add_argument("--lang", choices=["pl", "en"], default="pl", help="Wybierz język PDF.")
    args = parser.parse_args()

    try:
        output = generate_price_list(args.lang)
        print(f"✅ Wygenerowano: {output}")
    except GenerationError as exc:
        print(f"❌ {exc}")
