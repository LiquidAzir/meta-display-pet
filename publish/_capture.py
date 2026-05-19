"""
Capture screenshots of Meta Display Pet for app store submission.

Drives the local preview at http://localhost:5181 via Playwright, navigating
through each screen and saving 600x600 PNGs to ./publish/.
"""

from pathlib import Path
import time
from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent
URL = "http://localhost:5181"

# Each entry: (filename, navigation function, optional pre-render delay seconds)
def setup_baby_leaf(page):
    page.evaluate("""() => {
      localStorage.removeItem('mdg_pet_v1');
    }""")
    page.reload()
    page.wait_for_timeout(200)
    page.click('[data-action="welcome-start"]')
    page.wait_for_timeout(150)
    # leaf egg is idx 2
    page.click('[data-action="egg-next"]')
    page.click('[data-action="egg-next"]')
    page.wait_for_timeout(150)
    page.click('[data-action="egg-confirm"]')
    page.wait_for_timeout(150)
    for c in ['L','E','A','F','Y']:
        page.click(f'[data-letter="{c}"]')
    page.click('[data-action="name-confirm"]')
    page.wait_for_timeout(200)
    # age to baby
    page.evaluate("""() => {
      const d = JSON.parse(localStorage.getItem('mdg_pet_v1'));
      d.pet.bornAt = Date.now() - 4 * 3600 * 1000;
      d.pet.lastTickAt = Date.now();
      localStorage.setItem('mdg_pet_v1', JSON.stringify(d));
    }""")
    page.reload()
    page.wait_for_timeout(400)
    # dismiss evolve overlay if shown
    page.evaluate("""() => {
      const btn = document.querySelector('[data-action="evolve-continue"]');
      if (btn) btn.click();
    }""")
    page.wait_for_timeout(200)

def setup_adult_crystal(page):
    page.evaluate("""() => { localStorage.removeItem('mdg_pet_v1'); }""")
    page.reload()
    page.wait_for_timeout(200)
    page.click('[data-action="welcome-start"]')
    page.wait_for_timeout(150)
    # crystal = idx 3
    for _ in range(3):
        page.click('[data-action="egg-next"]')
    page.wait_for_timeout(150)
    page.click('[data-action="egg-confirm"]')
    page.wait_for_timeout(150)
    for c in ['D','I','A','M','O','N','D']:
        page.click(f'[data-letter="{c}"]')
    page.click('[data-action="name-confirm"]')
    page.wait_for_timeout(200)
    page.evaluate("""() => {
      const d = JSON.parse(localStorage.getItem('mdg_pet_v1'));
      d.pet.bornAt = Date.now() - 100 * 3600 * 1000;
      d.pet.lastTickAt = Date.now();
      d.pet.careSum = 92 * 80;
      d.pet.careSamples = 80;
      d.pet.gameWins = 8;
      localStorage.setItem('mdg_pet_v1', JSON.stringify(d));
    }""")
    page.reload()
    page.wait_for_timeout(400)
    # dismiss evolve overlay
    page.evaluate("""() => {
      const btn = document.querySelector('[data-action="evolve-continue"]');
      if (btn) btn.click();
    }""")
    page.wait_for_timeout(300)

shots = [
    ("01-welcome.png", lambda p: (
        p.evaluate("() => { localStorage.removeItem('mdg_pet_v1'); }"),
        p.reload(),
        p.wait_for_timeout(600),
    )),
    ("02-howto.png", lambda p: (
        p.evaluate("() => { localStorage.removeItem('mdg_pet_v1'); }"),
        p.reload(),
        p.wait_for_timeout(200),
        p.click('[data-action="open-howto"]'),
        p.wait_for_timeout(200),
    )),
    ("03-egg-select.png", lambda p: (
        p.evaluate("() => { localStorage.removeItem('mdg_pet_v1'); }"),
        p.reload(),
        p.wait_for_timeout(200),
        p.click('[data-action="welcome-start"]'),
        p.wait_for_timeout(200),
    )),
    ("04-name-pet.png", lambda p: (
        p.evaluate("() => { localStorage.removeItem('mdg_pet_v1'); }"),
        p.reload(),
        p.wait_for_timeout(200),
        p.click('[data-action="welcome-start"]'),
        p.wait_for_timeout(150),
        p.click('[data-action="egg-confirm"]'),
        p.wait_for_timeout(200),
        p.click('[data-letter="E"]'),
        p.click('[data-letter="M"]'),
        p.click('[data-letter="B"]'),
        p.click('[data-letter="R"]'),
        p.wait_for_timeout(200),
    )),
    ("05-pet-baby.png", lambda p: (setup_baby_leaf(p),)),
    ("06-pet-adult.png", lambda p: (setup_adult_crystal(p),)),
    ("07-stats.png", lambda p: (
        setup_adult_crystal(p),
        p.click('[data-action="act-stats"]'),
        p.wait_for_timeout(300),
    )),
    ("08-minigame.png", lambda p: (
        setup_adult_crystal(p),
        p.click('[data-action="act-play"]'),
        p.wait_for_timeout(200),
        p.click('[data-action="play-simon"]'),
        p.wait_for_timeout(400),
    )),
]

def run():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width":600, "height":600}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto(URL)
        page.wait_for_timeout(500)

        for fname, fn in shots:
            try:
                fn(page)
                out = OUT / fname
                page.screenshot(path=str(out))
                print(f"saved {out.name}")
            except Exception as e:
                print(f"FAILED {fname}: {e}")
        browser.close()

if __name__ == "__main__":
    run()
