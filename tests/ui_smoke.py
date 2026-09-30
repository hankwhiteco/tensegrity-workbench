"""Headless Chrome smoke test: rapid control changes must never blank the view.
python3 tests/ui_smoke.py  -> prints the log written by the page, saves tests/out/smoke.png"""
import os, subprocess, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dev = open(os.path.join(root, 'dist/dev.html')).read()
probe = r'''<script>
(async () => {
  const log = [], $ = id => document.getElementById(id), wait = ms => new Promise(r => setTimeout(r, ms));
  const lit = () => { const c = $('cv'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] > 90) n++; return n; };
  const fire = (el, v, ev = 'change') => { el.value = v; el.dispatchEvent(new Event(ev)); };
  await wait(2500); log.push('start lit=' + lit() + ' verdict=' + $('verdict').textContent);
  for (const f of ['tower', 'sphere', 'tetra', 'prism', 'sphere', 'octa', 'tower', 'icosa6', 'cube', 'prism']) { fire($('family'), f); await wait(40); }
  await wait(3000); log.push('after rapid family switches lit=' + lit() + ' name=' + $('vpName').textContent + ' verdict=' + $('verdict').textContent);
  const inp = document.querySelector('#groups input'); for (const v of ['0', '-3', '', '200', '0.01', '20']) { fire(inp, v, 'input'); await wait(30); }
  $('chirL').click(); await wait(30); $('chirR').click();
  fire($('n'), '9'); await wait(20); fire($('n'), 'abc');
  await wait(3000); log.push('after bad inputs lit=' + lit() + ' verdict=' + $('verdict').textContent);
  fire($('family'), 'tower'); fire($('k'), '3'); await wait(4000);
  log.push('tower k=3 verdict=' + $('verdict').textContent + ' tighten shown=' + !$('tightWrap').hidden);
  if (!$('tightWrap').hidden) { $('bTight').click(); await wait(8000); log.push('after tighten verdict=' + $('verdict').textContent + ' lit=' + lit()); }
  fire($('k'), '4'); await wait(4000); log.push('tower k=4 verdict=' + $('verdict').textContent + ' lit=' + lit());
  fire($('family'), 'sphere'); for (const f of ['1', '3', '5', '2']) { fire($('f'), f); await wait(60); }
  await wait(6000); log.push('sphere f=2 name=' + $('vpName').textContent + ' sub=' + $('vpSub').textContent + ' verdict=' + $('verdict').textContent + ' lit=' + lit());
  fire($('f'), '4'); await wait(8000); log.push('sphere f=4 sub=' + $('vpSub').textContent + ' verdict=' + $('verdict').textContent + ' joint types=' + (document.querySelector('#extra h2') || {}).textContent);
  fire($('pat'), 'geo'); await wait(8000); log.push('ring f=4 verdict=' + $('verdict').textContent + ' checks=' + [...document.querySelectorAll('#checks .pill')].map(x => x.textContent).join(','));
  fire($('pat'), 'gold'); fire($('f'), '3'); await wait(6000);
  log.push('bench=' + $('bench').textContent.replace(/\s+/g, ' ').slice(0, 300));
  const pre = document.createElement('pre'); pre.id = 'smoke'; pre.textContent = log.join('\n'); document.body.appendChild(pre);
})();
</script>'''
os.makedirs(os.path.join(root, 'tests/out'), exist_ok=True)
path = os.path.join(root, 'tests/out/smoke.html')
open(path, 'w').write(dev.replace('</body>', probe + '</body>'))
chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
common = [chrome, '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1400,900', '--virtual-time-budget=120000']
dom = subprocess.run(common + ['--dump-dom', 'file://' + path + '#noworker'], capture_output=True, text=True, timeout=400).stdout
m = re.search(r'<pre id="smoke">(.*?)</pre>', dom, re.S)
print(m.group(1) if m else 'no smoke log found')
subprocess.run(common + ['--screenshot=' + os.path.join(root, 'tests/out/smoke.png'), 'file://' + path + '#noworker'], capture_output=True, timeout=400)
