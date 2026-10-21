import json

from riftbuild_pipeline.parse.rsc import extract_flight, iter_elements, parse_rows, resolve


def push(chunk: str) -> str:
    return f"<script>self.__next_f.push([1,{json.dumps(chunk)}])</script>"


def test_text_rows_are_length_prefixed_in_bytes() -> None:
    text = "Olá\nmundo é"  # multibyte + newline inside a T row
    flight = f'1:T{len(text.encode()):x},{text}2:["$","div",null,{{"children":"$1"}}]\n'
    rows = parse_rows(flight)
    assert rows["1"] == text
    assert resolve(rows["2"], rows)[3]["children"] == text


def test_references_and_elements() -> None:
    flight = (
        '3:["$","section","Keystones",{"children":"$L4"}]\n'
        '4:["$","div","Slot 1",{"children":["$","$L9",null,{"slug":"electrocute","surface":"rune-browser"}]}]\n'
        'a:"$undefined"\n'
    )
    html = push(flight[:40]) + push(flight[40:])
    rows = parse_rows(extract_flight(html))
    tree = resolve(rows["3"], rows)
    found = [(props["slug"], anc) for _t, _k, props, anc in iter_elements(tree) if "slug" in props]
    assert found == [("electrocute", (("section", "Keystones"), ("div", "Slot 1")))]
    assert resolve("$undefined", rows) is None
    assert resolve("$$literal", rows) == "$literal"


def test_cyclic_references_terminate() -> None:
    rows = parse_rows('1:["$","div",null,{"children":"$2"}]\n2:["$","div",null,{"children":"$1"}]\n')
    resolve(rows["1"], rows)  # must not recurse forever
