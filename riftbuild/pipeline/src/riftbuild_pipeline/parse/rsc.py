"""Parser for Next.js App Router flight data (React Server Components payload).

Pages embed it as `self.__next_f.push([1, "<js string>"])` chunks. Joined, it is a sequence of rows:
`<hex id>:<json>\n` or `<hex id>:T<hex byte length>,<text>` (text rows are length-prefixed, may contain
newlines). Values reference other rows as "$<id>" / "$L<id>". This module only reads data; it never runs
any code from the page.
"""

import json
import re
from collections.abc import Callable, Iterator
from typing import Any

_PUSH = re.compile(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', re.S)
_REF = re.compile(r"^\$L?([0-9a-f]+)$")


def extract_flight(html: str) -> str:
    """Concatenate the decoded flight chunks embedded in an HTML page."""
    return "".join(json.loads(f'"{chunk}"') for chunk in _PUSH.findall(html))


def parse_rows(flight: str) -> dict[str, Any]:
    data = flight.encode("utf-8")
    rows: dict[str, Any] = {}
    pos, n = 0, len(data)
    while pos < n:
        colon = data.find(b":", pos)
        if colon == -1:
            break
        row_id = data[pos:colon].decode("ascii", errors="replace").strip()
        pos = colon + 1
        if pos < n and data[pos : pos + 1] == b"T" and re.match(rb"T[0-9a-f]+,", data[pos : pos + 12]):
            comma = data.find(b",", pos)
            length = int(data[pos + 1 : comma], 16)
            start = comma + 1
            rows[row_id] = data[start : start + length].decode("utf-8", errors="replace")
            pos = start + length
            continue
        newline = data.find(b"\n", pos)
        end = n if newline == -1 else newline
        raw = data[pos:end].decode("utf-8", errors="replace")
        pos = end + 1
        if not row_id:
            continue
        try:
            rows[row_id] = json.loads(raw)
        except json.JSONDecodeError:
            rows[row_id] = raw  # module references ("I[...]"), hints (":HL[...]") etc.
    return rows


def resolve(value: Any, rows: dict[str, Any], _depth: int = 0, _seen: frozenset[str] = frozenset()) -> Any:
    """Inline row references so the tree can be walked as plain JSON."""
    if _depth > 200:
        return None
    if isinstance(value, str):
        if value == "$undefined":
            return None
        if value.startswith("$$"):
            return value[1:]
        match = _REF.match(value)
        if match and match.group(1) in rows and match.group(1) not in _seen:
            ref = match.group(1)
            return resolve(rows[ref], rows, _depth + 1, _seen | {ref})
        return value
    if isinstance(value, list):
        return [resolve(v, rows, _depth + 1, _seen) for v in value]
    if isinstance(value, dict):
        return {k: resolve(v, rows, _depth + 1, _seen) for k, v in value.items()}
    return value


def resolved_tree(html: str) -> list[Any]:
    rows = parse_rows(extract_flight(html))
    return [resolve(v, rows) for v in rows.values() if isinstance(v, list | dict)]


def iter_elements(
    node: Any, ancestors: tuple[tuple[str, Any], ...] = ()
) -> Iterator[tuple[Any, Any, dict, tuple]]:
    """Yield (type, key, props, ancestors) for every React element ["$", type, key, props]."""
    if isinstance(node, list):
        if len(node) == 4 and node[0] == "$" and isinstance(node[3], dict):
            el_type, key, props = node[1], node[2], node[3]
            yield el_type, key, props, ancestors
            child_anc = (*ancestors, (el_type, key))
            for value in props.values():
                yield from iter_elements(value, child_anc)
            return
        for item in node:
            yield from iter_elements(item, ancestors)
    elif isinstance(node, dict):
        for value in node.values():
            yield from iter_elements(value, ancestors)


def find_dicts(node: Any, predicate: Callable[[dict], bool]) -> Iterator[dict]:
    """Yield every dict in the tree that matches predicate (depth-first)."""
    if isinstance(node, dict):
        if predicate(node):
            yield node
        for value in node.values():
            yield from find_dicts(value, predicate)
    elif isinstance(node, list):
        for item in node:
            yield from find_dicts(item, predicate)
