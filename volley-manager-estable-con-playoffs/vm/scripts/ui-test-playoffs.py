# Prueba de la interfaz: playoffs con el equipo más fuerte (partido en vivo del usuario, cuadro, campeón y premio).
# Uso: node scripts/build-single.mjs dist/volley-manager.html && (cd dist && python3 -m http.server 8765 &) && python3 scripts/ui-test-playoffs.py
import os, re
from playwright.sync_api import sync_playwright
errs=[];res=[]
def chk(name,cond,extra=''):
    res.append(bool(cond)); print(('OK  ' if cond else 'XX  ')+name+(' | '+str(extra) if extra!='' else ''))
URL=os.environ.get('URL','http://localhost:8765/volley-manager.html')
with sync_playwright() as p:
    b=p.chromium.launch(); played=False
    for attempt in range(4):
        pg=b.new_context(viewport={'width':1100,'height':900}).new_page()
        pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e)))
        pg.goto(URL); pg.wait_for_selector('h1')
        rows=pg.query_selector_all('.st tbody tr'); best=max(rows,key=lambda r: float(r.query_selector_all('td')[-1].inner_text())); team=best.query_selector_all('td')[1].inner_text()
        opts={o.inner_text():o.get_attribute('value') for o in pg.query_selector('section select').query_selector_all('option')}; pg.select_option('section select',opts[team])
        for _ in range(14): pg.click('button:has-text("Simular jornada")')
        chk('fase regular terminada (14 jornadas) y se ofrece empezar playoffs','Fase regular terminada' in pg.inner_text('main'))
        top4=re.search(r'Clasifican los 4 mejores: (.+?)\.',pg.inner_text('main')).group(1); chk('se listan 4 clasificados',len(top4.split(','))==4,top4)
        pg.click('button:has-text("Empezar playoffs")'); t=pg.inner_text('main')
        chk('cuadro: 2 semifinales al mejor de 3 con "próximo" partido y localía','Semifinal 1' in t and 'Semifinal 2' in t and t.count('próximo:')==2 and '(local)' in t)
        chk('encabezado muestra "playoffs"','playoffs' in pg.inner_text('h1'))
        if pg.query_selector('button:has-text("Jugar mi partido de playoffs")') is None:
            print('   (el equipo elegido no clasificó; se reintenta)'); res.pop(); res.pop(); res.pop(); res.pop(); pg.context.close(); continue
        played=True
        before=pg.inner_text('.notice >> nth=-1'); pg.click('button:has-text("Jugar mi partido de playoffs")'); pg.click('button:has-text("Partido completo")')
        chk('el botón de cierre dice "Cerrar partido de playoffs"',pg.query_selector('button:has-text("Cerrar partido de playoffs")') is not None)
        pg.click('button:has-text("Cerrar partido de playoffs")'); after=pg.inner_text('main')
        chk('tras cerrarlo vuelve a Liga y el cuadro registra el resultado',('Playoffs' in after) and re.search(r'\d–\d',after) is not None and after.count(' · ')>=1)
        pg.click('nav >> text=Finanzas'); fin=pg.inner_text('main'); pg.click('nav >> text=Liga')
        pg.click('button:has-text("Simular los playoffs completos")'); t=pg.inner_text('main')
        chk('temporada terminada con campeón de los playoffs y puesto final','Temporada 1 terminada' in t and 'Campeón' in t and 'puesto' in t)
        chk('el cuadro final muestra final y bronce','Final' in t and 'Bronce' in t and t.count('pasa ')>=3)
        pg.click('button:has-text("Cobrar el premio")'); pg.click('nav >> text=Estadísticas'); chk('el historial registra al campeón de los playoffs',len(pg.query_selector_all('section table')[-1].query_selector_all('tbody tr'))==1)
        pg.screenshot(path='dist/shot_po.png'); break
    chk('se pudo probar el partido de playoffs del usuario (algún intento clasificó)',played)
    b.close()
print('errores de consola:',errs or 'ninguno'); print(f'RESULTADO: {sum(res)}/{len(res)}')
