"""Step 2 — split pages into overlapping chunks.

Recursive splitting: try to cut on paragraphs first, then lines, sentences,
words, and only as a last resort in the middle of a word. Chunks never cross
a page boundary, so every chunk keeps an exact page number for citations.
"""

from dataclasses import dataclass

from .loader import Page

SEPARATORS = ["\n\n", "\n", ". ", "? ", "! ", "; ", ": ", ", ", " ", ""]


@dataclass
class Chunk:
    text: str
    page: int
    index: int  # position of the chunk inside its document


def _split(text: str, size: int, separators: list[str]) -> list[str]:
    if len(text) <= size:
        return [text]
    for i, sep in enumerate(separators):
        if sep == "":
            return [text[j : j + size] for j in range(0, len(text), size)]
        if sep in text:
            parts = text.split(sep)
            parts = [p + sep for p in parts[:-1]] + [parts[-1]]  # keep the separator
            pieces = []
            for part in parts:
                if not part:
                    continue
                if len(part) <= size:
                    pieces.append(part)
                else:
                    pieces.extend(_split(part, size, separators[i + 1 :]))
            return pieces
    return [text]


def _merge(pieces: list[str], size: int, overlap: int) -> list[str]:
    chunks, window, window_len = [], [], 0
    for piece in pieces:
        if window and window_len + len(piece) > size:
            chunks.append("".join(window).strip())
            # drop pieces from the front until only `overlap` characters remain
            while window and (window_len > overlap or window_len + len(piece) > size):
                window_len -= len(window.pop(0))
        window.append(piece)
        window_len += len(piece)
    if window:
        chunks.append("".join(window).strip())
    return [c for c in chunks if c]


def split_text(text: str, size: int = 1000, overlap: int = 200) -> list[str]:
    if overlap >= size:
        raise ValueError("chunk overlap must be smaller than chunk size")
    text = text.strip()
    if not text:
        return []
    return _merge(_split(text, size, SEPARATORS), size, overlap)


def chunk_pages(pages: list[Page], size: int = 1000, overlap: int = 200) -> list[Chunk]:
    chunks, index = [], 0
    for page in pages:
        for text in split_text(page.text, size, overlap):
            chunks.append(Chunk(text=text, page=page.number, index=index))
            index += 1
    return chunks
