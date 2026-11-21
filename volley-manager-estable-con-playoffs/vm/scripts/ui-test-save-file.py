# Verifica exportación e importación real de archivos de partida en Chromium.
import json
import os
import tempfile
from playwright.sync_api import sync_playwright

URL = os.environ.get('URL', 'http://localhost:8765/volley-manager.html')
results = []
errors = []

def chk(name, condition, extra=''):
    results.append(bool(condition))
    print(('OK  ' if condition else 'XX  ') + name + (' | ' + str(extra) if extra else ''))

download_path = None
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 1100, 'height': 900}, accept_downloads=True)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_selector('h1')
    page.click('button:has-text("Simular jornada")')
    page.wait_for_function("document.querySelector('h1')?.innerText.includes('jornada 2/14')")
    page.click('nav >> text=Guardar')

    with page.expect_download(timeout=10000) as pending:
        page.click('button:has-text("Exportar a archivo")')
    download = pending.value
    download_path = os.path.join(tempfile.gettempdir(), download.suggested_filename)
    download.save_as(download_path)
    chk('el navegador descarga el archivo de partida', os.path.isfile(download_path), download.suggested_filename)

    payload = {}
    try:
        with open(download_path, 'r', encoding='utf-8') as exported:
            payload = json.load(exported)
    except Exception as error:
        errors.append('archivo exportado ilegible: ' + str(error))
    chk('el archivo exportado contiene una sesión válida', payload.get('format') == 'volley-session-v1' and payload.get('game', {}).get('round') == 1)

    page.reload()
    page.wait_for_selector('h1')
    page.click('nav >> text=Guardar')
    page.locator('input[type="file"]').set_input_files(download_path)
    page.wait_for_function("document.querySelector('h1')?.innerText.includes('jornada 2/14')")
    chk('importar el archivo restaura la jornada y el estado', 'jornada 2/14' in page.inner_text('h1'), page.inner_text('h1')[:100])

    browser.close()

if download_path and os.path.exists(download_path):
    os.unlink(download_path)

print('errores de página:', errors or 'ninguno')
print(f'RESULTADO: {sum(results)}/{len(results)}')
if not all(results) or errors:
    raise SystemExit(1)
