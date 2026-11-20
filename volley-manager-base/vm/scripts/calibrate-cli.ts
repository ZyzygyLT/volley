// Uso: npx tsx scripts/calibrate-cli.ts [report|fit|extra|teamsd]   (necesita tsx y @types/node)
import { P } from '../src/engine/params';
import { fit, report, playerSpread, scoreDist, homeAdvantage } from '../src/engine/calibrate';

const MODE = process.argv[2] ?? 'report';
if (MODE === 'fit') {
  const p = fit(P, 50000, 16);
  console.log('PARAMS_JSON=' + JSON.stringify(p));
  console.log(report(p, 120000).text);
} else if (MODE === 'extra') {
  console.log('== DISPERSIÓN ENTRE JUGADORES (desv. típica real de la tasa) ==\n' + playerSpread(P));
  console.log('\n== MARCADORES EN UNA LIGA ==\n' + scoreDist(P));
} else if (MODE === 'home') {
  for (const b of [0, 0.4, 0.8, 1.2, 1.6]) { const r = homeAdvantage(P, b); console.log(`ventaja de local +${b}: gana el local ${(100 * r.win).toFixed(1)} % (PlusLiga 54,2 %), sets ${(100 * r.sets).toFixed(1)} % (53,4 %)`); }
} else if (MODE === 'teamsd') {
  for (const sd of [2.4, 3.0, 3.4]) console.log(scoreDist(P, 700, sd));
} else console.log(report(P, 120000).text);
