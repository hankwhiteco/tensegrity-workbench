"""Scrub the build animation in headless Chrome and save a contact sheet: tests/out/anim_sheet.png
python3 tests/anim_frames.py [sizeIndex] [pattern]"""
import os, re, subprocess, sys, base64, json
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
size = sys.argv[1] if len(sys.argv) > 1 else '2'
pat = sys.argv[2] if len(sys.argv) > 2 else 'geo'
stops = sys.argv[3] if len(sys.argv) > 3 else '40,160,300,420,600,1000'
dev = open(os.path.join(root, 'dist/dev.html')).read()
probe = r'''<script>
(async () => {
  const $ = id => document.getElementById(id), wait = ms => new Promise(r => setTimeout(r, ms));
  try { localStorage.clear(); } catch (e) {}
  await wait(1500);
  $('pat').value = '%PAT%'; $('pat').dispatchEvent(new Event('change'));
  $('f').value = '%SIZE%'; $('f').dispatchEvent(new Event('change'));
  await wait(6000);
  if ($('anim').hidden) $('bBuild').click();
  $('bSpin').click(); // hold the view still
  const out = [];
  for (const v of [%STOPS%]) {
    const sc = $('aScrub'); sc.value = v; sc.dispatchEvent(new Event('input')); await wait(100); window.__twDraw && window.__twDraw();
    out.push({ v, cap: $('aCap').textContent, img: $('cv').toDataURL('image/png') });
  }
  const pre = document.createElement('pre'); pre.id = 'frames'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre);
})();
</script>'''.replace('%PAT%', pat).replace('%SIZE%', size).replace('%STOPS%', stops)
os.makedirs(os.path.join(root, 'tests/out'), exist_ok=True)
path = os.path.join(root, 'tests/out/anim.html')
open(path, 'w').write(dev.replace('</body>', probe + '</body>'))
chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
dom = subprocess.run([chrome, '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1400,900', '--virtual-time-budget=60000', '--dump-dom', 'file://' + path + '#noworker'], capture_output=True, text=True, timeout=300).stdout
m = re.search(r'<pre id="frames">(.*?)</pre>', dom, re.S)
if not m: sys.exit('no frames')
frames = json.loads(m.group(1).replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"'))
cells = ''.join(f'<div><img src="{f["img"]}" style="width:560px;height:360px;object-fit:cover;background:#000"><div style="font:14px sans-serif;color:#ddd;padding:4px">{f["v"]/10:.0f}%: {f["cap"]}</div></div>' for f in frames)
sheet = os.path.join(root, 'tests/out/anim_sheet.html')
open(sheet, 'w').write(f'<!doctype html><body style="margin:0;background:#222"><div style="display:grid;grid-template-columns:repeat(3,560px);gap:6px;padding:6px">{cells}</div></body>')
subprocess.run([chrome, '--headless=new', '--disable-gpu', '--window-size=1710,1200', '--screenshot=' + os.path.join(root, 'tests/out/anim_sheet.png'), 'file://' + sheet], capture_output=True, timeout=120)
for i, f in enumerate(frames):
    open(os.path.join(root, f'tests/out/frame_{i}.png'), 'wb').write(base64.b64decode(f['img'].split(',', 1)[1]))
    print(f['v'], f['cap'])
