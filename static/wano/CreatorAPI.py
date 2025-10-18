import os
import re
import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk
import win32com.client
from PyPDF2 import PdfMerger
from tkinter import font

EXCEL_PATH = "Cennik Partnera WANO.xlsm"
EXPORT_DIR = "ex"
PDFY_DIR = "pdfy"
OUTPUT_FILE = "Cennik B2B WANO.pdf"
OUTPUT_FILE_EN = "Price List B2B WANO.pdf"

# Global GUI elements to update from functions
progress_label = None
progress_bar = None

def update_status(text, progress=None):
    progress_label.config(text=text)
    if progress is not None:
        progress_bar["value"] = progress
    root.update_idletasks()


def export_polish_sheets_to_pdf():
    if not os.path.exists(EXPORT_DIR):
        os.makedirs(EXPORT_DIR)

    update_status("📄 Uruchamiam MS Excel...")
    try:
        excel = win32com.client.GetActiveObject("Excel.Application")
    except Exception:
        excel = win32com.client.Dispatch("Excel.Application")
    wb = excel.Workbooks.Open(os.path.abspath(EXCEL_PATH))

    valid_prefixes = []

    try:
        total_sheets = len(wb.Sheets)
        current = 0

        for sheet in wb.Sheets:
            name = sheet.Name.strip()
            match = re.match(r'^(\d+PL)', name)
            if match:
                prefix = match.group(1)
                valid_prefixes.append(prefix)
                pdf_name = f"{prefix}ex.pdf"
                pdf_path = os.path.join(EXPORT_DIR, pdf_name)
                sheet.ExportAsFixedFormat(0, os.path.abspath(pdf_path))
                current += 1
                update_status(f"✅ Wyeksportowano: {prefix}", progress=(current / 15) * 50)

        wb.Close(False)
        excel.Quit()
        update_status("✅ Eksport arkuszy zakończony.", progress=50)
    except Exception as e:
        wb.Close(False)
        excel.Quit()
        update_status(f"❌ Błąd podczas eksportu: {e}")
        return

    merge_polish_pdfs(valid_prefixes)

def merge_polish_pdfs(prefixes):
    merger = PdfMerger()
    try:
        update_status("🔄 Scalanie PDF...")

        merger.append(os.path.join(PDFY_DIR, "StartPL.pdf"))
        merger.append(os.path.join(EXPORT_DIR, f"{prefixes[0]}ex.pdf"))

        for i, prefix in enumerate(prefixes[1:], start=1):
            merger.append(os.path.join(PDFY_DIR, f"{prefix}.pdf"))
            merger.append(os.path.join(EXPORT_DIR, f"{prefix}ex.pdf"))
            update_status(f"✅ Dodano: {prefix}", progress=50 + (i / 14) * 45)

        merger.append(os.path.join(PDFY_DIR, "EndPL.pdf"))

        merger.write(OUTPUT_FILE)
        merger.close()
        update_status("✅ Gotowe! Plik PDF zapisany.", progress=100)
    except Exception as e:
        merger.close()
        update_status(f"❌ Błąd scalania: {e}")

