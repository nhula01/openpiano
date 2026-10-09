'use strict';
(()=>{
const NS='http://www.w3.org/2000/svg';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
function svg(tag,attrs){const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;}
class ScoreView{
 constructor(host,root){this.host=host;host.addEventListener('click',e=>{const mark=e.target.closest?.('.addon-mark');if(mark){e.stopPropagation();this.onMark?.(mark.dataset.id,mark.getBoundingClientRect());return;}const note=e.target.closest('.score-note');if(note){const detail={beat:Number(note.dataset.beat),midi:Number(note.dataset.midi)};if(host.dataset.annotate==='1'&&this.onAnnotate){this.onAnnotate(detail,note.getBoundingClientRect());return;}this.onNote?.(detail);this.onSeek?.(detail.beat);}});host.addEventListener('pointerdown',e=>{if(!e.target.closest('.fixed-playhead'))return;e.preventDefault();const origin=e.clientX,beat=this.lastBeat??0,start=this.position(beat).globalX;host.setPointerCapture(e.pointerId);const move=ev=>{const x=start+(ev.clientX-origin)/this.scale;const a=this.anchors||[];let found=a.at(-1)?.[0]??beat;for(let i=0;i<a.length-1;i++)if(x<=a[i+1][1]){found=a[i][0]+Math.max(0,(x-a[i][1])/(a[i+1][1]-a[i][1]))*(a[i+1][0]-a[i][0]);break;}this.onSeek?.(found);};const end=()=>{host.removeEventListener('pointermove',move);host.removeEventListener('pointerup',end);host.removeEventListener('pointercancel',end);};host.addEventListener('pointermove',move);host.addEventListener('pointerup',end);host.addEventListener('pointercancel',end);});this.mode='sheet';this.page=-1;this.system=-1;this.scale=9;this.details=el('details',undefined,'original-sheet');this.details.open=true;this.details.append(this.summary=el('summary','Original sheet music · four pages'));const nav=el('div',undefined,'actions');this.originalImage=el('img');this.originalImage.alt='The Entertainer, original score, page 1';this.originalImage.loading='lazy';this.originalNav=nav;this.details.append(nav,this.originalImage);root.insertBefore(this.details,host);this.keyboard=svg('svg',{viewBox:'0 0 1040 125',role:'img','aria-label':'Piano keyboard. Right hand blue, left hand rose.'});this.keyboard.classList.add('practice-keyboard');root.insertBefore(this.keyboard,host.nextSibling);this.keys=new Map();let whites=0;const black=[];for(let n=21;n<=108;n++){if([1,3,6,8,10].includes(n%12)){black.push([n,whites*20-6]);continue;}const rect=svg('rect',{x:whites*20,y:0,width:20,height:118,fill:'#fff',stroke:'#a5aaa3','data-pitch':n});this.keyboard.append(rect);this.keys.set(n,rect);whites++;}for(const[n,x]of black){const rect=svg('rect',{x,y:0,width:12,height:74,fill:'#303e38','data-pitch':n});this.keyboard.append(rect);this.keys.set(n,rect);} }
 setFingering(enabled){this.fingered=enabled&&this.score?.id==='entertainer';this.showFingering=enabled;this.summary.textContent=this.fingered?'Roger Galloway’s fingered sheet · four pages':`${this.score?.title||'Original'} · source sheet`;this.showOriginal(this.originalPage||1);}
 selectAddon(anchor){this.addonAnchor=anchor||null;}
 // Add-on marks: fingering numbers and comment bubbles drawn beside engraved notes. They are sized from the
 // notehead, so they fit any engraving, and live inside the score drawing, so they move with every view.
 setAddonMarks(marks){this.addonMarks=marks||[];this.marksKey=JSON.stringify(this.addonMarks.map(m=>[m.id,m.beat,m.midi,m.kind,m.fingers,m.source,!!m.body]));this.drawnMarksKey=null;this.drawMarks();}
 drawMarks(){const host=this.host;if(!host)return;const existing=host.querySelector('.addon-mark');if(existing&&this.drawnMarksKey===this.marksKey)return;
  for(const old of host.querySelectorAll('.addon-mark'))old.remove();this.drawnMarksKey=this.marksKey;if(!this.addonMarks?.length)return;
  const notes=[...host.querySelectorAll('.score-note')],find=(beat,midi)=>notes.find(n=>Number(n.dataset.midi)===midi&&Math.abs(Number(n.dataset.beat)-beat)<.002);
  const byNote=new Map();for(const m of this.addonMarks){const k=m.beat.toFixed(3)+':'+m.midi;(byNote.get(k)||byNote.set(k,[]).get(k)).push(m);}
  for(const group of byNote.values()){const note=find(group[0].beat,group[0].midi);if(!note||typeof note.getBBox!=='function')continue;let bb;try{bb=note.getBBox();}catch{continue;}if(!bb||!bb.height)continue;
   const head=Math.min(bb.height,bb.width||bb.height)||bb.height,size=head*1.55,cx=bb.x+bb.width/2,below=group[0].hand==='LH';let offset=0;
   for(const m of group.sort((a,b)=>(a.kind==='fingering'?0:1)-(b.kind==='fingering'?0:1))){
    const g=svg('g',{class:`addon-mark addon-${m.kind} addon-${m.source}`,'data-id':m.id,transform:note.getAttribute('transform')||''});const t=svg('title',{});t.textContent=(m.author?m.author+': ':'')+(m.kind==='fingering'?'fingering '+m.fingers+(m.body?' · '+m.body:''):m.body);g.append(t);
    if(m.kind==='fingering'&&m.fingers){const y=below?bb.y+bb.height+size*1.05+offset:bb.y-size*.35-offset;const text=svg('text',{x:cx,y,'text-anchor':'middle','font-size':size,'font-weight':700,class:'addon-digit','paint-order':'stroke','stroke-width':size*.22,'stroke-linejoin':'round'});text.textContent=m.fingers;g.append(text);offset+=size*1.05;}
    else{const w=size*1.5,h=size*1.15,x=bb.x+bb.width+head*.15,y=bb.y-h-head*.4-(below?0:offset);const bubble=svg('path',{class:'addon-bubble',d:`M${x} ${y+h*.25}q0 ${-h*.25} ${h*.25} ${-h*.25}h${w-h*.5}q${h*.25} 0 ${h*.25} ${h*.25}v${h*.5}q0 ${h*.25} ${-h*.25} ${h*.25}h${-(w-h*.5)*.55}l${-h*.35} ${h*.38}v${-h*.38}h${-h*.1}q${-h*.25} 0 ${-h*.25} ${-h*.25}z`});const dots=svg('text',{x:x+w/2,y:y+h*.72,'text-anchor':'middle','font-size':size*.8,'font-weight':700,class:'addon-bubble-text'});dots.textContent='…';g.append(bubble,dots);}
    note.parentNode.insertBefore(g,note.nextSibling);}}}
 showOriginal(page){this.originalPage=page;if(this.score?.imported){if(!this.score.originalAsset)return;this.originalImage.hidden=this.score.originalAsset.type==='application/pdf';if(!this.originalPDF){this.originalPDF=el('iframe');this.originalPDF.className='import-source-pdf';this.originalPDF.title='Your original sheet PDF';this.originalPDF.setAttribute('sandbox','');this.details.append(this.originalPDF);}this.originalPDF.hidden=this.score.originalAsset.type!=='application/pdf';if(this.originalPDF.hidden)this.originalImage.src=this.score.originalAsset.url;else this.originalPDF.src=this.score.originalAsset.url;this.originalImage.alt='Your attached original sheet';return;}this.originalImage.hidden=false;if(this.originalPDF)this.originalPDF.hidden=true;const folder=this.score?.folder||'scores/entertainer';this.originalImage.src=`${folder}/${this.fingered?'fingered':'original'}/page-${page}.jpg`;this.originalImage.alt=`${this.score?.title||'The Entertainer'} source score, page ${page}`;}
 setScore(score){this.score=score;this.data=score.engraving||(score.id==='entertainer'?window.PianoEngraving:null);this.available=!!this.data;{const first=this.data?.systems?.[0],box=first?.svg?.match(/viewBox="[-\d.]+ [-\d.]+ [-\d.]+ ([-\d.]+)"/),ratio=box&&first.height?Number(box[1])/first.height:1;this.unitScale=Math.pow(10,Math.round(Math.log10(ratio||1)));}this.details.hidden=!this.available||(score.imported&&!score.originalAsset)||(!score.imported&&score.originalPages===0);this.keyboard.hidden=!this.available;this.page=-1;this.system=-1;this.anchors=null;this.followSystem=null;this.originalPage=1;this.originalNav.replaceChildren();if(this.available&&this.details.hidden)this.scale=Math.min(9,195/Math.max(...this.data.systems.map(s=>s.staffGap||20)));if(this.available&&!this.details.hidden){this.scale=Math.min(9,195/Math.max(...this.data.systems.map(s=>s.staffGap||20)));for(let i=1;i<=(score.originalPages||4);i++){const button=el('button','Page '+i,'secondary');button.onclick=()=>this.showOriginal(i);this.originalNav.append(button);}this.showOriginal(1);}}
 setMode(mode){if(this.mode!==mode){this.mode=mode;this.followSystem=null;this.page=-1;this.system=-1;this.host.replaceChildren();}}
 pageFor(beat){const data=this.data;for(let i=data.pages.length-1;i>=0;i--)if(beat>=data.pages[i].start)return i;return 0;}
 position(beat){const data=this.data||window.PianoEngraving;let i=data.systems.findIndex(s=>beat>=s.start&&beat<s.end);if(i<0)i=beat<data.systems[0].start?0:data.systems.length-1;
 const anchors=this.anchors||(this.anchors=data.systems.flatMap((s,index)=>s.positions.map(([b,x])=>[b,data.systems.slice(0,index).reduce((sum,s)=>sum+s.width,0)+x])));let a=anchors[0],b=anchors[1];for(let j=0;j<anchors.length-1;j++){if(beat>=anchors[j][0]){a=anchors[j];b=anchors[j+1];}if(beat<b[0])break;}if(beat>=anchors.at(-1)[0]){a=anchors.at(-1);b=[a[0]+1,a[1]+6];}const fraction=(beat-a[0])/Math.max(.001,b[0]-a[0]);return {system:i,globalX:a[1]+fraction*(b[1]-a[1])};
 }
 // Even speed through each bar: the bar lines follow the engraving, the notes inside a bar do not tug the strip.
 barX(beat){const m=this.score?.beatsPerMeasure||4,b=Math.floor(beat/m+1e-9)*m,x0=this.position(b).globalX,x1=this.position(b+m).globalX;return x0+(beat-b)/m*(x1-x0);}
 // Ease toward a moving target; snap after a seek, a pause or a big jump.
 ease(current,target,dt,tau,far){return current==null||dt>.25||Math.abs(target-current)>far?target:current+(target-current)*(1-Math.exp(-dt/tau));}
 // One continuous line: every system laid side by side once, so nothing is redrawn at a line change.
 scrollStrip(at,where,dt){const data=this.data;
  if(!this.strip||!this.host.contains(this.strip)||this.stripData!==data||this.stripScale!==this.scale){this.labelsStamp=null;this.host.replaceChildren();this.host.className='live-score scrolling-score';this.strip=el('div',undefined,'scroll-strip');
   for(const sys of data.systems){const panel=el('div',undefined,'scroll-system');panel.innerHTML=sys.svg;panel.style.width=(sys.width*this.scale)+'px';const drawing=panel.querySelector('svg');if(drawing){drawing.style.height=(sys.height*this.scale)+'px';drawing.style.position='absolute';drawing.style.top=(90-sys.staffTop*this.scale)+'px';drawing.setAttribute('preserveAspectRatio','xMinYMin meet');}this.strip.append(panel);}
   this.host.append(this.strip,el('div',undefined,'fixed-playhead'));this.stripData=data;this.stripScale=this.scale;this.stripBegin=0;this.smoothX=null;}
  this.system='strip';const width=this.host.clientWidth||800;
  this.smoothX=this.ease(this.smoothX,this.barX(at)*this.scale,dt,.12,width*.6);
  this.strip.style.transform=`translateX(${Math.min(180,width*.25)-this.smoothX}px)`;return data.systems[where.system].page;}
 // Full sheet: every page stacked in one column. The page glides up as you play through a line, so the
 // next line reaches the reading position exactly as you reach it; the playhead slides between notes.
 stackedSheet(at,where,dt){const data=this.data,host=this.host;
  if(this.stackData!==data||!host.querySelector('.sheet-page')){this.labelsStamp=null;host.innerHTML=data.pages.map((p,i)=>`<div class="sheet-page" data-page="${i}">${p.svg}</div>`).join('');host.className='live-score engraved-sheet stacked-sheet';this.stackData=data;this.smoothTop=null;}
  this.page='stack';this.system='stack';const hostBox=host.getBoundingClientRect(),unit=this.unitScale||1;
  const place=i=>{const sys=data.systems[i],div=host.querySelector(`.sheet-page[data-page="${sys.page}"]`),drawing=div?.querySelector('svg');if(!drawing)return null;const frame=drawing.viewBox?.baseVal?.width?drawing:(drawing.querySelector('svg[viewBox]')||drawing),box=frame.getBoundingClientRect(),units=frame.viewBox?.baseVal,scale=units?.width?box.width/units.width*unit:0;return {div,top:box.top-hostBox.top+host.scrollTop+(sys.y-(units?.y||0)/unit)*scale,height:sys.height*scale};};
  // Fit two full lines in the window: narrow the pages when the window is short (never below 560 px).
  if(this.stackFitH!==host.clientHeight&&host.clientHeight>0){this.stackFitH=host.clientHeight;host.style.removeProperty('--page-max');const gaps=[];for(let k=0;k+1<data.systems.length&&gaps.length<12;k++){const a=place(k),b=place(k+1);if(a&&b&&b.div===a.div&&b.top>a.top)gaps.push([b.top-a.top,a.height]);}
   if(gaps.length){gaps.sort((x,y)=>x[0]-y[0]);const [step,h]=gaps[Math.floor(gaps.length/2)],w=host.querySelector('.sheet-page')?.clientWidth||1000,fit=(host.clientHeight-20)/(step+h);host.style.setProperty('--page-max',Math.max(560,Math.min(1000,Math.floor(w*Math.min(1,fit))))+'px');}}
  const i=where.system,sys=data.systems[i],cur=place(i);if(!cur)return sys.page;
  // Keep the line you are playing at the top with the next line fully readable below it; at each new line the
  // page glides up (about half a second) instead of jumping.
  const now=(typeof performance!=='undefined'?performance.now():Date.now())/1000,target=Math.max(0,cur.top-10),aim=this.glide?.to??this.smoothTop;
  if(this.smoothTop==null||dt>.25||Math.abs(target-aim)>host.clientHeight*1.5){this.glide=null;this.smoothTop=target;}
  else if(Math.abs(target-aim)>1)this.glide={from:this.smoothTop,to:target,t0:now};
  if(this.glide){const k=Math.min(1,(now-this.glide.t0)/.6),e=k<.5?2*k*k:1-Math.pow(2-2*k,2)/2;this.smoothTop=this.glide.from+(this.glide.to-this.glide.from)*e;if(k>=1)this.glide=null;}
  host.scrollTop=this.smoothTop;
  let line=host.querySelector('.normal-playhead');if(!line){line=el('div',undefined,'normal-playhead');host.append(line);}
  const notes=[...cur.div.querySelectorAll('.score-note')].map(n=>[Number(n.dataset.beat),n]).filter(([b])=>b>=sys.start-.001&&b<sys.end-.001).sort((a,b)=>a[0]-b[0]);
  let a=null,b=null;for(const n of notes){if(n[0]<=at+1e-6)a=n;else{b=n;break;}}a=a||notes[0];
  if(a){const xa=a[1].getBoundingClientRect().left,xb=b?b[1].getBoundingClientRect().left:xa,f=b?Math.max(0,Math.min(1,(at-a[0])/Math.max(.001,b[0]-a[0]))):0;line.style.left=(xa+f*(xb-xa)-hostBox.left+host.scrollLeft)+'px';}
  line.style.top=cur.top+'px';line.style.height=cur.height+'px';return sys.page;}
 update({events,matcher,fingers,hintsRight,hintsLeft,page=null,beat=null,timed=null,demo=false}){if(!this.available)return false;const data=this.data;const current=events[Math.min(matcher.index,events.length-1)],at=beat??current.beat;this.lastBeat=at;const where=this.position(at);let activePage;
 const now=(typeof performance!=='undefined'?performance.now():Date.now())/1000,dt=this.lastTime==null?1:now-this.lastTime;this.lastTime=now;
 const stacked=this.mode==='sheet'&&this.host.dataset?.stacked==='1';
 if(stacked)activePage=this.stackedSheet(at,where,dt);
 else if(this.mode==='sheet'){activePage=page??this.pageFor(at);if(this.page!==activePage){this.labelsStamp=null;this.host.innerHTML=data.pages[activePage].svg;this.page=activePage;this.host.className='live-score engraved-sheet';}this.host.querySelector('svg').setAttribute('aria-label',`${this.score.title} interactive score, page ${activePage+1} of ${data.pages.length}`);}
 else activePage=this.scrollStrip(at,where,dt);
 if(this.mode==='sheet'&&!stacked){
 const system=data.systems[where.system],hostBox=this.host.getBoundingClientRect();
 // Map score units to the page drawing. Verovio pages draw inside a nested <svg viewBox>, and store
 // geometry in hundredths of its units; LilyPond pages use the outer viewBox units directly.
 const drawing=this.host.querySelector('svg'),frame=drawing.viewBox.baseVal?.width?drawing:(drawing.querySelector('svg[viewBox]')||drawing);
 const box=frame.getBoundingClientRect(),units=frame.viewBox.baseVal,unit=this.unitScale||1,scale=units?.width?box.width/units.width*unit:0;
 const top=box.top-hostBox.top+this.host.scrollTop+(system.y-(units?.y||0)/unit)*scale;
 let line=this.host.querySelector('.normal-playhead');if(!line){line=el('div',undefined,'normal-playhead');this.host.append(line);}
 const notes=[...this.host.querySelectorAll('.score-note')];
 const chosen=notes.reduce((best,n)=>!best||Math.abs(Number(n.dataset.beat)-at)<Math.abs(Number(best.dataset.beat)-at)?n:best,null);
 if(chosen)line.style.left=(chosen.getBoundingClientRect().left-hostBox.left+this.host.scrollLeft)+'px';
 line.style.top=top+'px';line.style.height=(system.height*scale)+'px';
 // Follow a staff system once; melody pitch and switching hands must not move the page.
 const stamp=activePage+':'+where.system;
 if(this.followSystem!==stamp&&scale>0){this.followSystem=stamp;const bottom=top+system.height*scale;
 if(top<this.host.scrollTop+16||bottom>this.host.scrollTop+this.host.clientHeight-16)
 this.host.scrollTop=Math.max(0,top-24);}
 }

 for(const printed of this.host.querySelectorAll('.source-fingering'))printed.style.display=fingers?'':'none';
 const currentBeat=current.beat;if(this.events!==events){this.keyStamp=null;this.events=events;this.eventAt=new Map(events.map((e,i)=>[e.beat,i]));this.labelsStamp=null;}const eventAt=this.eventAt;for(const note of this.host.querySelectorAll('.score-note')){const b=Number(note.dataset.beat),m=Number(note.dataset.midi),i=eventAt.get(b);let color='#303e38';if(demo){if(b<=at)color=b>=at-.3?'#4d8b73':'#98a497';}else if(timed&&i!==undefined){color=timed.states[i]==='hit'?'#438658':timed.states[i]==='missed'?'#b95742':Math.abs(b-at)<.2?'#ad753c':'#303e38';}else if(b<currentBeat||matcher.index>=events.length)color='#438658';else if(b===currentBeat)color=matcher.held.has(m)?'#438658':'#bd7433';const inPart=b>=events[0].beat&&b<=events.at(-1).beat+events.at(-1).duration;const selected=i===undefined||events[i].notes.includes(m);if(!inPart||!selected||i<matcher.startIndex)color='#aeb5ab';if(note.dataset.practiceColor!==color){note.style.color=color;note.dataset.practiceColor=color;}note.classList.toggle('addon-note',!!this.addonAnchor&&Math.abs(b-Number(this.addonAnchor.beat))<.001&&m===Number(this.addonAnchor.midi));}
 this.drawMarks();
 // Finger labels are an optional overlay; the engraved notation remains intact.
 const stamp=`${this.page}:${this.system}:${fingers}`;if(this.labelsStamp!==stamp){this.labelsStamp=stamp;for(const old of this.host.querySelectorAll('.finger-overlay'))old.remove();if(fingers){for(const note of this.host.querySelectorAll('.score-note')){const i=eventAt.get(Number(note.dataset.beat)),m=Number(note.dataset.midi);if(i===undefined)continue;const r=hintsRight[i]?.fingers[m],l=hintsLeft[i]?.fingers[m];if(!r&&!l)continue;const transform=note.querySelector('g')?.getAttribute('transform');if(!transform)continue;const label=svg('text',{transform,x:1.1,y:r?-2.4:2.8,'font-size':1.35,'font-weight':600,fill:'#303e38',class:'finger-overlay'});label.textContent=[r||'',l||''].filter(Boolean).join('/');note.parentNode.append(label);}}}

 const target=(demo||timed)?events.filter(e=>e.beat<=at&&e.beat+e.duration>at):[current];for(const[n,key]of this.keys){const member=target.flatMap(e=>e.members.filter(m=>e.notes.includes(m.midi))).find(m=>m.midi===n);const pressed=matcher.held.has(n);key.setAttribute('fill',member?(member.hand==='left'?'#c6889f':'#759dc8'):pressed?'#78ac83':[1,3,6,8,10].includes(n%12)?'#303e38':'#fff');}return {page:activePage,pages:data.pages.length};
 }
}
window.PianoScoreView=ScoreView;
})();
