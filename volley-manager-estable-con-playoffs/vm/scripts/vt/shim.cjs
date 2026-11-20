// Ejecutor mínimo compatible con la parte de Vitest que usan las pruebas del proyecto.
const assert=require('assert');const suites=[];let cur=null;
const norm=(a)=>JSON.parse(JSON.stringify(a,(k,v)=>v===undefined?null:v));
function expect(actual,msg){const m=(f)=>{try{f()}catch(e){e.message=(msg?msg+' :: ':'')+e.message;throw e}};
 const mk=(neg)=>({
  toBe:(e)=>m(()=>neg?assert.notStrictEqual(actual,e):assert.strictEqual(actual,e)),
  toEqual:(e)=>m(()=>neg?assert.notDeepStrictEqual(norm(actual),norm(e)):assert.deepStrictEqual(norm(actual),norm(e))),
  toBeGreaterThan:(e)=>m(()=>assert.ok(actual>e,`${actual} no es > ${e}`)),
  toBeGreaterThanOrEqual:(e)=>m(()=>assert.ok(actual>=e,`${actual} no es >= ${e}`)),
  toBeLessThan:(e)=>m(()=>assert.ok(actual<e,`${actual} no es < ${e}`)),
  toBeLessThanOrEqual:(e)=>m(()=>assert.ok(actual<=e,`${actual} no es <= ${e}`)),
  toBeNull:()=>m(()=>assert.strictEqual(actual,null)),
  toBeTruthy:()=>m(()=>assert.ok(actual)),
  toMatch:(r)=>m(()=>assert.match(String(actual),r)),
  toContain:(e)=>m(()=>assert.ok(neg?!(typeof actual==='string'?actual.includes(e):[...actual].includes(e)):(typeof actual==='string'?actual.includes(e):[...actual].includes(e)),'toContain falló')),
  toThrow:(r)=>m(()=>{let thrown=null;try{actual()}catch(e){thrown=e}assert.ok(thrown,'no lanzó error');if(r instanceof RegExp)assert.match(thrown.message,r);else if(typeof r==='function')assert.ok(thrown instanceof r,'tipo de error distinto')}),
 });
 const o=mk(false);o.not=mk(true);return o}
function describe(n,f){const s={n,tests:[]};suites.push(s);const p=cur;cur=s;f();cur=p}
function it(n,f,t){if(!cur){cur={n:'(sin grupo)',tests:[]};suites.push(cur)}cur.tests.push({n,f,t})}
async function run(){let ok=0,bad=0;const t0=Date.now();for(const s of suites){console.log('\n'+s.n);for(const t of s.tests){const a=Date.now();try{await t.f();ok++;console.log('  OK  '+t.n+' ('+((Date.now()-a)/1000).toFixed(1)+'s)')}catch(e){bad++;console.log('  XX  '+t.n+'\n      '+String(e.message).split('\n')[0].slice(0,300))}}}
 console.log(`\nPRUEBAS: ${ok} OK, ${bad} con fallo (${((Date.now()-t0)/1000).toFixed(0)} s)`);process.exit(bad?1:0)}
module.exports={describe,it,expect,run};
