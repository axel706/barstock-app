from pathlib import Path
from datetime import datetime
import re

p = Path("index.html")
html = p.read_text(encoding="utf-8")

build = datetime.now().strftime("BUILD-%Y%m%d-%H%M%S")

# reemplaza contenido del badge
if '<span class="bs-build" id="buildBadge">' not in html:
    raise SystemExit("No encontré el bloque brand-version para insertar el build badge.")

html = re.sub(
    r'(<span class="bs-build" id="buildBadge">)[^<]*',
    rf'\g<1>{build}',
    html
)

p.write_text(html, encoding="utf-8")
print(build)
