"""Display names. pt-BR names come only from the official pt-BR site (spec §2: never invent translations).

The official champion list renders names in UPPERCASE, so casing is restored deterministically:
- if the pt-BR name equals the English name ignoring case, reuse the English casing;
- otherwise title-case, keeping Portuguese particles lowercase ("NUNU E WILLUMP" -> "Nunu e Willump").
"""

import re

_PARTICLES = {"e", "de", "da", "do", "das", "dos", "a", "o"}


def restore_casing(upper_name: str, english_name: str | None) -> str:
    if english_name and upper_name.casefold() == english_name.casefold():
        return english_name
    words = re.split(r"(\s+|-)", upper_name.strip().lower())
    out = []
    for i, word in enumerate(words):
        if not word.strip() or word == "-" or (i > 0 and word in _PARTICLES):
            out.append(word)
        else:
            out.append(_cap(word))
    return "".join(out)


def _cap(word: str) -> str:
    # "kai'sa" -> "Kai'Sa", "dr." -> "Dr."
    parts = word.split("'")
    return "'".join(p[:1].upper() + p[1:] for p in parts)


def title_case_en(upper_name: str) -> str:
    return restore_casing(upper_name, None)
