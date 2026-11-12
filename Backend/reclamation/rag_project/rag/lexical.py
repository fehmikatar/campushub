"""Keyword search (BM25) over a Chroma collection.

Semantic search misses exact terms (rule IDs, "B2", "ECTS", "7.4", numbers);
BM25 catches them. Text is accent-folded and lightly stemmed, so
"rattrapage"/"Rattrapages" and "épreuve"/"epreuves" match.

The index is built in memory from the collection and cached until the
collection changes (see vectorstore.touch / version).
"""

import math
import re
import unicodedata
from collections import Counter

from . import vectorstore

STOPWORDS = set("""
a au aux avec ce ces cet cette dans de des du elle en est et etre il ils je la le les leur lui
ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta
te tes toi ton tu un une vos votre vous y ai as avons avez ont suis sont etait sera peut doit dois
faut quel quelle quels quelles comment combien quand est-ce ca cela ceci si plus moins tres
peux peut puis dois doit veux sais suis mon ma mes c'est quoi
the of and or to in on for is are be by with at as an it this that from what which how when do
does can my i me
""".split())


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


# Light French/English suffix stripping (accents already folded):
# "validés"/"validation"/"valider" -> "valid", "passer"/"passage" -> "pass"
SUFFIXES = sorted("""
issements issement atrices ateurs ations ements ation ement ments ment ances ance ences ence
ites ite ives ive ifs euses euse eurs eur ees ee es er ez age ages ants ant aux al ales ale s x e
ing ed ions ion
""".split(), key=len, reverse=True)


def _stem(token: str) -> str:
    if token.isdigit() or len(token) <= 4:
        return token
    for suffix in SUFFIXES:
        if token.endswith(suffix) and len(token) - len(suffix) >= 4:
            return token[: -len(suffix)]
    return token


def tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+(?:[./][0-9]+)?", normalize(text))
    return [_stem(t) for t in tokens if t not in STOPWORDS and (len(t) > 1 or t.isdigit())]


class BM25:
    def __init__(self, documents: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b
        self.docs = [Counter(d) for d in documents]
        self.lengths = [len(d) for d in documents]
        self.avg_len = (sum(self.lengths) / len(self.lengths)) if self.lengths else 0.0
        df = Counter(term for d in self.docs for term in d)
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def scores(self, query: list[str]) -> list[float]:
        out = []
        for doc, length in zip(self.docs, self.lengths):
            score = 0.0
            for term in set(query):
                tf = doc.get(term)
                if not tf:
                    continue
                norm = self.k1 * (1 - self.b + self.b * length / (self.avg_len or 1))
                score += self.idf[term] * tf * (self.k1 + 1) / (tf + norm)
            out.append(score)
        return out


_cache: dict[tuple, tuple[list[vectorstore.Hit], BM25]] = {}


def _index(name: str, where: dict | None):
    key = (name, repr(sorted((where or {}).items())))
    stamp = (vectorstore.version(name), vectorstore.count(name))
    cached = _cache.get(key)
    if cached and cached[0] == stamp:
        return cached[1]
    hits = vectorstore.get_all(name, where)
    # Prefer a dedicated lexical text (e.g. rule + French keywords) when present
    bm25 = BM25([tokenize(h.metadata.get("lexical_text") or h.text) for h in hits])
    _cache[key] = (stamp, (hits, bm25))
    return hits, bm25


def search(name: str, query: str, top_k: int, where: dict | None = None) -> list[tuple[vectorstore.Hit, float]]:
    hits, bm25 = _index(name, where)
    if not hits:
        return []
    scores = bm25.scores(tokenize(query))
    ranked = sorted(zip(hits, scores), key=lambda x: x[1], reverse=True)
    return [(h, s) for h, s in ranked[:top_k] if s > 0]
