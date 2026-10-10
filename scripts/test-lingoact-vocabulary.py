"""Check level preservation, publisher evidence and release boundaries."""
import json
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/english"
payload = json.loads((DATA / "lingoact-vocabulary.json").read_text(encoding="utf-8"))
entries = payload["entries"]
by_word = {row["lemma"].casefold(): row for row in entries}
assert len(by_word) == len(entries)
assert all(row['lemma'].strip() and not row['lemma'].endswith(' adj.') for row in entries)
assert by_word['neither']['ceec_bands'] == [2]
assert len({row["id"] for row in entries}) == len(entries)
for word, band in [("ability",1),("absence",2),("abandon",4),("zoom",6)]:
    assert by_word[word]["ceec_bands"] == [band]
assert "basic1200" in by_word["apple"]["school_lists"]
for merged in ['wrong yard','wrist yell','yummy zebra']:
    assert merged not in by_word
for word, school_list in [('wrong','basic1200'),('yard','basic1200'),('yummy','basic1200'),('zebra','basic1200'),('wrist','additional800'),('yell','additional800')]:
    assert school_list in by_word[word]['school_lists']
assert by_word["a"]["ceec_bands"] == by_word["an"]["ceec_bands"] == [1]
assert all("cefr" not in row and "lexile" not in row for row in entries)
for row in entries:
    assert row["provenance"]
    for evidence in row["provenance"]:
        assert evidence["source"] in {s["id"] for s in payload["sources"]}
        if evidence["kind"] == "official_word_list":
            assert evidence["entry"] and evidence["page"] > 0
assert by_word["impact"]["collocations"] == ["have an impact on"]
assert by_word["cap"]["sense_caution"]
assert "protect" in by_word["protection"]["word_family"]
assert sum(p["kind"] == "public_sample_occurrence" for row in entries for p in row["provenance"]) == 21
for name in ["english-standards.sqlite", "lingoact-vocabulary.sqlite"]:
    db = sqlite3.connect(f"file:{DATA / name}?mode=ro", uri=True)
    assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert not db.execute("PRAGMA foreign_key_check").fetchall()
    if name == "english-standards.sqlite":
        # Every original row survives, even when multiple sources share a lemma.
        expected = db.execute("SELECT count(*) FROM vocabulary").fetchone()[0]
        observed = {(p["source"],p["list"],p["source_lemma"],p["entry"],p["page"]) for row in entries for p in row["provenance"] if p["kind"] == "official_word_list"}
        assert len(observed) == expected, (len(observed), expected)
        for source, list_id, lemma, entry, page in db.execute("SELECT source,list_id,lemma,entry,page FROM vocabulary"):
            assert (source,list_id,lemma,entry,page) in observed
    else:
        assert db.execute("SELECT count(*) FROM lexemes").fetchone()[0] == len(entries)
    db.close()
assert (ROOT / "supabase/licenses/english-vocabulary-NOTICE.txt").exists()
print(f"Vocabulary checks passed: {len(entries)} forms; original official rows preserved; source links, sample evidence and editorial fields checked.")
