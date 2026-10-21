"""Versioned keyword rules that derive champion tags, CC types and damage types from official ability text.

Every derived value keeps the phrase that triggered it (DECISIONS.md D11). The app labels these as
"estimado"; admin overrides win. Bump RULES_VERSION whenever a rule changes.
"""

import re
from dataclasses import dataclass

RULES_VERSION = 1

HARD_CC = ("stun", "airborne", "suppression", "root", "charm", "fear", "taunt", "sleep", "polymorph")
SOFT_CC = ("slow", "silence", "blind", "ground", "cripple")

_NEGATION = re.compile(
    r"(immun\w*|cleans\w*|remov\w*|reduc\w*|resist\w*|ignor\w*|unaffected|except|excluding)[^.]{0,30}$",
    re.I,
)

CC_PATTERNS: dict[str, re.Pattern[str]] = {
    "stun": re.compile(r"\bstun(s|ned|ning)?\b", re.I),
    "airborne": re.compile(
        r"\b(knock(s|ed|ing)?[ -](up|back|aside|into the air)|airborne|knocked up|launch(es|ed|ing)? .{0,20}into the air|pull(s|ed|ing)? .{0,30}airborne)",
        re.I,
    ),
    "suppression": re.compile(r"\bsuppress(es|ed|ing|ion)?\b", re.I),
    "root": re.compile(r"\b(root(s|ed|ing)?|snare[sd]?|immobiliz\w+)\b", re.I),
    "charm": re.compile(r"\bcharm(s|ed|ing)?\b", re.I),
    "fear": re.compile(r"\b(fear(s|ed)?|flee(s|ing)?|terrif\w+)\b", re.I),
    "taunt": re.compile(r"\btaunt(s|ed|ing)?\b", re.I),
    "sleep": re.compile(r"\b(sleep|asleep|drows\w+)\b", re.I),
    "polymorph": re.compile(r"\bpolymorph\w*\b", re.I),
    "slow": re.compile(r"\bslow(s|ed|ing)?\b", re.I),
    "silence": re.compile(r"\bsilenc(e|es|ed|ing)\b", re.I),
    "blind": re.compile(r"\b(blind(s|ed|ing)?|nearsight\w*)\b", re.I),
    "ground": re.compile(r"\bgrounded\b|\bground(s|ing)? (enemies|targets|them|the target)\b", re.I),
    "cripple": re.compile(r"\bcrippl\w+\b", re.I),
}

TAG_PATTERNS: dict[str, re.Pattern[str]] = {
    "heal": re.compile(
        r"\b(heal(s|ing|ed)?|restor(e|es|ing) .{0,25}health|regenerat\w+ .{0,25}health)\b(?! (and shield )?power)",
        re.I,
    ),
    "shield": re.compile(r"\bshield(s|ed|ing)?\b", re.I),
    "dash": re.compile(
        r"\b(dash\w*|leap\w*|lunge\w*|blink\w*|jump(s|ed|ing)?|vault\w*|charges? (forward|toward)|pulls? (him|her|it)self)\b",
        re.I,
    ),
    "invulnerability": re.compile(r"\b(invulnerab\w+|untargetab\w+|stasis)\b", re.I),
    "projectile_reflect": re.compile(
        r"\bprojectiles?\b.{0,80}\b(destroy\w*|block\w*|reflect\w*|intercept\w*)\b|\bwind ?wall\b", re.I
    ),
    "execute": re.compile(r"\bexecut\w+\b|\binstantly kill\w*\b|\bkills? .{0,40}below \d+%", re.I),
    "scaling": re.compile(
        r"\bpermanently (gain|increas)\w*|\bgains? .{0,40}permanent(ly)?\b|\bpermanent (bonus|stacks?)\b",
        re.I,
    ),
}

_DAMAGE_LABEL = re.compile(r"^(Magic|Physical|True) Damage(?! (Reduction|Taken|Reduc))", re.I)
_DAMAGE_TEXT = re.compile(r"\b(?:deal\w*|dealt|inflict\w*|bonus) (?:bonus )?(magic|physical|true) damage\b", re.I)
_HEAL_FALSE_POSITIVE = re.compile(r"grievous wounds|reduc\w+ .{0,20}heal|heal(ing)? reduction", re.I)


