"""Build a local, source-backed SQLite research database, never a runtime seed.

Restricted source text stays outside release assets. The checked-in catalog
contains facts and editorial summaries; the DB retains private source evidence.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from html.parser import HTMLParser

import pdfplumber
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".codex-tmp/english-sources"
OUTPUT = ROOT / "data/english"

def split_entries(text):
    # Parentheses contain aliases and inflections with commas of their own.
    entries, current, depth = [], [], 0
    for char in text:
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        if char == "," and depth == 0:
            entries.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    if depth:
        raise ValueError("Unbalanced vocabulary parentheses")
    entries.append("".join(current).strip())
    return [entry for entry in entries if entry]

def school_vocabulary():
    with pdfplumber.open(CACHE / "naer-general-2018.pdf") as pdf:
        # Alphabetical tables are authoritative. The later thematic table
        # repeats them, and must not inflate the size of the vocabulary set.
        pages = [(i + 1, pdf.pages[i].extract_text() or "") for i in range(55, 61)]
    records, band, current_letter = [], "basic1200", None
    chunks = []
    def flush():
        if not chunks:
            return
        joined = " ".join(text for _, text in chunks)
        offsets, offset = [], 0
        for page, text in chunks:
            offsets.append((offset, page))
            offset += len(text) + 1
        cursor = 0
        for raw in split_entries(joined):
            start = joined.find(raw, cursor)
            cursor = start + len(raw)
            page = next(page for position, page in reversed(offsets) if position <= start)
            head = re.sub(r"\([^)]*\)", "", raw).strip()
            for lemma in head.split("/"):
                records.append({"list_id": band, "lemma": lemma.strip(), "entry": raw,
                                "aliases": re.findall(r"\(([^)]*)\)", raw),
                                "source": "naer-general-2018", "page": page})
        chunks.clear()
    for page, text in pages:
        for line in text.splitlines():
            line = line.strip()
            if re.match(r"^1\.\s+People", line):
                flush()
                return records  # The thematic table repeats the alphabetical lists.
            letter = re.match(r"^([A-Z])-\s*(.*)$", line)
            if letter:
                flush()  # Letter boundaries separate entries even without a comma.
                if letter[1] == 'A' and current_letter is not None:
                    band = 'additional800'
                current_letter = letter[1]
                line = letter[2]
            if current_letter and re.fullmatch(r"[A-Za-z0-9\s,().'’/;&\-]+", line) and re.search(r'[A-Za-z]', line):
                chunks.append((page, line))
    flush()
    return records

def ceec_vocabulary():
    pdf = PdfReader(CACHE / "ceec-vocabulary-111.pdf")
    band, pending, records = None, "", []
    missed = []
    for page_number, page in enumerate(pdf.pages[12:63], 13):
        for line in (page.extract_text() or "").splitlines():
            line = re.sub(r"\s+", " ", line).strip()
            level = re.fullmatch(r"第([一二三四五六])級", line)
            if level:
                if pending:
                    raise ValueError(f"Incomplete CEEC entry at band boundary: {pending}")
                band = "一二三四五六".index(level[1]) + 1
                continue
            if not line or re.match(r"^(依級別排序|高中英文參考詞彙表|\d+$)", line):
                continue
            if band is None:
                continue
            pending = (pending + " " + line).strip()
            match = re.fullmatch(r"(.+?)\s+(\(?(?:n|v|adj|adv|pron|prep|conj|aux|art|interj)\.?\)?(?:/\s*\(?(?:n|v|adj|adv|pron|prep|conj|aux|art|interj)\.?\)?)*)", pending)
            if match:
                raw, pos = match.groups()
                records.append({"list_id": f"ceec-{band}", "lemma": raw, "entry": raw,
                                "pos": pos, "source": "ceec-vocabulary-111", "page": page_number})
                pending = ""
            elif len(pending) > 220:
                missed.append({"page": page_number, "text": pending})
                pending = ""
    if pending or missed:
        raise ValueError(f"CEEC rows need review: pending={pending!r}, missed={missed[:4]}")
    # The same PDF repeats the complete list alphabetically with level numbers.
    # Compare both representations rather than trusting a plausible row count.
    alphabetical, pending = [], ""
    for page in pdf.pages[64:115]:
        for line in (page.extract_text() or "").splitlines():
            line = re.sub(r"\s+", " ", line).strip()
            if not line or re.match(r"^(依字母排序|高中英文參考詞彙表|[A-Z]$)", line) or (not pending and re.fullmatch(r"\d+", line)):
                continue
            pending = (pending + " " + line).strip()
            match = re.fullmatch(r"(.+?)\s+(\(?(?:n|v|adj|adv|pron|prep|conj|aux|art|interj)\.?\)?(?:/\s*\(?(?:n|v|adj|adv|pron|prep|conj|aux|art|interj)\.?\)?)*)\s+([1-6])", pending)
            if match:
                alphabetical.append((match[1], match[2], int(match[3])))
                pending = ""
    ordered = [(w["entry"], w["pos"], int(w["list_id"][-1])) for w in records]
    if pending or Counter(ordered) != Counter(alphabetical):
        raise ValueError(f"CEEC cross-check failed: {len(ordered)} by level, {len(alphabetical)} alphabetical; pending {pending!r}; level-only {list((Counter(ordered)-Counter(alphabetical)).items())[:15]}; alpha-only {list((Counter(alphabetical)-Counter(ordered)).items())[:15]}")
    return records

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables, self.rows, self.row, self.cell = [], None, None, None
    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.rows = []
        elif tag == "tr" and self.rows is not None:
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []
        elif tag == "br" and self.cell is not None:
            self.cell.append(" ")
    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None:
            self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip())
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if any(self.row):
                self.rows.append(self.row)
            self.row = None
        elif tag == "table" and self.rows is not None:
            self.tables.append(self.rows)
            self.rows = None
    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

def curriculum_competencies():
    records = []
    for source, span in [("naer-general-2018", range(9,22)), ("naer-vocational", range(7,15))]:
        with pdfplumber.open(CACHE / (source + ".pdf")) as pdf:
            for index in span:
                for table in pdf.pages[index].extract_tables():
                    for row in table:
                        for cell in row:
                            if not cell:
                                continue
                            # Codes occasionally wrap; retain the descriptive
                            # text and the optional ◎ marker independently.
                            pattern = r"([◎＊*]?)([1-9A-Za-z]{1,2})\s*-\s*([ⅡⅢⅣⅤV]+)\s*-\s*(\d+)"
                            matches = list(re.finditer(pattern, cell))
                            for n, match in enumerate(matches):
                                end = matches[n+1].start() if n+1 < len(matches) else len(cell)
                                text = re.sub(r"\s+", "", cell[match.end():end])
                                code = f"{match[2]}-{match[3]}-{match[4]}"
                                if text:
                                    records.append({"source":source,"page":index+1,"code":code,"optional":bool(match[1]),"text":text})
    # Each code in these two sections is unique in its curriculum.
    keys = [(r["source"],r["code"]) for r in records]
    if len(keys) != len(set(keys)):
        raise ValueError(f"Repeated competency codes require review: {[k for k,v in Counter(keys).items() if v>1][:10]}")
    return records

def grammar_reference():
    headings = {"名詞", "代名詞", "冠詞", "指示詞", "數量詞", "形容詞", "副詞", "不定詞", "動名詞", "分詞", "連接詞", "介系詞與介系詞片語", "句子的種類", "間接問句", "祈使句", "感嘆句", "引介句", "被動句", "助動詞", "感官動詞", "使役動詞", "時態", "子句", "其他："}
    records, category = [], ""
    with pdfplumber.open(CACHE / "naer-general-2018.pdf") as pdf:
        for index in range(69, 73):
            for line in (pdf.pages[index].extract_text() or "").splitlines():
                line = re.sub(r"\s+", " ", line).strip()
                if line.startswith("附錄六") or re.fullmatch(r"\d+", line):
                    continue
                if line in headings or re.match(r"^(連綴動詞|其他：)", line):
                    category = line
                    if line.startswith("連綴動詞"):
                        records.append({"category": "連綴動詞", "point": line, "page": index + 1})
                elif line:
                    records.append({"category": category, "point": line, "page": index + 1})
    return records

def build(output):
    catalog = json.loads((OUTPUT / "catalog.json").read_text(encoding="utf-8"))
    sources = json.loads((OUTPUT / "source-lock.json").read_text(encoding="utf-8"))
    words = school_vocabulary() + ceec_vocabulary()
    grammar = grammar_reference()
    competencies = curriculum_competencies()
    # Build a fresh file and replace only after all extraction/integrity checks.
    temporary = output.with_suffix(".building.sqlite")
    temporary.parent.mkdir(parents=True, exist_ok=True)
    if temporary.exists():
        temporary.unlink()
    db = sqlite3.connect(temporary)
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
      CREATE TABLE sources(id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, version TEXT NOT NULL, sha256 TEXT, metadata TEXT NOT NULL);
      CREATE TABLE frameworks(id TEXT PRIMARY KEY, label TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE levels(framework TEXT REFERENCES frameworks(id), code TEXT, label TEXT, data TEXT NOT NULL, PRIMARY KEY(framework,code));
      CREATE TABLE descriptors(framework TEXT, level TEXT, skill TEXT, summary TEXT NOT NULL, source TEXT REFERENCES sources(id), provenance TEXT NOT NULL, FOREIGN KEY(framework,level) REFERENCES levels(framework,code));
      CREATE TABLE vocabulary(id INTEGER PRIMARY KEY, list_id TEXT NOT NULL, lemma TEXT NOT NULL, entry TEXT NOT NULL, pos TEXT, aliases TEXT, source TEXT REFERENCES sources(id), page INTEGER NOT NULL);
      CREATE INDEX vocabulary_lookup ON vocabulary(lemma COLLATE NOCASE,list_id);
      CREATE TABLE grammar(id INTEGER PRIMARY KEY, category TEXT, point TEXT NOT NULL, source TEXT REFERENCES sources(id), page INTEGER NOT NULL);
      CREATE TABLE score_thresholds(exam TEXT, skill TEXT, cefr TEXT, minimum INTEGER, maximum INTEGER, caveat TEXT, source TEXT REFERENCES sources(id), PRIMARY KEY(exam,skill,cefr));
      CREATE TABLE exam_parts(exam TEXT, part TEXT, skill TEXT, task TEXT, items INTEGER, data TEXT NOT NULL, source TEXT REFERENCES sources(id), PRIMARY KEY(exam,part));
      CREATE TABLE settings(key TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE competencies(source TEXT REFERENCES sources(id), code TEXT, page INTEGER NOT NULL, optional INTEGER NOT NULL, description TEXT NOT NULL, PRIMARY KEY(source,code));
      CREATE TABLE official_tables(source TEXT REFERENCES sources(id), table_number INTEGER, rows TEXT NOT NULL, PRIMARY KEY(source,table_number));
      CREATE TABLE source_pages(source TEXT REFERENCES sources(id), page INTEGER, text TEXT NOT NULL, PRIMARY KEY(source,page));
      CREATE VIRTUAL TABLE evidence_search USING fts5(source UNINDEXED,page UNINDEXED,text);
    """)
    encoded = lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    for source in sources:
        db.execute("INSERT INTO sources VALUES(?,?,?,?,?,?)", (source["id"], source["title"], source["url"], source["version"], source["sha256"], encoded(source)))
        cached = CACHE / (source["id"] + "." + source["format"])
        if source["sha256"] and hashlib.sha256(cached.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError(f"Source changed: {source['id']}")
        if source["format"] == "pdf" and cached.exists():
            # Raw source evidence stays in this unbundled local DB.
            pages = [p.extract_text() or "" for p in PdfReader(cached).pages]
        elif source["format"] == "html":
            pages = [(CACHE / (source["id"] + ".txt")).read_text(encoding="utf-8")]
            parser = TableParser()
            parser.feed(cached.read_text(encoding="utf-8"))
            for number, rows in enumerate(parser.tables, 1):
                db.execute("INSERT INTO official_tables VALUES(?,?,?)", (source["id"], number, encoded(rows)))
        else:
            pages = []
        for page, text in enumerate(pages, 1):
            db.execute("INSERT INTO source_pages VALUES(?,?,?)", (source["id"], page, text))
            db.execute("INSERT INTO evidence_search VALUES(?,?,?)", (source["id"], page, text))
    for framework in catalog["frameworks"]:
        db.execute("INSERT INTO frameworks VALUES(?,?,?,?)", (framework["id"], framework["label"], framework["type"], encoded(framework)))
    for framework, rows in [("school", catalog["school_stages"]), ("cefr", catalog["cefr_levels"]), ("gept", catalog["gept_levels"]), ("toeic", catalog["toeic_certificate_bands"])]:
        for row in rows:
            db.execute("INSERT INTO levels VALUES(?,?,?,?)", (framework, row["code"], row.get("label", row["code"]), encoded(row)))
            for skill, text in row.get("skills", {}).items():
                source = "cefr-2020" if framework == "cefr" else row["source"]
                db.execute("INSERT INTO descriptors VALUES(?,?,?,?,?,?)", (framework, row["code"], skill, text, source, "editorial_summary"))
    for word in words:
        db.execute("INSERT INTO vocabulary(list_id,lemma,entry,pos,aliases,source,page) VALUES(?,?,?,?,?,?,?)", (word["list_id"], word["lemma"], word["entry"], word.get("pos"), encoded(word.get("aliases", [])), word["source"], word["page"]))
    for point in grammar:
        db.execute("INSERT INTO grammar(category,point,source,page) VALUES(?,?,?,?)", (point["category"], point["point"], "naer-general-2018", point["page"]))
    for row in competencies:
        db.execute("INSERT INTO competencies VALUES(?,?,?,?,?)", (row["source"], row["code"], row["page"], row["optional"], row["text"]))
    thresholds = catalog["toeic_cefr_thresholds"]
    for skill in ["listening", "reading", "speaking", "writing"]:
        for index, level in enumerate(thresholds["levels"]):
            caveat = "C1 reading reference: only 45% of experts agreed" if skill == "reading" and level == "C1" else None
            db.execute("INSERT INTO score_thresholds VALUES(?,?,?,?,?,?,?)", ("toeic", skill, level, thresholds[skill][index], 495 if skill in ["listening", "reading"] else 200, caveat, thresholds["source"]))
    for exam in catalog["toeic_exams"]:
        for part in exam["parts"]:
            db.execute("INSERT INTO exam_parts VALUES(?,?,?,?,?,?,?)", (exam["id"], str(part["part"]), part["skill"], part["task"], part["items"], encoded(part), exam["source"]))
    for key in ["decisions", "source_usage", "cefr_reference", "toeic_exams", "toeic_cefr_thresholds"]:
        db.execute("INSERT INTO settings VALUES(?,?)", (key, encoded(catalog[key])))
    assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    db.commit()
    counts = {name: db.execute(f"SELECT count(*) FROM {name}").fetchone()[0] for name in ["sources", "frameworks", "levels", "descriptors", "vocabulary", "grammar", "score_thresholds", "exam_parts", "source_pages", "competencies", "official_tables"]}
    report = {"schema_version": 1, "reviewed_on": catalog["reviewed_on"], "counts": counts, "vocabulary_by_list": dict(Counter(w["list_id"] for w in words)), "competencies_by_source": dict(Counter(c["source"] for c in competencies)), "ceec_crosscheck": "level-sorted and alphabetically-sorted tables match entry, POS and level", "database": str(output.relative_to(ROOT)).replace("\\", "/"), "deployment_status": "local_research_only", "limitations": ["CEFR PDF CLI download blocked: official web PDF reviewed; original corpus absent; summaries and citations present.", "CEEC full vocabulary requires written permission for commercial use; DB is excluded from source control and release assets.", "No fixed official GEPT/TOEIC/CEFR vocabulary or grammar lists invented.", "GEPT exam specifications/rubrics are retained as official HTML table rows with source links; spans are not yet normalized into runtime exam entities."]}
    db.close()
    temporary.replace(output)
    (OUTPUT / "import-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUTPUT / "english-standards.sqlite")
    build(parser.parse_args().output.resolve())
