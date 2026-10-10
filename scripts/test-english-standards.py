"""Validate the imported evidence and prevent false cross-framework mappings."""
import json
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / "data/english/catalog.json").read_text(encoding="utf-8"))
db = sqlite3.connect(ROOT / "data/english/english-standards.sqlite")
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
assert not db.execute("PRAGMA foreign_key_check").fetchall()
assert catalog["decisions"]["school_label"] == "各級學校"
assert [f["id"] for f in catalog["frameworks"]] == ["school", "cefr", "gept", "toeic"]
assert all(stage["cefr"] is None for stage in catalog["school_stages"])
assert len(catalog["cefr_levels"]) == 7
assert all(not f["official_fixed_vocabulary"] for f in catalog["frameworks"] if f["id"] in ("cefr", "toeic"))
assert next(f for f in catalog["frameworks"] if f["id"] == "gept")["official_fixed_vocabulary"]
assert db.execute("SELECT minimum FROM score_thresholds WHERE skill='listening' AND cefr='B2'").fetchone()[0] == 400
assert db.execute("SELECT minimum FROM score_thresholds WHERE skill='reading' AND cefr='B2'").fetchone()[0] == 385
assert db.execute("SELECT caveat FROM score_thresholds WHERE skill='reading' AND cefr='C1'").fetchone()[0]
assert db.execute("SELECT count(*) FROM score_thresholds WHERE cefr='C2'").fetchone()[0] == 0
for exam, counts in [("toeic-lr", {"listening":100, "reading":100}), ("toeic-sw", {"speaking":11, "writing":8})]:
    for skill, total in counts.items():
        assert db.execute("SELECT sum(items) FROM exam_parts WHERE exam=? AND skill=?", (exam, skill)).fetchone()[0] == total
assert db.execute("SELECT count(*) FROM competencies WHERE code='1-Ⅱ-1' AND description LIKE '%26%'").fetchone()[0] == 1
for lemma, band in [("ability","ceec-1"), ("absence","ceec-2"), ("abandon","ceec-4"), ("zoom","ceec-6")]:
    assert db.execute("SELECT count(*) FROM vocabulary WHERE lemma=? AND list_id=?", (lemma, band)).fetchone()[0] == 1
assert db.execute("SELECT count(*) FROM vocabulary WHERE lemma='apple' AND list_id='basic1200'").fetchone()[0] == 1
assert db.execute("SELECT count(*) FROM grammar WHERE point LIKE '%現在完成式%'").fetchone()[0] >= 1
assert db.execute("SELECT count(*) FROM official_tables WHERE source='gept-elementary'").fetchone()[0] >= 3
assert db.execute("SELECT count(*) FROM evidence_search WHERE evidence_search MATCH 'listening'").fetchone()[0] >= 1
duplicate = db.execute("SELECT list_id,lemma,count(*) FROM vocabulary WHERE list_id LIKE 'ceec-%' GROUP BY list_id,lemma HAVING count(*)>1").fetchall()
print("CEEC repeated written forms:", duplicate)
print("Unexpected long school entries:", db.execute("SELECT lemma,page FROM vocabulary WHERE source='naer-general-2018' AND length(lemma)>35").fetchall())
print("English standards checks passed: sources, imported vocabulary, grammar, curricula, exam counts and skill-specific thresholds.")