@dataclass(frozen=True)
class Match:
    value: str
    phrase: str


def _snippet(text: str, start: int, end: int, pad: int = 45) -> str:
    left = max(0, start - pad)
    right = min(len(text), end + pad)
    snippet = text[left:right].strip()
    return ("…" if left > 0 else "") + snippet + ("…" if right < len(text) else "")


_LIST = r"((\w+,?|or|and)\s+){0,4}$"
# CC that happens *to* the champion or describes a condition ("if she is immobilized or grounded during the cast",
# "cannot dash while grounded", "knocked down by any immobilizing crowd control") is not CC the champion applies.
_SELF_CONDITIONS = [
    re.compile(r"\b(he|she|they|it|[A-Z][\w']+)\s+(is|are|was|were|becomes?|gets?)\s+" + _LIST),
    re.compile(r"\b(if|when|while|unless)\b.*\bbecomes?\s+" + _LIST, re.I),
    re.compile(r"\b(while|by any)\s+" + _LIST, re.I),
]
_SELF_AFFECTED_AFTER = re.compile(r"^\w*\s+by (an? )?(enem|opponent|hostile)", re.I)


def _negated(text: str, start: int, end: int | None = None) -> bool:
    window = text[max(0, start - 80) : start]
    sentence_start = max(window.rfind("."), window.rfind(";"))
    clause = window[sentence_start + 1 :]
    if _NEGATION.search(clause):
        return True
    after = text[end : end + 40] if end is not None else ""
    if _SELF_AFFECTED_AFTER.search(after):
        return True
    return any(p.search(clause) for p in _SELF_CONDITIONS)


def find_cc(text: str) -> list[Match]:
    found: list[Match] = []
    for cc, pattern in CC_PATTERNS.items():
        for m in pattern.finditer(text):
            if _negated(text, m.start(), m.end()):
                continue
            found.append(Match(cc, _snippet(text, m.start(), m.end())))
            break
    return found


def find_tags(text: str) -> list[Match]:
    found: list[Match] = []
    for tag, pattern in TAG_PATTERNS.items():
        for m in pattern.finditer(text):
            if _negated(text, m.start()):
                continue
            if tag == "heal" and _HEAL_FALSE_POSITIVE.search(text[max(0, m.start() - 40) : m.end() + 20]):
                continue
            found.append(Match(tag, _snippet(text, m.start(), m.end())))
            break
    return found


def find_damage_types(labels: list[str], text: str) -> list[str]:
    types: list[str] = []
    for label in labels:
        m = _DAMAGE_LABEL.match(label.strip())
        if m and m.group(1).lower() not in types:
            types.append(m.group(1).lower())
    for m in _DAMAGE_TEXT.finditer(text):
        kind = m.group(1).lower()
        if kind not in types:
            types.append(kind)
    return types


# Basic attacks deal physical damage; how much they weigh depends on the champion's class.
AUTO_ATTACK_WEIGHT = {
    "marksman": 3.0,
    "fighter": 1.5,
    "assassin": 1.0,
    "tank": 0.6,
    "mage": 0.25,
    "support": 0.25,
}
ABILITY_WEIGHT = {"P": 0.5, "Q": 1.0, "W": 1.0, "E": 1.0, "R": 1.5}


def damage_profile(abilities: list[tuple[str, list[str]]], classes: list[str]) -> dict[str, float] | None:
    """Heuristic v1: weight each ability's damage types, add basic attacks by class, normalize."""
    totals = {"physical": 0.0, "magic": 0.0, "true": 0.0}
    for key, types in abilities:
        if not types:
            continue
        share = ABILITY_WEIGHT.get(key, 1.0) / len(types)
        for t in types:
            totals[t] += share
    if classes:
        totals["physical"] += max(AUTO_ATTACK_WEIGHT.get(c, 0.5) for c in classes)
    total = sum(totals.values())
    if total <= 0:
        return None
    physical = round(totals["physical"] / total, 2)
    magic = round(totals["magic"] / total, 2)
    true = round(max(0.0, 1 - physical - magic), 2)
    return {"physical": physical, "magic": magic, "true": true}
