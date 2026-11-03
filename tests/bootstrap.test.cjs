const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const bootstrap=require('../bootstrap.cjs');
const defaults=path.resolve(__dirname,'..');
function fixture(t, settings='module.exports={};'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'servorack-bootstrap-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const data=path.join(root,'data'),base=path.join(root,'settings.js');
 fs.writeFileSync(base,settings);return {root,data,base};
}
test('fresh install seeds the dashboard and persistent context; restart preserves edits',t=>{
 const {data,base}=fixture(t);bootstrap(data,defaults,base);
 const file=path.join(data,'flows.json'),settings=path.join(data,'settings.js');
 const flows=JSON.parse(fs.readFileSync(file));
 assert.ok(flows.some(n=>n.id==='sr-dashboard-template'));
 delete require.cache[require.resolve(settings)];
 assert.equal(require(settings).contextStorage.servorack.module,'localfilesystem');
 const original=fs.readFileSync(settings,'utf8');fs.writeFileSync(file,'[]');
 bootstrap(data,defaults,base);assert.equal(fs.readFileSync(file,'utf8'),'[]');
 assert.equal(fs.readFileSync(settings,'utf8'),original);
});
test('existing custom flows and context settings are preserved',t=>{
 const {data,base}=fixture(t,"module.exports={flowFile:'custom.json',contextStorage:{default:'mine',mine:{module:'memory'},servorack:{module:'memory'}}};");
 fs.mkdirSync(data);fs.copyFileSync(base,path.join(data,'settings.js'));
 fs.writeFileSync(path.join(data,'custom.json'),'[{"id":"existing"}]');
 const before=fs.readFileSync(path.join(data,'settings.js'),'utf8');
 bootstrap(data,defaults,base);
 assert.equal(fs.readFileSync(path.join(data,'custom.json'),'utf8'),'[{"id":"existing"}]');
 assert.equal(fs.readFileSync(path.join(data,'settings.js'),'utf8'),before);
 assert.equal(fs.existsSync(path.join(data,'flows.json')),false);
});
test('FLOWS override selects the initial destination',t=>{
 const {data,base}=fixture(t);bootstrap(data,defaults,base,'other.json');
 assert.ok(JSON.parse(fs.readFileSync(path.join(data,'other.json'))).length);
 assert.equal(fs.existsSync(path.join(data,'flows.json')),false);
});
