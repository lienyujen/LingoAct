"""Extract the official 2025 HSK syllabus; fail on missing vocabulary rows.

Run with the PDF linked from chinesetest.cn and an output directory. Only
upright text is used for grammar cells, excluding the diagonal watermark.
"""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

parser = argparse.ArgumentParser()
parser.add_argument("pdf", type=Path)
parser.add_argument("--output", type=Path, default=Path("supabase/functions/_shared/hsk-syllabus.generated.ts"))
args = parser.parse_args()
reader = PdfReader(args.pdf)
words = []
for page in reader.pages[79:354]:
    text = page.extract_text() or ""
    for line in text.splitlines():
        match = re.match(r"^(\d+)\s+([1-6]|7-9)((?:[（(][^）)]*[）)])*)\s+(\S+)\s+(.+)$", line.strip())
        if not match:
            continue
        identifier, band, secondary, lemma, pronunciation = match.groups()
        # Sense numbers distinguish homographs in the PDF, not written words.
        word = re.sub(r"\d+$", "", lemma)
        part = re.search(r"[\u3400-\u9fff]", pronunciation)
        pinyin = pronunciation[:part.start()].strip() if part else pronunciation.strip()
        pos = pronunciation[part.start():].strip() if part else ""
        words.append({"id": int(identifier), "word": word, "level": int(band[0]), "pinyin": pinyin,
                      "pos": pos, "additionalLevels": [int(n) for n in re.findall(r"[1-9]", secondary or "")]})

ids = [entry["id"] for entry in words]
if ids != list(range(1, 11001)):
    missing = sorted(set(range(1, 11001)) - set(ids))
    raise ValueError(f"Vocabulary extraction requires review: {len(words)} rows, missing IDs {missing[:50]}")

characters = {}
current_level = None
for page in reader.pages[355:376]:
    text = page.extract_text() or ""
    heading = re.search(r"HSK（([一二三四五六七—九]+)级）认读字", text)
    if heading:
        current_level = "一二三四五六七".index(heading[1][0]) + 1
    if current_level is None:
        continue
    for character in re.findall(r"^\d+\.\s*([\u3400-\u9fff])\s*$", text, re.MULTILINE):
        characters[character] = min(characters.get(character, current_level), current_level)

grammar = []
level = 0
categories = ["", "", ""]
with pdfplumber.open(args.pdf) as doc:
    for number in range(385, 406):
        page = doc.pages[number]
        clean_page = page.filter(lambda obj: obj.get("object_type") != "char" or abs(obj.get("matrix", (0, 0))[1]) < 0.001)
        heading = re.search(r"HSK（([一二三四五六七—九]+)级）语法", clean_page.extract_text() or "")
        if heading:
            level = "一二三四五六七".index(heading[1][0]) + 1
            categories = ["", "", ""]
        if not level:
            raise ValueError(f"No grammar level on PDF page {number + 1}")
        tables = clean_page.extract_tables()
        if not tables:
            raise ValueError(f"No grammar table on PDF page {number + 1}")
        for table in tables:
            for row in table:
                if len(row) != 4 or row[0] == "类别":
                    continue
                for index in range(3):
                    if row[index] is not None:
                        categories[index] = re.sub(r"\s+", "", row[index])
                        for child in range(index + 1, 3):
                            categories[child] = ""
                content = re.sub(r"\s+", "", row[3] or "")
                if not content:
                    continue
                label = "／".join(value for value in categories[1:] if value) or categories[0]
                point = f"{label}：{content}"
                if any(entry["level"] == level and entry["point"] == point for entry in grammar):
                    continue
                grammar.append({"level": level, "point": point, "category": categories.copy(), "pattern": content, "page": number + 1})

if any(not any(entry["level"] == n for entry in grammar) for n in range(1, 8)):
    raise ValueError("A grammar level is missing")
result = {"source": {"publisher": "中外语言交流合作中心", "title": "HSK 考试大纲", "published": "2025-11",
                     "url": "https://hsk.cn-bj.ufileos.com/3.0/%E6%96%B0%E7%89%88HSK%E8%80%83%E8%AF%95%E5%A4%A7%E7%BA%B21219.pdf",
                     "sha256": hashlib.sha256(args.pdf.read_bytes()).hexdigest(), "pages": len(reader.pages),
                     "advancedBand": "7-9"}, "vocabulary": words, "characters": characters, "grammar": grammar}
args.output.parent.mkdir(parents=True, exist_ok=True)
payload = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
args.output.write_text("// Generated from the official HSK syllabus by scripts/import-hsk-syllabus.py.\nexport const HSK_SYLLABUS = " + payload + "\n", encoding="utf-8")
print(json.dumps({"words": len(words), "wordLevels": dict(Counter(entry["level"] for entry in words)),
                  "characters": len(characters), "grammar": len(grammar), "grammarLevels": dict(Counter(entry["level"] for entry in grammar))}))
