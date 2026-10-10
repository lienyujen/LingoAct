"""Export the noncommercial CEEC-based LingoAct vocabulary, not the research corpus.

Official bands remain attached to original entries. Editorial teaching metadata
and publisher evidence are separate, so a topic or sample never invents a level.
"""
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/english"

def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))

def write(name, value):
    (DATA / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def key(text):
    return re.sub(r"\s+", " ", text.strip()).casefold()

def build():
    catalog = load("catalog.json")
    assert catalog["source_usage"]["ceec-vocabulary-111"]["bundle_by_default"]
    editorial = load("vocabulary-editorial.json")
    publishers = load("publisher-references.json")
    official = {s["id"]: s for s in load("sources.json")}
    sources = [official[k] for k in ("ceec-vocabulary-111", "naer-general-2018")]
    sources += publishers["sources"]
    # Pin the actual sample used for occurrence evidence. Fail rather than
    # publishing unchecked terms after a source change or missing download.
    sample = ROOT / ".codex-tmp/english-sources/hanlin-news-2023-01.pdf"
    expected_sample_hash = "1fb062342117dcf1483247e3d5819803aee9760e8c089074fd41e2ea1cc1aac7"
    if not sample.exists():
        source = next(s for s in publishers["sources"] if s["id"] == "hanlin-news-2023-01")
        request = Request(quote(source["url"], safe=":/?=&%"), headers={"User-Agent":"LingoAct vocabulary source verification"})
        with urlopen(request, timeout=45) as response:
            content = response.read()
        assert content.startswith(b"%PDF-")
        assert hashlib.sha256(content).hexdigest() == expected_sample_hash, "Publisher sample changed; review before importing"
        sample.parent.mkdir(parents=True, exist_ok=True)
        sample.write_bytes(content)
    assert hashlib.sha256(sample.read_bytes()).hexdigest() == expected_sample_hash
    from pypdf import PdfReader
    text = PdfReader(sample).pages[1].extract_text()
    section = text.split("Vocabulary & Phrases", 1)[1].split("RCQ Answers", 1)[0]
    for source in publishers["sources"]:
        if source.get("word_list_imported"):
            for term in source["terms"]:
                assert term in section, f"Sample term not present: {term}"
            source["sha256"] = hashlib.sha256(sample.read_bytes()).hexdigest()
    db = sqlite3.connect(f"file:{DATA / 'english-standards.sqlite'}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    records = {}

    def record(form):
        identity = key(form)
        return records.setdefault(identity, {"id": "en-" + hashlib.sha256(identity.encode()).hexdigest()[:16],
            "lemma": form, "ceec_bands": [], "school_lists": [], "parts_of_speech": [],
            "provenance": [], "topics": [], "word_family": [], "collocations": [], "sense_caution": None})

    raw_counts = Counter()
    for row in db.execute("SELECT * FROM vocabulary ORDER BY id"):
        raw_counts[row["list_id"]] += 1
        # Slash groups are explicit alternatives in the source. Parenthesised
        # variants/inflections stay attached as evidence, not invented lemmas.
        for form in row["lemma"].split("/"):
            item = record(form.strip())
            if row["list_id"].startswith("ceec-"):
                item["ceec_bands"].append(int(row["list_id"].split("-")[1]))
            else:
                item["school_lists"].append(row["list_id"])
            if row["pos"]:
                item["parts_of_speech"].append(row["pos"])
            item["provenance"].append({"source":row["source"], "page":row["page"],
                "list":row["list_id"], "source_lemma":row["lemma"], "entry":row["entry"], "aliases":json.loads(row["aliases"]), "kind":"official_word_list"})
    db.close()
    for source in publishers["sources"]:
        for term in source.get("terms", []):
            record(term)["provenance"].append({"source":source["id"], "page":source["page"], "kind":"public_sample_occurrence"})
    for topic, terms in editorial["topics"].items():
        for term in terms.split():
            if key(term) in records:
                records[key(term)]["topics"].append(topic)
    for family in editorial["word_families"]:
        for term in family:
            if key(term) in records:
                records[key(term)]["word_family"] = family
    for field, source_field in [("collocations","collocations"),("sense_caution","sense_cautions")]:
        for term, value in editorial[source_field].items():
            if key(term) in records:
                records[key(term)][field] = value
    for item in records.values():
        for field in ["ceec_bands", "school_lists", "parts_of_speech", "topics"]:
            item[field] = sorted(set(item[field]))
    entries = sorted(records.values(), key=lambda row: key(row["lemma"]))
    metadata = {"schema_version":1, "name":"LingoAct English Teaching Vocabulary", "version":"2026-10-08",
        "use":"noncommercial_with_attribution", "level_authority":"CEEC six bands; no CEFR/GEPT/Lexile conversion",
        "definitions_and_examples":"Publisher definitions, example sentences, textbook passages and audio are not included. Collocations and sense notes are LingoAct editorial content.",
        "publisher_coverage":publishers["coverage_policy"], "sources":sources}
    write("lingoact-vocabulary.json", {**metadata, "entries":entries})
    with (DATA / "lingoact-vocabulary.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["lemma","ceec_bands","school_lists","parts_of_speech","topics","word_family","collocations","sense_caution","provenance"])
        for item in entries:
            writer.writerow([item["lemma"], *[json.dumps(item[field], ensure_ascii=False) for field in
                ["ceec_bands","school_lists","parts_of_speech","topics","word_family","collocations"]], item["sense_caution"], json.dumps(item["provenance"],ensure_ascii=False)])
    output = DATA / "lingoact-vocabulary.sqlite"
    temp = output.with_suffix(".building.sqlite")
    sql = sqlite3.connect(temp)
    sql.executescript("DROP TABLE IF EXISTS occurrences; DROP TABLE IF EXISTS lexemes; DROP TABLE IF EXISTS sources; CREATE TABLE sources(id TEXT PRIMARY KEY, metadata TEXT NOT NULL); CREATE TABLE lexemes(id TEXT PRIMARY KEY, lemma TEXT NOT NULL UNIQUE, metadata TEXT NOT NULL); CREATE TABLE occurrences(lexeme_id TEXT REFERENCES lexemes(id), source TEXT REFERENCES sources(id), metadata TEXT NOT NULL); CREATE INDEX occurrence_word ON occurrences(lexeme_id); PRAGMA foreign_keys=ON;")
    for source in sources:
        sql.execute("INSERT INTO sources VALUES (?,?)", (source["id"],json.dumps(source,ensure_ascii=False)))
    for item in entries:
        sql.execute("INSERT INTO lexemes VALUES (?,?,?)", (item["id"],item["lemma"],json.dumps(item,ensure_ascii=False)))
        for evidence in item["provenance"]:
            sql.execute("INSERT INTO occurrences VALUES (?,?,?)",(item["id"],evidence["source"],json.dumps(evidence,ensure_ascii=False)))
    assert sql.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert not sql.execute("PRAGMA foreign_key_check").fetchall()
    sql.commit()
    sql.close()
    temp.replace(output)
    report = {"unique_written_forms":len(entries), "official_original_rows":dict(raw_counts),
        "ceec_written_forms":sum(bool(i["ceec_bands"]) for i in entries),
        "topic_tagged_forms":sum(bool(i["topics"]) for i in entries),
        "collocation_enriched_forms":sum(bool(i["collocations"]) for i in entries),
        "family_enriched_forms":sum(bool(i["word_family"]) for i in entries),
        "publisher_sample_terms":sum(len(s.get("terms",[])) for s in sources),
        "unlevelled_sample_terms":[i["lemma"] for i in entries if not i["ceec_bands"] and not i["school_lists"]],
        "runtime_status":"bounded lexical anchors in English generation; school reading lookup; no official CEFR/GEPT vocabulary conversion",
        "limitations":["Publisher materials are public design references and one attributed sample, not full textbook word lists.","Editorial metadata covers a reviewed starter subset; remaining entries have empty fields.","No publisher frequency ranking, CEFR mapping, Lexile measure or unverified pronunciation is assigned."]}
    write("vocabulary-report.json", report)
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__ == "__main__":
    build()
