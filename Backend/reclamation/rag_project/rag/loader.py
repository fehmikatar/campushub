"""Step 1 — read a PDF into clean text, page by page."""

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

import pymupdf

from .exceptions import DocumentError


@dataclass
class Page:
    number: int  # 1-based, as shown in a PDF viewer
    text: str


@dataclass
class LoadedPDF:
    title: str
    page_count: int
    pages: list[Page]  # only pages that contain text


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def clean_text(text: str) -> str:
    text = text.replace("\x00", "").replace("­", "")  # nulls, soft hyphens
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)          # re-join hyphenated words
    text = re.sub(r"[ \t ]+", " ", text)              # collapse spaces
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)                 # max one blank line
    text = re.sub(r"(?<!\n)\n(?!\n)", " ", text)           # single newlines -> space
    return text.strip()


def _read(doc, name: str) -> LoadedPDF:
    with doc:
        if doc.is_encrypted and not doc.authenticate(""):
            raise DocumentError(f"{name} is password-protected.")
        title = (doc.metadata or {}).get("title") or Path(name).stem
        pages = []
        for number, page in enumerate(doc, start=1):
            text = clean_text(page.get_text("text", sort=True))
            if text:
                pages.append(Page(number=number, text=text))
        page_count = doc.page_count

    return LoadedPDF(title=title.strip(), page_count=page_count, pages=pages)


def load_pdf(path: Path) -> LoadedPDF:
    path = Path(path)
    try:
        doc = pymupdf.open(path)
    except Exception as exc:  # corrupted / not a PDF
        raise DocumentError(f"Cannot open {path.name}: {exc}") from exc
    return _read(doc, path.name)


def load_pdf_bytes(data: bytes, name: str) -> LoadedPDF:
    """Same as load_pdf, from memory (used to validate an upload before it is stored)."""
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise DocumentError(f"Cannot open {name}: {exc}") from exc
    return _read(doc, name)
