"""Cache official sources privately; retain hashes for reproducible imports."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from datetime import datetime, timezone
from html.parser import HTMLParser
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".codex-tmp/english-sources"
CACHE.mkdir(parents=True, exist_ok=True)

class TextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
        if tag in ("p", "tr", "h1", "h2", "h3", "li", "br", "div"):
            self.parts.append("\n")
    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden -= 1
    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)

def fetch(source):
    target = CACHE / (source["id"] + "." + source["format"])
    if not target.exists():
        parts = urlsplit(source["url"])
        url = urlunsplit((parts.scheme, parts.netloc, quote(parts.path, safe="/%()"), parts.query, ""))
        try:
            with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=90) as response:
                data = response.read()
        except HTTPError as error:
            if source["id"] != "cefr-2020" or error.code != 403:
                raise
            # The document host blocks CLI downloads. Keep the official index
            # as evidence; never give its hash to the inaccessible PDF.
            return {**source, "sha256": None, "retrieved_at": datetime.now(timezone.utc).isoformat(), "pages": 278, "bytes": None,
                    "retrieval_method": "web PDF reader", "download_note": "Official PDF verified in web reader; CLI PDF and index downloads return 403. No local PDF hash or verbatim corpus."}
        if source["format"] == "pdf" and not data.startswith(b"%PDF"):
            raise ValueError(f"{source['id']}: expected PDF")
        target.write_bytes(data)
    data = target.read_bytes()
    pages = []
    if source["format"] == "pdf":
        pages = [page.extract_text(extraction_mode="layout") or "" for page in PdfReader(target).pages]
        text = "\n\f\n".join(pages)
        (CACHE / (source["id"] + ".pages.json")).write_text(json.dumps(pages, ensure_ascii=False), encoding="utf-8")
    else:
        parser = TextParser()
        parser.feed(data.decode("utf-8", errors="replace"))
        text = "".join(parser.parts)
    (CACHE / (source["id"] + ".txt")).write_text(text, encoding="utf-8")
    return {**source, "sha256": hashlib.sha256(data).hexdigest(), "retrieved_at": datetime.now(timezone.utc).isoformat(), "pages": len(pages), "bytes": len(data)}

if __name__ == "__main__":
    sources = json.loads((ROOT / "data/english/sources.json").read_text(encoding="utf-8"))
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        records = list(executor.map(fetch, sources))
    (ROOT / "data/english/source-lock.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps([{ "id": r["id"], "pages": r["pages"], "bytes": r["bytes"] } for r in records]))
