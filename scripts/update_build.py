from pathlib import Path
from datetime import datetime
import re

p = Path("index.html")
html = p.read_text(encoding="utf-8")

build = datetime.now().strftime("BUILD-%Y%m%d-%H%M%S")

# elimina badge previo si existe
html = re.sub(
    r'<div id="buildBadge".*?>.*?</div>',
    '',
    html,
    flags=re.DOTALL
)

target = '<div class="brand-version">v3.1</div>'
replacement = f'{target}\n<div id="buildBadge" style="font-size:12px;font-weight:800;opacity:.7;margin-top:4px;">{build}</div>'

if target not in html:
    raise SystemExit("No encontré el bloque brand-version para insertar el build badge.")

html = html.replace(target, replacement, 1)

p.write_text(html, encoding="utf-8")
print(build)
