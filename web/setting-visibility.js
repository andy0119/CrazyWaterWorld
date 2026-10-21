function fieldVisible(field,section,values){
 const path=field.source_path||'';
 for(const master of section.fields){
  if(master.key===field.key||master.type!=='bool'||!master.label.includes('总开关'))continue;
  const scope=(master.source_path||'').replace(/\.enabled$/,'');if(!scope||scope===master.source_path)continue;
  // Main-stage challenges and AFK collection have independent switches.
  if(scope==='battle.stage'&&path.startsWith('battle.stage.afk.'))continue;
  if(path.startsWith(scope+'.')&&values[master.key]!==true)return false;
 }return true;
}
