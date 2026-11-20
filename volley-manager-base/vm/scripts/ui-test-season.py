# Prueba de la interfaz: temporada completa con playoffs, intersemana (edades, evolución, noticias), historial y guardado.
import re
from playwright.sync_api import sync_playwright
errs=[];res=[]
def chk(name,cond,extra=''):
    res.append(bool(cond)); print(('OK  ' if cond else 'XX  ')+name+(' | '+str(extra) if extra!='' else ''))
def budget(pg): return int(re.sub(r'[^\d]','',re.search(r'\$ ([\d\.]+)',pg.inner_text('h1')).group(1)))
import os
URL=os.environ.get('URL','http://localhost:8765/volley-manager.html')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_context(viewport={'width':1100,'height':900}).new_page()
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e)))
    pg.goto(URL); pg.wait_for_selector('h1')
    chk('selector de equipo visible antes de jugar',pg.query_selector('text=Dirigís a') is not None)
    pg.select_option('section select >> nth=0','3'); h=pg.inner_text('h1'); chk('cambiar de equipo actualiza el encabezado','Costa Azul' in h,h[:60])
    team=re.search(r'— (.+?) · temporada',h).group(1); chk('el equipo elegido es el que se dirige',team!='Río Plata',team)
    # partido: parciales y mercado bloqueado
    pg.click('button:has-text("Jugar mi partido")'); pg.click('button:has-text("Partido completo")')
    chk('parciales por set visibles','Parciales:' in pg.inner_text('section') and re.search(r'\d+-\d+',pg.inner_text('section')) is not None)
    pg.click('nav >> text=Mercado'); chk('mercado bloqueado con partido en curso','partido en curso' in pg.inner_text('section') and all(pg.is_disabled(x) for x in ['section table >> nth=0 >> button:text-is("Fichar") >> nth=0','section table >> nth=1 >> button:text-is("Vender") >> nth=0']))
    pg.click('nav >> text=Partido'); pg.click('button:has-text("Cerrar jornada")')
    chk('resultados recientes con parciales',re.search(r'J1: .*\(\d+-\d+',pg.inner_text('main')) is not None)
    chk('el selector de equipo desaparece tras jugar',pg.query_selector('text=Dirigís a') is None)
    # temporada completa
    for _ in range(13): pg.click('button:has-text("Simular jornada")')
    chk('fase regular terminada: se ofrece empezar los playoffs','Fase regular terminada' in pg.inner_text('main') and pg.query_selector('button:has-text("Empezar playoffs")') is not None)
    pg.click('button:has-text("Empezar playoffs")'); chk('cuadro de semifinales al mejor de 3',pg.inner_text('main').count('al mejor de 3')==2 and 'Semifinal 1' in pg.inner_text('main'))
    pg.click('button:has-text("Simular los playoffs completos")')
    t=pg.inner_text('main'); chk('temporada terminada con campeón y puesto','Temporada 1 terminada' in t and 'Campeón' in t and 'puesto' in t,re.search(r'Campeón: (\S+ ?\S*)\.',t).group(1) if 'Campeón' in t else '')
    pg.click('nav >> text=Mercado'); bm=budget(pg); pg.click('section table >> nth=0 >> button:text-is("Fichar"):not([disabled]) >> nth=0')
    chk('se puede fichar con la temporada terminada (antes que las computadoras)',budget(pg)<bm and 'partido en curso' not in pg.inner_text('section'),f'{bm} -> {budget(pg)}')
    pg.click('nav >> text=Liga'); t=pg.inner_text('main')
    b_before=budget(pg); prize=int(re.sub(r'[^\d]','',re.search(r'Premio: \$ ([\d\.]+)',t).group(1)))
    pg.click('button:has-text("Cobrar el premio")'); h=pg.inner_text('h1')
    chk('arranca la temporada 2 conservando equipo',('temporada 2' in h) and ('jornada 1/14' in h) and (team in h),h[:90])
    chk('el premio se cobra',budget(pg)==b_before+prize,f'{b_before} + {prize} = {budget(pg)}')
    pg.click('nav >> text=Plantel'); t=pg.inner_text('main'); chk('tabla de plantel con edades (18-40)',all(18<=int(r.query_selector_all('td')[2].inner_text())<=41 for r in pg.query_selector_all('section table')[-1].query_selector_all('tbody tr')))
    chk('evolución del plantel visible con cambios',('Evolución en la última intersemana' in t) and len(pg.query_selector_all('section table')[0].query_selector_all('tbody tr'))>=7)
    pg.click('nav >> text=Estadísticas'); chk('historial con 1 temporada',len(pg.query_selector_all('section table')[-1].query_selector_all('tbody tr'))==1)
    pg.click('nav >> text=Liga'); rows=pg.query_selector_all('section table tbody tr'); chk('PJ=0 en la temporada 2',all(r.query_selector_all('td')[2].inner_text()=='0' for r in rows))
    pg.click('nav >> text=Finanzas'); chk('libro con premio de liga y temporada','Premio de liga' in pg.inner_text('main') and 'T1 · J14' in pg.inner_text('main'))
    # guardar y recargar en temporada 2
    pg.click('nav >> text=Guardar'); pg.click('section button:text-is("Guardar") >> nth=0'); pg.wait_for_timeout(300); pg.reload(); pg.wait_for_selector('h1')
    pg.click('nav >> text=Guardar'); pg.wait_for_timeout(300); pg.click('section button:text-is("Cargar") >> nth=0'); pg.wait_for_timeout(200)
    chk('cargar restaura la temporada 2','temporada 2' in pg.inner_text('h1') and team in pg.inner_text('h1'))
    pg.click('nav >> text=Liga'); pg.click('button:has-text("Jugar mi partido")'); pg.click('button:has-text("Partido completo")'); pg.click('button:has-text("Cerrar jornada")')
    chk('se puede jugar la temporada 2','jornada 2/14' in pg.inner_text('h1'))
    for _ in range(13): pg.click('button:has-text("Simular jornada")')
    pg.click('button:has-text("Empezar playoffs")'); pg.click('button:has-text("Simular los playoffs completos")')
    pg.click('button:has-text("Cobrar el premio")'); chk('segunda intersemana: temporada 3','temporada 3' in pg.inner_text('h1'))
    pg.click('nav >> text=Liga'); chk('noticias del mercado visibles tras dos intersemanas','Noticias del mercado' in pg.inner_text('main'),pg.inner_text('main').split('Noticias del mercado')[1][:120].replace('\n',' | ') if 'Noticias del mercado' in pg.inner_text('main') else '')
    pg.screenshot(path='dist/shot_t2.png')
    b.close()
print('errores de consola:',errs or 'ninguno'); print(f'RESULTADO: {sum(res)}/{len(res)}')
