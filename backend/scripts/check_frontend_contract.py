#!/usr/bin/env python
"""Static contract check: backend OpenAPI vs the two TypeScript API clients.

Compares `/openapi.json` (live server, or `app.main:app.openapi()` as a fallback) with
`frontend-basic/src/api.ts` (the reference client) and frontend-main's copy
(`frontend-main/src/data/api.ts`). No TypeScript compiler is used: both files are parsed with
a small string-aware scanner plus a recursive-descent parser for TS type expressions.

Groups printed (exit code 1 if any of the first three is non-empty):
  MISSING ROUTES     client calls a path/method the server does not have
  PARAM MISMATCHES   required query/body field not supplied, or an undeclared one sent
  FIELD MISMATCHES   TS type expects a response field/shape the OpenAPI schema lacks
  UNVERIFIABLE       backend schema is an untyped dict / `{}`: cannot be checked (not guessed)
  UNUSED SERVER ROUTES
  SECTION GAPS       api.ts sections / routes / types present in one frontend but not the other
  plus informational notes (schema-required fields TS lacks, nullable drift, UI use of unknown client fns)

Usage: python scripts/check_frontend_contract.py [--base http://localhost:8000] [--basic PATH] [--main PATH]
Writes scripts/frontend-contract-result.json next to this file.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
ROOT = BACKEND.parent
RESULT_JSON = HERE / "frontend-contract-result.json"

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:  # pragma: no cover
    pass


# --------------------------------------------------------------------------- OpenAPI loading
def load_openapi(base: str) -> tuple[dict, str]:
    try:
        import urllib.request

        with urllib.request.urlopen(base.rstrip("/") + "/openapi.json", timeout=10) as r:
            return json.loads(r.read().decode("utf-8")), f"live server {base}/openapi.json"
    except Exception as e:  # server down -> import the app
        sys.path.insert(0, str(BACKEND))
        from app.main import app  # type: ignore

        return app.openapi(), f"app.main:app.openapi() (server unreachable: {type(e).__name__})"


def deref(oa: dict, s: dict | None) -> dict:
    s = s or {}
    seen = 0
    while "$ref" in s and seen < 20:
        name = s["$ref"].split("/")[-1]
        s = oa["components"]["schemas"].get(name, {})
        seen += 1
    return s


def schema_core(oa: dict, s: dict | None) -> tuple[dict, bool]:
    """Resolve $ref / anyOf-with-null / allOf. Returns (schema, nullable)."""
    s = deref(oa, s)
    nullable = False
    for key in ("anyOf", "oneOf"):
        if key in s:
            members = [deref(oa, m) for m in s[key]]
            nonnull = [m for m in members if m.get("type") != "null"]
            nullable = len(nonnull) != len(members)
            if len(nonnull) == 1:
                inner, n2 = schema_core(oa, nonnull[0])
                return inner, nullable or n2
            return {"_union": nonnull}, nullable
    if "allOf" in s and len(s["allOf"]) == 1:
        return schema_core(oa, s["allOf"][0])
    if s.get("type") == "null":
        return {}, True
    return s, nullable


def sch_kind(s: dict) -> str:
    if "_union" in s:
        return "union"
    if s.get("properties"):
        return "object"
    t = s.get("type")
    if t == "array":
        return "array"
    if t == "object" or "additionalProperties" in s:
        return "dict"
    if t in ("string", "number", "integer", "boolean"):
        return t
    return "any"


# --------------------------------------------------------------------------- TS scanning helpers
def strip_comments(src: str) -> str:
    out: list[str] = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in "'\"`":
            j = i + 1
            while j < n:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == c:
                    break
                j += 1
            out.append(src[i : j + 1])
            i = j + 1
            continue
        if src.startswith("//", i):
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
            continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2)
            j = n - 2 if j < 0 else j
            out.append(re.sub(r"[^\n]", " ", src[i : j + 2]))
            i = j + 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


def skip_string(s: str, i: int) -> int:
    q = s[i]
    j = i + 1
    while j < len(s):
        if s[j] == "\\":
            j += 2
            continue
        if s[j] == q:
            return j
        j += 1
    return len(s) - 1


def scan_balanced(s: str, i: int, o: str, c: str) -> int:
    depth = 0
    while i < len(s):
        ch = s[i]
        if ch in "'\"`":
            i = skip_string(s, i) + 1
            continue
        if ch == o:
            depth += 1
        elif ch == c:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return len(s) - 1


def scan_angle(s: str, i: int) -> int:
    depth = 0
    while i < len(s):
        ch = s[i]
        if ch in "'\"`":
            i = skip_string(s, i) + 1
            continue
        if ch == "<":
            depth += 1
        elif ch == ">" and s[i - 1] != "=":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return len(s) - 1


def split_top(s: str) -> list[str]:
    parts, depth, cur, i = [], 0, [], 0
    while i < len(s):
        ch = s[i]
        if ch in "'\"`":
            j = skip_string(s, i)
            cur.append(s[i : j + 1])
            i = j + 1
            continue
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
        i += 1
    tail = "".join(cur)
    if tail.strip():
        parts.append(tail)
    return [p.strip() for p in parts if p.strip()]


# --------------------------------------------------------------------------- TS type parser
TOK = re.compile(
    r"\s*(?:(?P<str>'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")|(?P<num>-?\d+(?:\.\d+)?)"
    r"|(?P<id>[A-Za-z_$][\w$]*)|(?P<p>=>|\.\.\.|[{}\[\]()<>,;:?|&=.]))"
)


def tokenize(text: str) -> list[tuple[str, str]]:
    toks, pos = [], 0
    text = text.rstrip()
    while pos < len(text):
        m = TOK.match(text, pos)
        if not m or m.end() == pos:
            pos += 1
            continue
        pos = m.end()
        kind = m.lastgroup or "p"
        toks.append((kind, m.group(kind)))
    return toks


OTHER = {"k": "other"}
UNKNOWN = {"k": "prim", "n": "unknown"}


class TypeParser:
    def __init__(self, toks):
        self.t = toks
        self.i = 0

    def peek(self, off=0):
        j = self.i + off
        return self.t[j] if j < len(self.t) else ("eof", "")

    def eat(self, val=None):
        tok = self.peek()
        if val is not None and tok[1] != val:
            return None
        self.i += 1
        return tok

    def parse(self):
        return self.union()

    def union(self):
        self.eat("|")
        ms = [self.inter()]
        while self.peek()[1] == "|":
            self.i += 1
            ms.append(self.inter())
        return ms[0] if len(ms) == 1 else {"k": "union", "ms": ms}

    def inter(self):
        ms = [self.postfix()]
        while self.peek()[1] == "&":
            self.i += 1
            ms.append(self.postfix())
        return ms[0] if len(ms) == 1 else {"k": "inter", "ms": ms}

    def postfix(self):
        t = self.primary()
        while self.peek()[1] == "[":
            if self.peek(1)[1] == "]":
                self.i += 2
                t = {"k": "arr", "el": t}
            else:  # indexed access type, e.g. (typeof X)[number]
                j = self.i
                depth = 0
                while j < len(self.t):
                    if self.t[j][1] == "[":
                        depth += 1
                    elif self.t[j][1] == "]":
                        depth -= 1
                        if depth == 0:
                            break
                    j += 1
                self.i = j + 1
                t = OTHER
        return t

    def primary(self):
        kind, val = self.peek()
        if val == "(":
            j, depth = self.i, 0
            while j < len(self.t):
                if self.t[j][1] == "(":
                    depth += 1
                elif self.t[j][1] == ")":
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            if j + 1 < len(self.t) and self.t[j + 1][1] == "=>":  # function type
                self.i = j + 2
                self.union()
                return OTHER
            self.i += 1
            t = self.union()
            self.eat(")")
            return t
        if val == "{":
            self.i += 1
            return self.members()
        if val == "[":
            self.i += 1
            while self.peek()[1] not in ("]", ""):
                self.union()
                self.eat(",")
            self.eat("]")
            return {"k": "tuple"}
        if kind == "str":
            self.i += 1
            return {"k": "lit", "v": val[1:-1]}
        if kind == "num":
            self.i += 1
            return {"k": "lit", "v": val}
        if kind == "id":
            self.i += 1
            if val == "typeof":
                self.eat()
                while self.peek()[1] == ".":
                    self.i += 2
                return OTHER
            if val in ("keyof", "readonly", "unique"):
                return self.postfix()
            name = val
            while self.peek()[1] == "." and self.peek(1)[0] == "id":
                self.i += 2
                name += "." + self.t[self.i - 1][1]
            args = []
            if self.peek()[1] == "<":
                self.i += 1
                while self.peek()[1] not in (">", ""):
                    args.append(self.union())
                    self.eat(",")
                self.eat(">")
            if name in ("string", "number", "boolean", "null", "undefined", "unknown", "any", "void", "never", "bigint"):
                return {"k": "prim", "n": name}
            if name in ("true", "false"):
                return {"k": "prim", "n": "boolean"}
            if name == "Record":
                return {"k": "rec", "val": args[1] if len(args) > 1 else UNKNOWN}
            if name == "Array" and args:
                return {"k": "arr", "el": args[0]}
            if name in ("Partial", "Omit", "Pick", "Required", "Promise", "Readonly"):
                return OTHER
            return {"k": "ref", "name": name}
        self.i += 1
        return OTHER

    def members(self):
        props, index = {}, False
        while True:
            kind, val = self.peek()
            if val == "}" or kind == "eof":
                self.i += 1
                break
            if val in (";", ","):
                self.i += 1
                continue
            if val == "readonly":
                self.i += 1
                kind, val = self.peek()
            if val == "[":  # index signature
                depth = 0
                while self.i < len(self.t):
                    if self.t[self.i][1] == "[":
                        depth += 1
                    elif self.t[self.i][1] == "]":
                        depth -= 1
                        if depth == 0:
                            self.i += 1
                            break
                    self.i += 1
                self.eat("?")
                if self.eat(":"):
                    self.union()
                index = True
                continue
            if kind in ("id", "str"):
                key = val.strip("'\"")
                self.i += 1
                opt = bool(self.eat("?"))
                if self.eat(":"):
                    props[key] = {"opt": opt, "t": self.union()}
                elif self.peek()[1] == "(":  # method signature, ignore
                    j = scan_balanced_tokens(self.t, self.i)
                    self.i = j + 1
                    if self.eat(":"):
                        self.union()
                continue
            self.i += 1
        return {"k": "obj", "props": props, "index": index}


def scan_balanced_tokens(toks, i):
    depth = 0
    while i < len(toks):
        if toks[i][1] == "(":
            depth += 1
        elif toks[i][1] == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return len(toks) - 1


def parse_type_text(text: str) -> dict:
    toks = tokenize(text)
    if not toks:
        return OTHER
    try:
        return TypeParser(toks).parse()
    except Exception:
        return OTHER


def parse_object_body(body_with_braces: str) -> dict:
    toks = tokenize(body_with_braces)
    p = TypeParser(toks)
    p.eat("{")
    return p.members()


def collect_types(src: str) -> dict[str, dict]:
    """exported interface/type name -> parsed type structure (interfaces get 'extends')."""
    types: dict[str, dict] = {}
    for m in re.finditer(r"export\s+interface\s+(\w+)(?:<[^>{]*>)?(?:\s+extends\s+([\w\s,<>]+?))?\s*\{", src):
        j = scan_balanced(src, m.end() - 1, "{", "}")
        t = parse_object_body(src[m.end() - 1 : j + 1])
        if m.group(2):
            t = {"k": "inter", "ms": [{"k": "ref", "name": n.strip()} for n in m.group(2).split(",")] + [t]}
        types[m.group(1)] = t
    for m in re.finditer(r"export\s+type\s+(\w+)(?:<[^>=]*>)?\s*=\s*", src):
        i, depth = m.end(), 0
        while i < len(src):
            ch = src[i]
            if ch in "'\"`":
                i = skip_string(src, i) + 1
                continue
            if ch in "({[":
                depth += 1
            elif ch in ")}]":
                depth -= 1
            elif ch == ";" and depth == 0:
                break
            i += 1
        types[m.group(1)] = parse_type_text(src[m.end() : i])
    return types


def type_sig(t) -> str:
    return json.dumps(t, sort_keys=True)


# --------------------------------------------------------------------------- client call extraction
class Call:
    def __init__(self, **kw):
        self.__dict__.update(kw)

    def to_json(self):
        d = dict(self.__dict__)
        d.pop("ts_type", None)
        return {k: (sorted(v) if isinstance(v, set) else v) for k, v in d.items()}


def norm_path(p: str) -> str:
    p = p.split("?")[0]
    p = re.sub(r"\$\{[^{}]*\}", "{}", p)
    p = re.sub(r"\{[^{}]*\}", "{}", p)
    return p.rstrip("/") or "/"


def parse_keys(arg: str | None, spreads: dict[str, list[str]] | None = None):
    """Return (keys, ok). arg None/'undefined' -> no keys. Non-literal -> (None, False)."""
    if arg is None or arg.strip() in ("", "undefined"):
        return [], True
    arg = arg.strip()
    if arg.startswith("{") and arg.endswith("}"):
        keys: list[str] = []
        for ent in split_top(arg[1:-1]):
            if ent.startswith("..."):
                nm = ent[3:].strip()
                if spreads and nm in spreads:
                    keys += spreads[nm]
                    continue
                return None, False
            m = re.match(r"""^(?:['"]?([\w$]+)['"]?)\s*(?::|$)""", ent)
            if not m:
                return None, False
            keys.append(m.group(1))
        return keys, True
    if spreads and arg in spreads:
        return list(spreads[arg]), True
    return None, False


def api_member_headers(src: str) -> tuple[list[tuple[int, str, str | None, bool]], int, int]:
    """Headers inside `export const api = {`: (offset, section, member, section_is_container)."""
    m = re.search(r"export\s+const\s+api\s*=\s*\{", src)
    if not m:
        return [], 0, 0
    end = scan_balanced(src, m.end() - 1, "{", "}")
    heads: list[tuple[int, str, str | None, bool]] = []
    cur_sec, container = None, False
    for h in re.finditer(r"^( {2}|\t)(\w+):[ \t]*(\{|\()?", src[m.end() : end], re.M):
        off = m.end() + h.start()
        cur_sec, container = h.group(2), (h.group(3) == "{")
        heads.append((off, cur_sec, None, container))
    # depth-2 members only inside containers
    for h in re.finditer(r"^( {4}|\t\t)(\w+):", src[m.end() : end], re.M):
        off = m.end() + h.start()
        sec = None
        for o, s, _, c in heads:
            if o < off and c is not None and _ is None:
                sec = (s, c)
        if sec and sec[1]:
            heads.append((off, sec[0], h.group(2), True))
    heads.sort(key=lambda x: x[0])
    return heads, m.start(), end


def extract_api_calls(src_raw: str, file_label: str) -> tuple[list[Call], list[str], dict]:
    src = strip_comments(src_raw)
    heads, a0, a1 = api_member_headers(src)
    sections = []
    members: dict[str, list[str]] = {}
    for _, sec, mem, _c in heads:
        if sec not in sections:
            sections.append(sec)
        if mem:
            members.setdefault(sec, []).append(mem)
    calls: list[Call] = []
    for m in re.finditer(r"(?<![\w.$])(getRaw|get|post|buildUrl)\s*(?=[<(])", src):
        if not (a0 <= m.start() <= a1):
            continue
        i = m.end()
        generic = None
        if src[i] == "<":
            j = scan_angle(src, i)
            generic = src[i + 1 : j].strip()
            i = j + 1
            while i < len(src) and src[i].isspace():
                i += 1
        if i >= len(src) or src[i] != "(":
            continue
        j = scan_balanced(src, i, "(", ")")
        args = split_top(src[i + 1 : j])
        if not args or args[0][0] not in "'\"`":
            continue
        raw_path = args[0][1:-1]
        if not raw_path.startswith("/api"):
            continue
        kind = m.group(1)
        method = "POST" if kind == "post" else "GET"
        params_arg = body_arg = None
        if kind in ("get", "getRaw"):
            params_arg = args[1] if len(args) > 1 else None
        elif kind == "post":
            body_arg = args[1] if len(args) > 1 else None
            params_arg = args[2] if len(args) > 2 else None
        else:
            params_arg = args[1] if len(args) > 1 else None
            mm = re.match(r"\s*,\s*\{\s*method:\s*['\"](\w+)['\"]", src[j + 1 : j + 80])
            if mm:
                method = mm.group(1).upper()
        # member context
        label, mtext = "?", ""
        for idx, (off, sec, mem, _c) in enumerate(heads):
            if off <= m.start():
                label = f"api.{sec}" + (f".{mem}" if mem else "")
                nxt = heads[idx + 1][0] if idx + 1 < len(heads) else a1
                mtext = src[off:nxt]
        pkeys, pok = parse_keys(params_arg)
        body = None
        if body_arg is not None and body_arg.strip() != "undefined":
            b = body_arg.strip()
            if re.fullmatch(r"\w+", b) and re.search(rf"\b{b}\s*=\s*new FormData", mtext):
                names = re.findall(rf"\b{b}\.append\(\s*['\"](\w+)['\"]", mtext)
                body = {"form": True, "keys": names, "optional": set(), "typed": False}
            elif b.startswith("{"):
                keys, ok = parse_keys(b)
                body = {"form": False, "keys": keys or [], "optional": set(), "typed": False} if ok else {"unparsed": True}
            elif re.fullmatch(r"\w+", b):
                mm = re.search(rf"\b{b}\s*:\s*\{{", mtext)
                if mm:
                    k = scan_balanced(mtext, mm.end() - 1, "{", "}")
                    obj = parse_object_body(mtext[mm.end() - 1 : k + 1])
                    body = {
                        "form": False,
                        "keys": list(obj["props"]),
                        "optional": {n for n, p in obj["props"].items() if p["opt"]},
                        "typed": True,
                    }
                else:
                    body = {"unparsed": True}
            else:
                body = {"unparsed": True}
        calls.append(
            Call(
                file=file_label,
                via=label,
                helper=kind,
                method=method,
                path=norm_path(raw_path),
                raw_path=raw_path,
                params=pkeys if pok else None,
                body=body,
                generic=generic,
                ts_type=parse_type_text(generic) if generic else None,
            )
        )
    return calls, sections, members


def extract_ancillary_calls(src_dir: Path, skip: Path, label_root: Path) -> list[Call]:
    """Direct fetch(`${API_BASE}/api/..`) calls and `{ path: '/api/..', params }` tables outside api.ts."""
    calls: list[Call] = []
    for f in sorted(list(src_dir.rglob("*.ts")) + list(src_dir.rglob("*.tsx"))):
        if f.resolve() == skip.resolve() or "node_modules" in f.parts:
            continue
        try:
            txt = f.read_text(encoding="utf-8")
        except Exception:
            continue
        frel = rel(f)
        for m in re.finditer(r"`\$\{API_BASE\}(/api/[^`?]*)(\?[^`]*)?`", txt):
            tail = txt[m.end() : m.end() + 260]
            cut = re.search(r"\bawait\b|\bfetch\(|\n\s*\n", tail[1:])
            tail = tail[: (cut.start() + 1) if cut else len(tail)]
            mm = re.search(r"method:\s*['\"](\w+)['\"]", tail)
            body = None
            sm = re.search(r"JSON\.stringify\(\s*(\{.*\})\s*\)", tail, re.S)
            if sm:
                keys, ok = parse_keys(sm.group(1))
                body = {"form": False, "keys": keys or [], "optional": set(), "typed": False} if ok else {"unparsed": True}
            qkeys = re.findall(r"[?&](\w+)=", m.group(2) or "")
            calls.append(
                Call(file=frel, via="fetch(${API_BASE}...)", helper="fetch", method=(mm.group(1).upper() if mm else "GET"),
                     path=norm_path(m.group(1)), raw_path=m.group(1), params=qkeys, body=body, generic=None, ts_type=None)
            )
        spreads: dict[str, list[str]] = {}
        for sm2 in re.finditer(r"const\s+(\w+)\s*=\s*(\{)", txt):
            k = scan_balanced(txt, sm2.end(2) - 1, "{", "}")
            ks, ok = parse_keys(txt[sm2.end(2) - 1 : k + 1])
            if ok:
                spreads[sm2.group(1)] = ks or []
        for m in re.finditer(r"\bpath:\s*['\"](/api/[^'\"]*)['\"]", txt):
            j = txt.rfind("{", 0, m.start())
            if j < 0:
                continue
            ent = txt[j : scan_balanced(txt, j, "{", "}") + 1]
            pm = re.search(r"\bparams:\s*", ent)
            params, ok = [], True
            if pm:
                rest = ent[pm.end() :]
                if rest.startswith("{"):
                    params, ok = parse_keys(rest[: scan_balanced(rest, 0, "{", "}") + 1], spreads)
                else:
                    ident = re.match(r"[\w$]+", rest)
                    params, ok = parse_keys(ident.group(0) if ident else None, spreads) if ident else (None, False)
            calls.append(
                Call(file=frel, via="endpoint table", helper="table", method="GET", path=norm_path(m.group(1)),
                     raw_path=m.group(1), params=params if ok else None, body=None, generic=None, ts_type=None)
            )
    return calls


def ui_client_usage(src_dir: Path, skip: Path, label_root: Path, sections: list[str], members: dict[str, list[str]]) -> list[dict]:
    """Check `api.<section>.<member>` references in files that import `api` from the client."""
    bad = []
    for f in sorted(list(src_dir.rglob("*.ts")) + list(src_dir.rglob("*.tsx"))):
        if f.resolve() == skip.resolve() or "node_modules" in f.parts:
            continue
        try:
            txt = f.read_text(encoding="utf-8")
        except Exception:
            continue
        if not re.search(r"import\s+(?:api\b|\{[^}]*\bapi\b[^}]*\}|api,)[^;]*from\s+['\"][^'\"]*(?:/api|\.\./api)['\"]", txt):
            continue
        for m in re.finditer(r"(?<![\w.$])api\.(\w+)(?:\.(\w+))?", txt):
            sec, mem = m.group(1), m.group(2)
            ok = sec in sections and (mem is None or mem in members.get(sec, []) or (sec not in members and False))
            if sec in sections and mem is not None and sec not in members:
                ok = False  # section is a function, e.g. api.aurora.foo
            if not ok:
                bad.append({"file": rel(f), "ref": m.group(0)})
    return bad


# --------------------------------------------------------------------------- route matching
def build_routes(oa: dict) -> dict[str, dict[str, dict]]:
    return {p: {m.upper(): op for m, op in ops.items() if m.lower() in ("get", "post", "put", "delete", "patch")} for p, ops in oa["paths"].items()}


def seg_regex(seg: str) -> re.Pattern:
    return re.compile("^" + re.escape(seg).replace(re.escape("{}"), "[^/]+") + "$")


def match_route(routes, cpath: str, method: str):
    csegs = cpath.strip("/").split("/")
    cands = []
    for p in routes:
        osegs = norm_path(p).strip("/").split("/")
        if len(osegs) != len(csegs):
            continue
        if all(seg_regex(o).match(c) for o, c in zip(osegs, csegs)):
            cands.append((sum(1 for o, c in zip(osegs, csegs) if o == c), p))
    cands.sort(key=lambda x: -x[0])
    for _, p in cands:
        if method in routes[p]:
            return p, routes[p][method], [pp for _, pp in cands]
    return None, None, [p for _, p in cands]


def response_schema(oa: dict, op: dict) -> tuple[dict | None, str]:
    """(schema for client-visible data, wrapper) where wrapper in envelope|plain|untyped."""
    resp = op.get("responses", {}).get("200", {})
    content = resp.get("content", {}).get("application/json")
    if content is None:
        return None, "untyped"
    s = content.get("schema") or {}
    core, _ = schema_core(oa, s)
    if not core:
        return None, "untyped"
    props = core.get("properties", {})
    if "data" in props and "provenance" in props:
        return props["data"], "envelope"
    return s, "plain"


# --------------------------------------------------------------------------- type comparison
class Cmp:
    def __init__(self, oa: dict, types: dict[str, dict]):
        self.oa, self.types = oa, types
        self.findings: list[dict] = []
        self.unverif: list[dict] = []

    def add(self, kind, path, msg):
        self.findings.append({"kind": kind, "path": path, "msg": msg})

    def resolve(self, t, depth=0):
        while t.get("k") == "ref" and depth < 20:
            nt = self.types.get(t["name"])
            if nt is None:
                return OTHER
            t = nt
            depth += 1
        if t.get("k") == "inter":
            ms = [self.resolve(m) for m in t["ms"]]
            if all(m.get("k") == "obj" for m in ms):
                props, index = {}, False
                for m in ms:
                    props.update(m["props"])
                    index = index or m["index"]
                return {"k": "obj", "props": props, "index": index}
            objs = [m for m in ms if m.get("k") == "obj"]
            return objs[0] if len(objs) == 1 and all(m.get("k") in ("obj", "other") for m in ms) else OTHER
        return t

    def compare(self, ts, sch, path, ts_nullable=False, depth=0):
        if depth > 14:
            return
        ts = self.resolve(ts)
        core, snull = schema_core(self.oa, sch)
        sk = sch_kind(core)
        k = ts["k"]
        if k == "union":
            ms = [self.resolve(m) for m in ts["ms"]]
            nonnull = [m for m in ms if not (m["k"] == "prim" and m["n"] in ("null", "undefined"))]
            nullable = len(nonnull) != len(ms)
            if len(nonnull) == 1:
                return self.compare(nonnull[0], sch, path, nullable or ts_nullable, depth)
            if any(m["k"] in ("rec", "other") or (m["k"] == "prim" and m["n"] in ("unknown", "any")) for m in nonnull):
                return
            if all(m["k"] == "lit" for m in nonnull):
                return self.compare_lits([m["v"] for m in nonnull], core, sk, path)
            if all(m["k"] in ("lit", "prim") for m in nonnull):
                return  # e.g. 'a' | 'b' | string
            return  # union of several object shapes: not attempted
        if snull and not ts_nullable and k in ("prim", "lit", "obj", "arr") and not (k == "prim" and ts["n"] in ("unknown", "any")):
            self.add("nullable", path, "OpenAPI allows null here but the TS type is not nullable")
        if k in ("other", "rec", "tuple"):
            return
        if k == "prim" and ts["n"] in ("unknown", "any", "null", "undefined", "void", "never"):
            return
        if sk == "union":
            return
        if k == "prim":
            n = ts["n"]
            if sk == "any":
                return
            ok = (n == "number" and sk in ("number", "integer")) or (n == "string" and sk == "string") or (n == "boolean" and sk == "boolean")
            if not ok:
                self.add("type", path, f"TS `{n}` but OpenAPI says `{core.get('type', sk)}`")
            return
        if k == "lit":
            return self.compare_lits([ts["v"]], core, sk, path)
        if k == "arr":
            if sk == "array":
                return self.compare(ts["el"], core.get("items", {}), path + "[]", False, depth + 1)
            if sk == "any":
                self.unverif.append({"path": path, "reason": "OpenAPI schema is untyped here"})
            else:
                self.add("shape", path, f"TS expects an array but OpenAPI says `{sk}`")
            return
        if k == "obj":
            if sk == "object":
                props = core["properties"]
                for name, p in ts["props"].items():
                    if name not in props:
                        self.add("missing_in_schema", f"{path}.{name}", "TS expects this property; OpenAPI schema has no such field")
                    else:
                        self.compare(p["t"], props[name], f"{path}.{name}", False, depth + 1)
                if not ts["index"]:
                    for name in core.get("required", []):
                        if name not in ts["props"]:
                            self.add("required_not_in_ts", f"{path}.{name}", "required in OpenAPI schema, not declared in the TS type")
                return
            if sk in ("dict", "any"):
                if ts["props"]:
                    self.unverif.append({"path": path, "reason": f"OpenAPI schema is an untyped {'dict' if sk == 'dict' else 'schema'}; "
                                         f"{len(ts['props'])} TS properties cannot be verified"})
                return
            if sk == "array":
                self.add("shape", path, "TS expects an object but OpenAPI says `array`")
            else:
                self.add("type", path, f"TS expects an object but OpenAPI says `{sk}`")

    def compare_lits(self, vals, core, sk, path):
        enum = core.get("enum") or ([core["const"]] if "const" in core else None)
        if enum:
            extra = [v for v in vals if v not in enum and str(v) not in [str(e) for e in enum]]
            if extra:
                self.add("enum", path, f"TS literal(s) {extra} not in OpenAPI enum {enum}")
        elif sk == "any":
            return


# --------------------------------------------------------------------------- the checks
def rel(p: Path) -> str:
    try:
        return str(p.resolve().relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return str(p)


def short(s: str, n=70) -> str:
    s = re.sub(r"\s+", " ", s or "")
    return s if len(s) <= n else s[: n - 1] + "…"


def run_checks(oa: dict, files: dict[str, Path]):
    routes = build_routes(oa)
    results = {
        "missing_routes": {},
        "param_mismatches": {},
        "field_mismatches": {},
        "unverifiable": {},
        "notes": {"required_not_in_ts": {}, "nullable": {}, "envelope": {}, "unparsed_params": {}},
    }
    all_calls: dict[str, list[Call]] = {}
    sections: dict[str, list[str]] = {}
    members: dict[str, dict] = {}
    types: dict[str, dict[str, dict]] = {}
    ui_bad: dict[str, list[dict]] = {}
    called: dict[str, set[tuple[str, str]]] = {}

    for label, path in files.items():
        raw = path.read_text(encoding="utf-8")
        calls, secs, mems = extract_api_calls(raw, label)
        src_root = path.parent if path.parent.name == "src" else path.parent.parent
        extra = extract_ancillary_calls(src_root, path, src_root.parent)
        for c in extra:
            c.file = f"{label}:{c.file}"
        all_calls[label] = calls + extra
        sections[label], members[label] = secs, mems
        types[label] = collect_types(strip_comments(raw))
        ui_bad[label] = ui_client_usage(src_root, path, src_root.parent, secs, mems)
        called[label] = set()

    def bucket(group, key, entry, label):
        d = results[group].setdefault(key, {"entry": entry, "files": []})
        if label not in d["files"]:
            d["files"].append(label)

    for label, calls in all_calls.items():
        cmp_types = types[label]
        for c in calls:
            ident = f"{c.method} {c.raw_path}"
            p, op, cands = match_route(routes, c.path, c.method)
            if op is None:
                why = (f"path matches {cands[0]} but server defines only {sorted(routes[cands[0]])}" if cands else "no such path on the server")
                bucket("missing_routes", f"{ident}|{c.via}", {"call": ident, "from": f"{c.file} ({c.via})", "why": why}, label)
                continue
            called[label].add((c.method, p))
            wild = [cs for o, cs in zip(norm_path(p).strip("/").split("/"), c.path.strip("/").split("/")) if "{}" in o and "{}" not in cs]
            if wild:
                bucket("missing_routes", f"{ident}|{c.via}|wild",
                       {"call": ident, "from": f"{c.file} ({c.via})",
                        "why": f"no literal route: segment `{wild[0]}` only matches the path parameter of {c.method} {p} (probable typo)"}, label)
            # --- query params
            qp = {x["name"]: x.get("required", False) for x in op.get("parameters", []) if x["in"] == "query"}
            if c.params is None:
                results["notes"]["unparsed_params"].setdefault(f"{ident} [{c.file}]", {"files": [label]})
            else:
                missing = [n for n, req in qp.items() if req and n not in c.params]
                for n in missing:
                    bucket("param_mismatches", f"{ident}|{c.via}|missing {n}",
                           {"call": ident, "from": f"{c.file} ({c.via})", "why": f"required query parameter `{n}` is never supplied"}, label)
                for n in c.params:
                    if n not in qp:
                        bucket("param_mismatches", f"{ident}|{c.via}|extra {n}",
                               {"call": ident, "from": f"{c.file} ({c.via})", "why": f"client sends query parameter `{n}` that the server does not declare (ignored)"}, label)
            # --- request body
            rb = (op.get("requestBody") or {}).get("content", {})
            if c.body and not c.body.get("unparsed"):
                form = rb.get("multipart/form-data") or rb.get("application/x-www-form-urlencoded")
                js = rb.get("application/json")
                bsch = form if c.body["form"] else js
                if bsch is None:
                    bucket("param_mismatches", f"{ident}|{c.via}|body",
                           {"call": ident, "from": f"{c.file} ({c.via})", "why": f"client sends a {'form' if c.body['form'] else 'JSON'} body but server expects {sorted(rb) or 'none'}"}, label)
                else:
                    core, _ = schema_core(oa, bsch.get("schema"))
                    props, req = core.get("properties", {}), core.get("required", [])
                    for n in c.body["keys"]:
                        if n not in props:
                            bucket("param_mismatches", f"{ident}|{c.via}|bodyextra {n}",
                                   {"call": ident, "from": f"{c.file} ({c.via})", "why": f"client sends body field `{n}` the server schema does not declare"}, label)
                    for n in req:
                        if n not in c.body["keys"]:
                            bucket("param_mismatches", f"{ident}|{c.via}|bodymissing {n}",
                                   {"call": ident, "from": f"{c.file} ({c.via})", "why": f"server requires body field `{n}` but the client never sends it"}, label)
                        elif n in c.body.get("optional", set()):
                            bucket("param_mismatches", f"{ident}|{c.via}|bodyopt {n}",
                                   {"call": ident, "from": f"{c.file} ({c.via})", "why": f"server requires body field `{n}` but the TS parameter type marks it optional"}, label)
            # --- response fields
            if c.ts_type is None:
                continue
            rs, wrapper = response_schema(oa, op)
            tname = short(c.generic or "", 60)
            if wrapper == "plain" and c.helper == "get":
                ent = results["notes"]["envelope"].setdefault(
                    ident, {"msg": f"client uses get<> (expects provenance) but the OpenAPI response is a plain `{tname}` model, not an Envelope", "files": []})
                if label not in ent["files"]:
                    ent["files"].append(label)
            if rs is None:
                bucket("unverifiable", f"{ident}|{tname}",
                       {"route": f"{c.method} {p}", "ts_type": tname, "reason": "OpenAPI response schema is untyped (`{}`): server returns a free-form dict, nothing to check against"}, label)
                continue
            cm = Cmp(oa, cmp_types)
            cm.compare(c.ts_type, rs, "data")
            for f in cm.findings:
                entry = {"route": f"{c.method} {p}", "ts_type": tname, "path": f["path"], "msg": f["msg"], "kind": f["kind"]}
                group = "field_mismatches" if f["kind"] in ("missing_in_schema", "shape", "type", "enum") else "notes"
                if group == "field_mismatches":
                    bucket(group, f"{p}|{f['path']}|{f['kind']}|{f['msg']}", entry, label)
                else:
                    results["notes"][f["kind"]].setdefault(f"{p}|{f['path']}", {"entry": entry, "files": []})
                    if label not in results["notes"][f["kind"]][f"{p}|{f['path']}"]["files"]:
                        results["notes"][f["kind"]][f"{p}|{f['path']}"]["files"].append(label)
            for u in cm.unverif:
                bucket("unverifiable", f"{p}|{u['path']}|{u['reason']}",
                       {"route": f"{c.method} {p}", "ts_type": tname, "reason": f"{u['path']}: {u['reason']}"}, label)
    return results, all_calls, sections, members, types, called, ui_bad, routes


def section_gaps(labels, all_calls, sections, types, called, routes):
    ref, other = labels[0], labels[1]
    gaps: dict = {"sections_only_in": {}, "routes_only_in": {}, "types_only_in": {}, "type_drift": []}
    for a, b in ((ref, other), (other, ref)):
        gaps["sections_only_in"][a] = [s for s in sections[a] if s not in sections[b]]
        ra = {(c.method, c.path) for c in all_calls[a] if c.via.startswith("api.")}
        rb = {(c.method, c.path) for c in all_calls[b] if c.via.startswith("api.")}
        gaps["routes_only_in"][a] = sorted(f"{m} {p}" for m, p in ra - rb)
        gaps["types_only_in"][a] = sorted(set(types[a]) - set(types[b]))
    for n in sorted(set(types[ref]) & set(types[other])):
        if type_sig(types[ref][n]) != type_sig(types[other][n]):
            gaps["type_drift"].append(n)
    return gaps


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--basic", default=str(ROOT / "frontend-basic" / "src" / "api.ts"))
    ap.add_argument("--main", default=None)
    args = ap.parse_args()

    basic = Path(args.basic)
    if args.main:
        main_ts = Path(args.main)
    else:
        cands = [ROOT / "frontend-main" / "src" / "data" / "api.ts", ROOT / "frontend-main" / "src" / "api.ts", ROOT / "frontend-main" / "src" / "lib" / "api.ts"]
        main_ts = next((c for c in cands if c.exists()), None)
        if main_ts is None:
            for f in (ROOT / "frontend-main" / "src").rglob("*.ts"):
                if "api/watchtower" in f.read_text(encoding="utf-8", errors="ignore"):
                    main_ts = f
                    break
    if main_ts is None or not main_ts.exists() or not basic.exists():
        print(f"cannot find api.ts files (basic={basic}, main={main_ts})")
        return 2

    oa, source = load_openapi(args.base)
    labels = {"basic": basic, "main": main_ts}
    res, all_calls, sections, members, types, called, ui_bad, routes = run_checks(oa, labels)
    gaps = section_gaps(["basic", "main"], all_calls, sections, types, called, routes)

    all_routes = {(m, p) for p, ops in routes.items() for m in ops}
    unused = {
        "neither": sorted(f"{m} {p}" for m, p in all_routes - called["basic"] - called["main"]),
        "only_basic": sorted(f"{m} {p}" for m, p in (all_routes - called["main"]) & called["basic"]),
        "only_main": sorted(f"{m} {p}" for m, p in (all_routes - called["basic"]) & called["main"]),
    }

    def tag(files):
        return "[" + "+".join(files) + "]" if len(files) < 2 else "[both]"

    out: list[str] = []
    P = out.append
    P("=" * 100)
    P("FRONTEND CONTRACT CHECK")
    P(f"OpenAPI source : {source}  ({len(oa['paths'])} paths, {len(routes)} unique route patterns, {sum(len(v) for v in routes.values())} operations)")
    P(f"basic client   : {rel(basic)}  ({sum(1 for c in all_calls['basic'] if c.via.startswith('api.'))} api.ts call sites, "
      f"{sum(1 for c in all_calls['basic'] if not c.via.startswith('api.'))} other-file calls, {len(types['basic'])} types)")
    P(f"main client    : {rel(main_ts)}  ({sum(1 for c in all_calls['main'] if c.via.startswith('api.'))} api.ts call sites, "
      f"{sum(1 for c in all_calls['main'] if not c.via.startswith('api.'))} other-file calls, {len(types['main'])} types)")
    P("=" * 100)

    def block(title, group, fmt):
        d = res[group]
        P(f"\n## {title}  ({len(d)})")
        if not d:
            P("  none")
        for v in d.values():
            P("  " + tag(v["files"]) + " " + fmt(v["entry"]))

    block("MISSING ROUTES (client calls a path the server lacks)", "missing_routes",
          lambda e: f"{e['call']}  <- {e['from']}: {e['why']}")
    block("PARAM MISMATCHES", "param_mismatches", lambda e: f"{e['call']}  <- {e['from']}: {e['why']}")
    block("FIELD MISMATCHES (TS expects what the schema lacks)", "field_mismatches",
          lambda e: f"{e['route']}  TS `{e['ts_type']}` at {e['path']}: {e['msg']}")
    # unverifiable: compress
    d = res["unverifiable"]
    whole = [v for v in d.values() if v["entry"]["reason"].startswith("OpenAPI response schema is untyped")]
    nested = [v for v in d.values() if v not in whole]
    P(f"\n## UNVERIFIABLE (backend schema is an untyped dict; not guessed)  ({len(d)})")
    P(f"  whole response untyped (`{{}}` in OpenAPI), {len(whole)} route/type pairs:")
    for v in whole:
        e = v["entry"]
        P(f"    {tag(v['files'])} {e['route']}  ->  TS `{e['ts_type']}`")
    P(f"  typed route but a nested part is an untyped dict, {len(nested)}:")
    for v in nested:
        e = v["entry"]
        P(f"    {tag(v['files'])} {e['route']}  {e['reason']}")
    P(f"\n## UNUSED SERVER ROUTES (no client call from api.ts or the other src files)")
    P(f"  called by neither frontend ({len(unused['neither'])}):")
    for r in unused["neither"]:
        P(f"    {r}")
    P(f"  called only by frontend-basic ({len(unused['only_basic'])}): " + (", ".join(unused["only_basic"]) or "none"))
    P(f"  called only by frontend-main  ({len(unused['only_main'])}): " + (", ".join(unused["only_main"]) or "none"))
    P("\n## SECTION GAPS (frontend-basic is the reference)")
    P(f"  api sections only in basic : {gaps['sections_only_in']['basic'] or 'none'}")
    P(f"  api sections only in main  : {gaps['sections_only_in']['main'] or 'none'}")
    P(f"  routes called only by basic api.ts ({len(gaps['routes_only_in']['basic'])}): {', '.join(gaps['routes_only_in']['basic']) or 'none'}")
    P(f"  routes called only by main  api.ts ({len(gaps['routes_only_in']['main'])}): {', '.join(gaps['routes_only_in']['main']) or 'none'}")
    P(f"  exported types only in basic: {gaps['types_only_in']['basic'] or 'none'}")
    P(f"  exported types only in main : {gaps['types_only_in']['main'] or 'none'}")
    P(f"  same-named types that differ between the two files: {gaps['type_drift'] or 'none'}")
    P("\n## INFORMATIONAL (do not affect exit code)")
    n = res["notes"]
    P(f"  schema-required fields the TS type lacks ({len(n['required_not_in_ts'])}):")
    for v in n["required_not_in_ts"].values():
        e = v["entry"]
        P(f"    {tag(v['files'])} {e['route']} `{e['ts_type']}` {e['path']}")
    P(f"  nullable drift: OpenAPI allows null, TS type does not ({len(n['nullable'])}):")
    for v in n["nullable"].values():
        e = v["entry"]
        P(f"    {tag(v['files'])} {e['route']} `{e['ts_type']}` {e['path']}")
    P(f"  client get<> on a non-Envelope typed response ({len(n['envelope'])}):")
    for k, v in n["envelope"].items():
        P(f"    {tag(v['files'])} {k}: {v['msg']}")
    P(f"  call sites whose query params were not parseable (required-param check skipped) ({len(n['unparsed_params'])}):")
    for k in n["unparsed_params"]:
        P(f"    {k}")
    for label in ("basic", "main"):
        P(f"  UI files in {label} using an `api.*` function that the client does not define ({len(ui_bad[label])}): " + ("; ".join(f"{b['file']}: {b['ref']}" for b in ui_bad[label]) or "none"))

    report = "\n".join(out)
    print(report)

    failing = bool(res["missing_routes"] or res["param_mismatches"] or res["field_mismatches"])
    payload = {
        "openapi_source": source,
        "files": {k: rel(v) for k, v in labels.items()},
        "missing_routes": list(res["missing_routes"].values()),
        "param_mismatches": list(res["param_mismatches"].values()),
        "field_mismatches": list(res["field_mismatches"].values()),
        "unverifiable": list(res["unverifiable"].values()),
        "unused_server_routes": unused,
        "section_gaps": gaps,
        "notes": {k: (list(v.values()) if k != "unparsed_params" else list(v)) for k, v in res["notes"].items()},
        "ui_unknown_client_fns": ui_bad,
        "calls": {k: [c.to_json() for c in v] for k, v in all_calls.items()},
        "exit_code": 1 if failing else 0,
    }
    RESULT_JSON.write_text(json.dumps(payload, indent=2, default=list), encoding="utf-8")
    print(f"\nwrote {RESULT_JSON.relative_to(BACKEND)}  | exit {1 if failing else 0}")
    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main())
