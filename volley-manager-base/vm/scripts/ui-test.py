# Prueba de la interfaz en un navegador real (Playwright + Chromium): partido, cambios, mercado, finanzas, guardado.
# Uso: node scripts/build-single.mjs dist/volley-manager.html && (cd dist && python3 -m http.server 8765 &) && python3 scripts/ui-test.py
import os, re
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://localhost:8765/volley-manager.html')
errs=[];res=[]
def chk(name,cond,extra=''):
    res.append(bool(cond)); print(('OK  ' if cond else 'XX  ')+name+(' | '+str(extra) if extra!='' else ''))
def budget(pg): return int(re.sub(r'[^\d]','',re.search(r'\$ ([\d\.]+)',pg.inner_text('h1')).group(1)))
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1100,'height':900}); pg=ctx.new_page()
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e)))
    pg.goto(URL); pg.wait_for_selector('h1')
    chk('8 pestañas',len(pg.query_selector_all('nav button'))==8)
    chk('clasificación con columna Fuerza',pg.query_selector_all('section table')[0].inner_text().count('Fuerza')==1 and len(pg.query_selector_all('section table tbody tr'))==8)
    b0=budget(pg); chk('presupuesto inicial 1.000.000',b0==1000000,b0)
    # --- Plantel: alineación inválida
    pg.click('nav >> text=Plantel'); sels=pg.query_selector_all('select')
    opts=[o.get_attribute('value') for o in sels[1].query_selector_all('option')]
    sels[2].select_option(sels[1].input_value())   # mismo receptor en ambos puestos
    chk('alineación inválida muestra error',pg.query_selector('p.err') is not None)
    pg.click('nav >> text=Liga'); chk('Jugar mi partido deshabilitado con alineación inválida',pg.is_disabled('button:has-text("Jugar mi partido")'))
    pg.click('nav >> text=Plantel'); pg.click('button:has-text("Alineación automática")'); chk('alineación automática repara',pg.query_selector('p.err') is None)
    # --- Partido
    pg.click('nav >> text=Liga'); pg.click('button:has-text("Jugar mi partido")')
    chk('cancha en vivo: 12 casillas',len(pg.query_selector_all('.cell'))==12); chk('hay un sacador marcado y no es el líbero',len(pg.query_selector_all('.cell.srv'))==1 and 'L · saca' not in pg.inner_text('.cell.srv').replace('\n',' ') and pg.inner_text('.cell.srv').strip().endswith('saca'))
    s0=pg.inner_text('.score')
    for _ in range(6): pg.click('button:has-text("Punto")')
    chk('el marcador avanza con "Punto"',pg.inner_text('.score')!=s0,pg.inner_text('.score'))
    pg.select_option('section select',index=1); pg.click('button:has-text("Cambiar")')
    chk('cambio aplicado (1/6) y en el registro',('1/6' in pg.inner_text('section')) and ('Cambio (' in pg.inner_text('ol')))
    pg.click('button:has-text("Partido completo")'); chk('partido terminado',pg.is_visible('button:has-text("Cerrar jornada")'))
    chk('boxscore con suplente',len(pg.query_selector_all('section table tbody tr'))>=14)
    pg.click('button:has-text("Cerrar jornada")'); chk('vuelve a Liga, jornada 2',('Jornada 2' in pg.inner_text('main')))
    b1=budget(pg); chk('presupuesto cambió tras la jornada',b1!=b0,f'{b0} -> {b1}')
    # --- Mercado
    pg.click('nav >> text=Mercado'); rows=pg.query_selector_all('section table')[0].query_selector_all('tbody tr'); n0=len(rows)
    pg.click('section table >> nth=0 >> button:text-is("Fichar"):not([disabled]) >> nth=0'); chk('fichaje descuenta presupuesto',budget(pg)<b1,f'{b1} -> {budget(pg)}')
    chk('mercado -1 y plantel 14/16',len(pg.query_selector_all('section table')[0].query_selector_all('tbody tr'))==n0-1 and '14/16' in pg.inner_text('section'))
    b2=budget(pg); pg.click('section table >> nth=1 >> button:text-is("Vender") >> nth=0'); chk('venta aumenta presupuesto',budget(pg)>b2,f'{b2} -> {budget(pg)}')
    # --- Finanzas
    pg.click('nav >> text=Finanzas'); t=pg.inner_text('main'); chk('libro de cuentas con Patrocinio, Salarios y fichaje',all(x in t for x in ['Patrocinio','Salarios','Fichaje de','Venta de']))
    # --- Guardar / IndexedDB / recarga
    pg.click('nav >> text=Guardar'); pg.click('section button:text-is("Guardar") >> nth=0'); pg.wait_for_timeout(300)
    chk('guardado en ranura 1',('jornadas jugadas' in pg.inner_text('main')) or ('Ranura 1: ' in pg.inner_text('main') and 'vacía' not in pg.inner_text('main').split('Ranura 2')[0]),pg.inner_text('main').split('Ranura 2')[0][-90:])
    bsave=budget(pg); pg.click('button:has-text("Mostrar texto de la partida")'); txt=pg.input_value('textarea'); chk('texto exportado es JSON',re.match(r'^\{"version":\d+',txt) is not None,len(txt))
    pg.reload(); pg.wait_for_selector('h1'); pg.click('nav >> text=Guardar'); pg.wait_for_timeout(400)
    chk('la ranura 1 sobrevive a la recarga (IndexedDB)','vacía' not in pg.inner_text('main').split('Ranura 2')[0])
    bnew=budget(pg); pg.click('section button:text-is("Cargar") >> nth=0'); pg.wait_for_timeout(200)
    chk('cargar restaura presupuesto y jornada',budget(pg)==bsave and 'jornada 2' in pg.inner_text('h1'),f'{bnew} -> {budget(pg)}')
    # --- importar texto
    pg.reload(); pg.wait_for_selector('h1'); pg.click('nav >> text=Guardar'); pg.fill('textarea',txt); pg.click('button:has-text("Importar este texto")')
    chk('importar desde texto restaura la partida',budget(pg)==bsave and 'jornada 2' in pg.inner_text('h1'))
    pg.fill('textarea','{"version":2}') if pg.query_selector('textarea') else None
    pg.click('nav >> text=Guardar'); pg.fill('textarea','esto no es una partida'); pg.click('button:has-text("Importar este texto")')
    chk('texto inválido muestra error y no rompe',pg.query_selector('[role=status]') is not None and budget(pg)==bsave,pg.inner_text('[role=status]'))
    # --- capturas
    pg.click('nav >> text=Liga'); pg.screenshot(path='dist/shot_liga.png')
    pg.click('button:has-text("Jugar mi partido")'); [pg.click('button:has-text("Punto")') for _ in range(10)]; pg.screenshot(path='dist/shot_partido.png')
    pg.emulate_media(color_scheme='dark'); pg.screenshot(path='dist/shot_dark.png')
    m=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2).new_page(); m.goto(URL); m.wait_for_selector('h1'); m.click('nav >> text=Plantel'); m.screenshot(path='dist/shot_mobile.png')
    b.close()
print('errores de consola:',errs or 'ninguno'); print(f'RESULTADO: {sum(res)}/{len(res)}')
