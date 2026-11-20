# Prueba de la interfaz: lesiones (titular lesionado bloquea el partido, alineación automática, estado en el plantel, frecuencia, ficha).
# Uso: node scripts/build-single.mjs dist/volley-manager.html && (cd dist && python3 -m http.server 8765 &) && python3 scripts/ui-test-injuries.py
import json, os, re
from playwright.sync_api import sync_playwright
errs=[];res=[]
def chk(name,cond,extra=''):
    res.append(bool(cond)); print(('OK  ' if cond else 'XX  ')+name+(' | '+str(extra) if extra!='' else ''))
URL=os.environ.get('URL','http://localhost:8765/volley-manager.html')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_context(viewport={'width':1100,'height':900}).new_page()
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e)))
    pg.goto(URL); pg.wait_for_selector('h1')
    pg.click('nav >> text=Guardar'); pg.click('button:has-text("Mostrar texto de la partida")'); g=json.loads(pg.input_value('textarea'))
    chk('la partida es versión 6 y trae injuries={} e injuryScale=1',g['version']==6 and g['injuries']=={} and g['injuryScale']==1)
    me=g['teams'][g['userTeam']]; roster={p['id']:p for p in me['roster']}; star=me['lineup']['S']
    g['injuries'][star]={'kind':'tobillo','weeks':3,'total':3,'season':1,'round':0,'where':'partido'}
    pg.fill('textarea',json.dumps(g)); pg.click('button:has-text("Importar este texto")'); chk('se importa una partida con un titular lesionado','temporada 1' in pg.inner_text('h1'))
    pg.click('nav >> text=Plantel'); t=pg.inner_text('main')
    chk('el plantel muestra el estado "lesionado 3 sem." y la lista de lesiones','lesionado 3 sem.' in t and 'tobillo' in t and 'No hay jugadores lesionados' not in t)
    chk('la alineación con el titular lesionado se marca como inválida',pg.query_selector('p.err') is not None and 'lesionado' in pg.inner_text('p.err'),pg.inner_text('p.err')[:60] if pg.query_selector('p.err') else '')
    pg.click('nav >> text=Liga'); chk('no se puede jugar ni simular con el titular lesionado',pg.is_disabled('button:has-text("Jugar mi partido")') and pg.is_disabled('button:has-text("Simular jornada")'))
    pg.click('nav >> text=Plantel'); pg.click('button:has-text("Alineación automática")')
    chk('la alineación automática reemplaza al lesionado y se puede jugar',pg.query_selector('p.err') is None)
    pg.click('nav >> text=Liga'); chk('con la alineación reparada se puede jugar',not pg.is_disabled('button:has-text("Jugar mi partido")'))
    # ficha del lesionado
    pg.click('nav >> text=Plantel'); pg.click('section table tbody tr >> nth=0 >> button.lnk')
    rows=pg.query_selector_all('section table')[-1].query_selector_all('tbody tr'); inj=[r for r in rows if 'lesionado' in r.inner_text()]
    inj[0].query_selector('button.lnk').click(); chk('la ficha del lesionado muestra la lesión','Lesionado: tobillo' in pg.inner_text('.notice.card'),pg.inner_text('.notice.card')[-80:].replace('\n',' '))
    # frecuencia de lesiones
    pg.select_option('section select >> nth=-1','0'); pg.click('nav >> text=Guardar'); pg.click('button:has-text("Mostrar texto de la partida")'); g2=json.loads(pg.input_value('textarea'))
    chk('"Sin lesiones" queda guardado (injuryScale=0)',g2['injuryScale']==0)
    # un partido con la escala triple: el resumen puede listar lesiones y nunca rompe
    pg.click('nav >> text=Plantel'); pg.select_option('section select >> nth=-1','3'); pg.click('nav >> text=Liga'); pg.click('button:has-text("Jugar mi partido")'); pg.click('button:has-text("Partido completo")')
    chk('el resumen del partido se muestra con lesiones a escala triple',pg.query_selector('.notice:has-text("Resumen")') is not None)
    pg.click('button:has-text("Cerrar jornada")'); chk('se cierra la jornada con lesiones activas','jornada 2/14' in pg.inner_text('h1'))
    pg.click('nav >> text=Acerca de'); ac=pg.inner_text('main'); chk('Acerca de cita la fuente de lesiones (FIVB, Bere et al.)','Bere' in ac and 'FIVB' in ac and 'Lesiones' in ac)
    b.close()
errs=[e for e in errs if 'error de prueba' not in e]
print('errores de consola:',errs or 'ninguno'); print(f'RESULTADO: {sum(res)}/{len(res)}')
