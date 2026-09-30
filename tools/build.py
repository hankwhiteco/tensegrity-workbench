"""Inline src/solver.js into src/page.html.
dist/index.html   page body only (what gets published as the artifact)
dist/dev.html     full standalone document for local testing"""
import os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
page = open(os.path.join(root, 'src/page.html')).read()
solver = open(os.path.join(root, 'src/solver.js')).read()
body = page.replace('/*SOLVER*/', solver)

# Write every non-ASCII character as an escape, so the page reads the same whatever charset it is served with
# (the artifact viewer showed the UTF-8 bytes of the times sign, the middle dot and the degree sign as 'Ã' and friends).
import re
def ascii_only(text):
    out = []
    for part in re.split(r'(<script[^>]*>.*?</script>)', text, flags=re.S):
        if part.startswith('<script'):
            out.append(''.join(c if ord(c) < 128 else '\\u%04x' % ord(c) for c in part))
        else:
            out.append(''.join(c if ord(c) < 128 else '&#x%x;' % ord(c) for c in part))
    return ''.join(out)
body = ascii_only(body)
assert all(ord(c) < 128 for c in body)
os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
open(os.path.join(root, 'dist/index.html'), 'w').write(body)
dev = ('<!doctype html><html><head><meta charset="utf-8">'
       '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
       '<style>body{margin:0}</style></head><body>' + body + '</body></html>')
open(os.path.join(root, 'dist/dev.html'), 'w').write(dev)
# standalone site for any static host (GitHub Pages, Netlify, Cloudflare Pages): dist/site/index.html
os.makedirs(os.path.join(root, 'dist/site'), exist_ok=True)
open(os.path.join(root, 'dist/site/index.html'), 'w').write(dev)
# GitHub Pages serves from /docs
os.makedirs(os.path.join(root, 'docs'), exist_ok=True)
open(os.path.join(root, 'docs/index.html'), 'w').write(dev)
open(os.path.join(root, 'docs/.nojekyll'), 'w').write('')
print('built dist/index.html', len(body), 'bytes')