def main():
    global root, progress_label, progress_bar
    
    root = tk.Tk()
    root.title("WANO Creator")
    root.geometry("700x400")  # Slightly more space
    root.resizable(False, False)
    
    style = ttk.Style()
    style.configure("Wano.TButton", font=("Segoe UI", 11))

    # Outer red border
    border_frame = tk.Frame(root, bg="#ff2727", padx=30, pady=30)
    border_frame.pack(expand=True, fill="both")

    # Inner light panel
    content = tk.Frame(border_frame, bg="#f4f4f4")
    content.pack(expand=True, fill="both")

    # Centered layout frame
    center_frame = tk.Frame(content, bg="#f4f4f4")
    center_frame.pack(pady=40)

    # Polish button
    btn_pl = ttk.Button(center_frame, text="📙 Aktualizuj Cennik Polski", style="Wano.TButton",  command=export_polish_sheets_to_pdf)
    btn_pl.grid(row=0, column=0, padx=20, ipadx=20, ipady=10)

    # English button (disabled for now)
    btn_en = ttk.Button(center_frame, text="📙 Aktualizuj Cennik Angielski", style="Wano.TButton", command=export_english_sheets_to_pdf)
    btn_en.grid(row=0, column=1, padx=20, ipadx=20, ipady=10)

    # ✅ Create label with fixed width and proper alignment
    progress_label = tk.Label(
        content,
        text="💡 Gotowy do działania.",
        bg="#f4f4f4",
        font=("Segoe UI", 10),
        width=50,
        anchor="center",
        justify="center"
    )

    # ✅ Pack it AFTER it is created
    progress_label.pack(pady=(10, 5), fill="x", padx=80)

    # ✅ Progress bar (below it)
    progress_bar = ttk.Progressbar(content, orient="horizontal", length=500, mode="determinate")
    progress_bar.pack(pady=5)

    # Logo in bottom-left corner
    try:
        image = Image.open("LogoWano.png")
        image = image.resize((200, 80), Image.Resampling.LANCZOS)
        logo = ImageTk.PhotoImage(image)
        logo_label = tk.Label(content, image=logo, bg="#f4f4f4")
        logo_label.image = logo
        logo_label.place(relx=1.0, rely=1.0, anchor="se")  # bottom-right
    except Exception as e:
        print("⚠️ Logo error:", e)

    root.mainloop()

def export_english_sheets_to_pdf():
    if not os.path.exists(EXPORT_DIR):
        os.makedirs(EXPORT_DIR)

    update_status("📄 Uruchamiam MS Excel...")
    try:
        excel = win32com.client.GetActiveObject("Excel.Application")
    except Exception:
        excel = win32com.client.Dispatch("Excel.Application")
    wb = excel.Workbooks.Open(os.path.abspath(EXCEL_PATH))

    valid_prefixes = []

    try:
        total_sheets = len(wb.Sheets)
        current = 0

        for sheet in wb.Sheets:
            name = sheet.Name.strip()
            match = re.match(r'^(\d+EN)', name)
            if match:
                prefix = match.group(1)
                valid_prefixes.append(prefix)
                pdf_name = f"{prefix}ex.pdf"
                pdf_path = os.path.join(EXPORT_DIR, pdf_name)
                sheet.ExportAsFixedFormat(0, os.path.abspath(pdf_path))
                current += 1
                update_status(f"✅ Exported: {prefix}", progress=(current / 15) * 50)

        wb.Close(False)
        excel.Quit()
        update_status("✅ English export complete.", progress=50)
    except Exception as e:
        wb.Close(False)
        excel.Quit()
        update_status(f"❌ Error during export: {e}")
        return

    merge_english_pdfs(valid_prefixes)

def merge_english_pdfs(prefixes):
    merger = PdfMerger()
    try:
        update_status("🔄 Merging English PDF...")

        merger.append(os.path.join(PDFY_DIR, "StartEN.pdf"))
        merger.append(os.path.join(EXPORT_DIR, f"{prefixes[0]}ex.pdf"))

        for i, prefix in enumerate(prefixes[1:], start=1):
            merger.append(os.path.join(PDFY_DIR, f"{prefix}.pdf"))
            merger.append(os.path.join(EXPORT_DIR, f"{prefix}ex.pdf"))
            update_status(f"📎 Added: {prefix}", progress=50 + (i / 14) * 45)

        merger.append(os.path.join(PDFY_DIR, "EndEN.pdf"))

        merger.write(OUTPUT_FILE_EN)
        merger.close()
        update_status("✅ English PDF saved!", progress=100)
    except Exception as e:
        merger.close()
        update_status(f"❌ Merge error: {e}")


if __name__ == "__main__":
    main()
