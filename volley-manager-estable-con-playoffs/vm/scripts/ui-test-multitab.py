# Verifica que una sola pestaña controle el autoguardado y que la siguiente recupere el último estado.
import os
from playwright.sync_api import sync_playwright

URL = os.environ.get('URL', 'http://localhost:8765/volley-manager.html')
results = []
errors = []

def chk(name, condition, extra=''):
    results.append(bool(condition))
    print(('OK  ' if condition else 'XX  ') + name + (' | ' + str(extra) if extra else ''))

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1100, 'height': 900})
    first = context.new_page()
    first.on('pageerror', lambda error: errors.append('first: ' + str(error)))
    first.goto(URL)
    first.wait_for_selector('h1')
    first.wait_for_timeout(600)
    chk('primera pestaña obtiene el control', 'Otra pestaña está utilizando esta partida' not in first.inner_text('body'))

    first.click('button:has-text("Simular jornada")')
    first.wait_for_timeout(900)
    chk('primera pestaña avanza y autoguarda la jornada 1', 'jornada 2/14' in first.inner_text('h1'))

    second = context.new_page()
    second.on('pageerror', lambda error: errors.append('second: ' + str(error)))
    second.goto(URL)
    second.wait_for_selector('h1')
    second.wait_for_selector('text=Otra pestaña está utilizando esta partida')
    chk('segunda pestaña espera y no habilita el juego', second.locator('nav').count() == 0)

    first.close()
    second.wait_for_selector('text=Hay una partida automática guardada', timeout=10000)
    banner = second.locator('.notice[role="alert"]').inner_text()
    chk('al obtener el control, segunda pestaña detecta el autoguardado reciente', '1 jornadas jugadas' in banner, banner[:140])

    second.locator('.notice[role="alert"] button:has-text("Continuar")').click()
    second.wait_for_function("document.querySelector('h1')?.innerText.includes('jornada 2/14')")
    chk('segunda pestaña recupera el progreso antes de habilitar la sesión', 'jornada 2/14' in second.inner_text('h1'))

    browser.close()

print('errores de página:', errors or 'ninguno')
print(f'RESULTADO: {sum(results)}/{len(results)}')
if not all(results) or errors:
    raise SystemExit(1)
