function extraField(holder,f){
 const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e};
 const btn=(text,fn)=>{const b=make('button',text);b.type='button';b.onclick=fn;return b};
 const num=(v,label,fn)=>{const n=make('input');n.type='number';n.min=0;n.max=1000000000;n.value=v;n.setAttribute('aria-label',label);n.oninput=()=>{fn(Number(n.value));change()};return n};
 if(f.type==='text'&&/Quality$/.test(f.source_path||'')){const select=make('select');select.id=f.key;for(const value of ['', '普通','优秀','稀有','史诗','传说','超凡']){const o=make('option',value||'不限制');o.value=value;select.appendChild(o)}if(values[f.key]&&!['普通','优秀','稀有','史诗','传说','超凡'].includes(values[f.key])){const o=make('option',values[f.key]);o.value=values[f.key];select.appendChild(o)}select.value=values[f.key];select.onchange=()=>{values[f.key]=select.value;change()};holder.appendChild(select);return true}
 if(f.type==='numbers'){const row=make('div');row.className='numeric-list';values[f.key].forEach((v,i)=>row.appendChild(num(v,f.label+' '+(i+1),n=>values[f.key][i]=n)));holder.appendChild(row);return true}
 if(f.type==='time'){const n=make('input');n.type='time';n.id=f.key;n.value=values[f.key];n.onchange=()=>{values[f.key]=n.value;change()};holder.appendChild(n);return true}
 if(f.type==='times'){const row=make('div');row.className='numeric-list';values[f.key].forEach((v,i)=>{const n=make('input');n.type='time';n.value=v;n.setAttribute('aria-label',f.label+' '+(i+1));n.onchange=()=>{values[f.key][i]=n.value;change()};row.appendChild(n)});holder.appendChild(row);return true}
 if(f.type==='map'){
  const table=make('div');table.className='stock-table';holder.appendChild(table);
  function paint(){table.replaceChildren();for(const [name,value] of Object.entries(values[f.key])){const row=make('div');row.className='stock-row';row.appendChild(make('span',name));row.appendChild(num(value,name+'保留数量',n=>values[f.key][name]=n));row.appendChild(btn('删除',()=>{delete values[f.key][name];change();paint()}));table.appendChild(row)}const row=make('div');row.className='stock-row';const name=make('input');name.placeholder='材料名称';name.maxLength=100;name.setAttribute('aria-label',f.label+'材料名称');row.appendChild(name);row.appendChild(btn('添加',()=>{const n=name.value.trim();if(n&&!Object.hasOwn(values[f.key],n)&&Object.keys(values[f.key]).length<100){values[f.key][n]=0;change();paint()}}));table.appendChild(row)}paint();return true;
 }
 if(f.type==='list'){
  const area=make('div');area.className='tag-editor';holder.appendChild(area);
  function paint(){area.replaceChildren();for(const [i,v] of values[f.key].entries()){const tag=make('span');tag.className='tag';tag.appendChild(make('span',v||'未设置'));tag.appendChild(btn('×',()=>{values[f.key].splice(i,1);change();paint()}));area.appendChild(tag)}const input=make('input');input.type='text';input.placeholder=f.placeholder||'选择或输入，按 Enter 添加';input.setAttribute('aria-label',f.label);input.maxLength=100;
   const add=()=>{const entries=input.value.split(/[、,，\n]/).map(x=>x.trim()).filter(Boolean);for(const v of entries)if(!values[f.key].includes(v)&&values[f.key].length<100)values[f.key].push(v);if(entries.length){change();paint()}};
   input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add()}};input.onblur=add;area.appendChild(input);
   if(f.options){const select=make('select');select.setAttribute('aria-label',f.label+'可选项目');select.appendChild(make('option','请选择'));for(const value of f.options){const o=make('option',value);o.value=value;select.appendChild(o)}select.onchange=()=>{input.value=select.value;add()};area.appendChild(select)}
  }paint();holder.appendChild(make('small','可添加多项；未接入登入时，可选名单暂不载入。')).className='help';return true;
 }
 return false;
}
