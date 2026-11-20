# Prueba de la interfaz: ficha de jugador, vista de otros equipos, filtros del mercado, resumen del partido, autoguardado, Acerca de y manejo de errores.
# El caso del manejo de errores necesita dist/crash.html (una compilación que falla a propósito, ver README).
import os, re
from playwright.sync_api import sync_playwright
errs=[];res=[]
def chk(name,cond,extra=''):
    res.append(bool(cond)); print(('OK  ' if cond else 'XX  ')+name+(' | '+str(extra) if extra!='' else ''))
URL=os.environ.get('URL','http://localhost:8765/volley-manager.html')
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1100,'height':900}); pg=ctx.new_page()
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e)))
    pg.goto(URL); pg.wait_for_selector('h1')
    chk('primera vez: sin banner de autoguardado',pg.query_selector('.notice[role=alert]') is None)
    # --- ficha de jugador y vista de equipo
    pg.click('nav >> text=Plantel'); pg.click('section table tbody tr >> nth=0 >> button.lnk'); card=pg.inner_text('.notice.card')
    chk('ficha de jugador con edad, valoración, barras y valor',all(x in card for x in ['años','valoración','Saque','Valor de mercado']) and len(pg.query_selector_all('.bar'))>=5,card[:70].replace('\n',' '))
    pg.click('.notice.card button:has-text("Cerrar")'); chk('la ficha se cierra',pg.query_selector('.notice.card') is None)
    pg.click('nav >> text=Liga'); pg.click('.st tbody tr >> nth=2 >> button.lnk'); tv=pg.inner_text('.notice')
    chk('vista del plantel de otro equipo con titulares marcados','Titular' in tv and tv.count('●')==7,tv[:50].replace('\n',' '))
    pg.click('.notice table tbody tr >> nth=0 >> button.lnk'); chk('desde la vista de equipo se abre la ficha',pg.query_selector('.notice.card') is not None)
    pg.click('.notice.card button:has-text("Cerrar")'); pg.click('.notice button:has-text("Cerrar")')
    # --- filtros del mercado
    pg.click('nav >> text=Mercado'); n_all=len(pg.query_selector_all('section table')[0].query_selector_all('tbody tr'))
    pg.select_option('section select >> nth=0','OH'); rows=pg.query_selector_all('section table')[0].query_selector_all('tbody tr')
    chk('filtro por posición',0<len(rows)<n_all and all(r.query_selector_all('td')[1].inner_text()=='OH' for r in rows),f'{n_all} -> {len(rows)}')
    pg.select_option('section select >> nth=0','ALL'); pg.select_option('section select >> nth=1','edad'); ages=[int(r.query_selector_all('td')[2].inner_text()) for r in pg.query_selector_all('section table')[0].query_selector_all('tbody tr')]
    chk('orden por edad (menor primero)',ages==sorted(ages),ages[:6])
    pg.select_option('section select >> nth=1','precio'); pr=[int(re.sub(r'[^\d]','',r.query_selector_all('td')[-2].inner_text())) for r in pg.query_selector_all('section table')[0].query_selector_all('tbody tr')]
    chk('orden por precio (mayor primero)',pr==sorted(pr,reverse=True))
    pg.check('section input[type=checkbox]'); pr2=[int(re.sub(r'[^\d]','',r.query_selector_all('td')[-2].inner_text())) for r in pg.query_selector_all('section table')[0].query_selector_all('tbody tr')]
    bud=int(re.sub(r'[^\d]','',re.search(r'\$ ([\d\.]+)',pg.inner_text('h1')).group(1)))
    chk('solo los que puedo pagar',all(x<=bud for x in pr2) and len(pr2)<=len(pr),f'{len(pr)} -> {len(pr2)} (presupuesto {bud})')
    # --- resumen del partido
    pg.click('nav >> text=Liga'); pg.click('button:has-text("Jugar mi partido")'); pg.click('button:has-text("Partido completo")'); sm=pg.inner_text('.notice')
    chk('resumen con equipos, parciales y mejor jugador','Resumen' in sm and 'Mejor jugador del partido' in sm and re.search(r'\(\d+-\d+',sm) is not None,sm.split('Mejor jugador del partido:')[1][:70].replace('\n',' ') if 'Mejor jugador' in sm else '')
    pg.click('button:has-text("Cerrar jornada")')
    # --- autoguardado
    pg.wait_for_timeout(700); pg.reload(); pg.wait_for_selector('h1'); pg.wait_for_timeout(300)
    chk('al reabrir ofrece continuar la partida automática',pg.query_selector('.notice[role=alert]') is not None and '1 jornadas jugadas' in pg.inner_text('.notice[role=alert]'),pg.inner_text('.notice[role=alert]')[:80])
    chk('mientras se decide, la partida nueva está en la jornada 1','jornada 1/14' in pg.inner_text('h1'))
    pg.click('.notice[role=alert] button:has-text("Continuar")'); pg.wait_for_timeout(200)
    chk('continuar restaura la jornada 2','jornada 2/14' in pg.inner_text('h1'),pg.inner_text('h1')[:80]); chk('el banner desaparece',pg.query_selector('.notice[role=alert]') is None)
    pg.click('button:has-text("Simular jornada")'); pg.wait_for_timeout(700); pg.reload(); pg.wait_for_selector('h1'); pg.wait_for_timeout(300)
    chk('tras seguir jugando, el autoguardado se actualizó (2 jornadas jugadas)','2 jornadas jugadas' in pg.inner_text('.notice[role=alert]'),pg.inner_text('.notice[role=alert]')[:70])
    pg.click('.notice[role=alert] button:has-text("Empezar de cero")'); pg.wait_for_timeout(700); pg.reload(); pg.wait_for_selector('h1'); pg.wait_for_timeout(300)
    chk('empezar de cero reemplaza el autoguardado (0 jornadas jugadas)','0 jornadas jugadas' in pg.inner_text('.notice[role=alert]'),pg.inner_text('.notice[role=alert]')[:70])
    pg.click('nav >> text=Guardar'); chk('la pestaña Guardar muestra el autoguardado','Autoguardado:' in pg.inner_text('main'))
    pg.click('nav >> text=Acerca de'); ac=pg.inner_text('main')
    chk('Acerca de: fuentes, licencias y siglas',all(s in ac for s in ['CC0','CC BY 4.0','PlusLiga','Diseño del juego','Efic','Siglas']),'')
    resp=pg.goto(URL.replace('volley-manager.html','crash.html'))
    if resp and resp.status==404: print('   (se omite la prueba del manejo de errores: falta dist/crash.html, ver README)')
    else:
        pg.wait_for_selector('h1')
        chk('ErrorBoundary: muestra el error en lugar de una pantalla en blanco','Algo salió mal' in pg.inner_text('main') and 'error de prueba' in pg.inner_text('main') and pg.query_selector('button:has-text("Recargar")') is not None)
    pg.screenshot(path='dist/shot_t4.png'); b.close()
errs=[e for e in errs if 'error de prueba' not in e and 'Boundary' not in e and 'The above error occurred' not in e and '404' not in e]
print('errores de consola:',errs or 'ninguno'); print(f'RESULTADO: {sum(res)}/{len(res)}')
