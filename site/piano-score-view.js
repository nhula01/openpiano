'use strict';
(()=>{
const NS='http://www.w3.org/2000/svg';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
function svg(tag,attrs){const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;}
class ScoreView{
 constructor(host,root){this.host=host;this.zooms=ScoreView.savedZooms();this.watch();host.addEventListener('click',e=>{// The playhead lies over the current note; a click on it still reaches the note or mark beneath.
 // (Dragging the playhead captures the pointer, so such a click arrives at the score itself.)
 const under=sel=>{const hit=e.target.closest?.(sel);if(hit)return hit;if(!e.target.closest?.('.fixed-playhead,.normal-playhead')&&e.target!==host)return null;for(const n of host.querySelectorAll(sel)){const r=n.getBoundingClientRect();if(e.clientX>=r.left-3&&e.clientX<=r.right+3&&e.clientY>=r.top-3&&e.clientY<=r.bottom+3)return n;}return null;};
 const mark=under('.addon-mark');if(mark){e.stopPropagation();this.onMark?.(mark.dataset.id,mark.getBoundingClientRect());return;}const note=under('.score-note');if(note){const detail={beat:Number(note.dataset.beat),midi:Number(note.dataset.midi)};if(host.dataset.annotate==='1'&&this.onAnnotate){this.onAnnotate(detail,note.getBoundingClientRect());return;}this.onNote?.(detail);this.onSeek?.(detail.beat);this.onPick?.(detail);}});host.addEventListener('pointerdown',e=>{if(!e.target.closest('.fixed-playhead'))return;e.preventDefault();const origin=e.clientX,beat=this.lastBeat??0,start=this.position(beat).globalX;host.setPointerCapture(e.pointerId);const move=ev=>{const x=start+(ev.clientX-origin)/this.scale;const a=this.anchors||[];let found=a.at(-1)?.[0]??beat;for(let i=0;i<a.length-1;i++)if(x<=a[i+1][1]){found=a[i][0]+Math.max(0,(x-a[i][1])/(a[i+1][1]-a[i][1]))*(a[i+1][0]-a[i][0]);break;}this.onSeek?.(found);};const end=()=>{host.removeEventListener('pointermove',move);host.removeEventListener('pointerup',end);host.removeEventListener('pointercancel',end);};host.addEventListener('pointermove',move);host.addEventListener('pointerup',end);host.addEventListener('pointercancel',end);});this.mode='sheet';this.page=-1;this.system=-1;this.scale=9;this.details=el('details',undefined,'original-sheet');this.details.open=true;this.details.append(this.summary=el('summary','Original sheet music · four pages'));const nav=el('div',undefined,'actions');this.originalImage=el('img');this.originalImage.alt='The Entertainer, original score, page 1';this.originalImage.loading='lazy';this.originalNav=nav;this.details.append(nav,this.originalImage);root.insertBefore(this.details,host);this.keyboard=svg('svg',{viewBox:'0 0 1040 125',role:'img','aria-label':'Piano keyboard. Right hand blue, left hand rose.'});this.keyboard.classList.add('practice-keyboard');root.insertBefore(this.keyboard,host.nextSibling);this.keys=new Map();let whites=0;const black=[];for(let n=21;n<=108;n++){if([1,3,6,8,10].includes(n%12)){black.push([n,whites*20-6]);continue;}const rect=svg('rect',{x:whites*20,y:0,width:20,height:118,fill:'#fff',stroke:'#a5aaa3','data-pitch':n});this.keyboard.append(rect);this.keys.set(n,rect);whites++;}for(const[n,x]of black){const rect=svg('rect',{x,y:0,width:12,height:74,fill:'#303e38','data-pitch':n});this.keyboard.append(rect);this.keys.set(n,rect);} }
 setFingering(enabled){this.fingered=enabled&&this.score?.id==='entertainer';this.showFingering=enabled;this.summary.textContent=this.fingered?'Roger Galloway’s fingered sheet · four pages':`${this.score?.title||'Original'} · source sheet`;this.showOriginal(this.originalPage||1);}
 selectAddon(anchor){this.addonAnchor=anchor||null;}
 // Add-on marks: fingering numbers and comment bubbles drawn beside engraved notes. They are sized from the
 // notehead, so they fit any engraving, and live inside the score drawing, so they move with every view.
 // Right hand above the notes, left hand below, a little clear of the noteheads. In a chord the numbers stack
 // beyond the outer note, read top to bottom like the notes; a comment sits at the notehead's upper or lower right.
 setAddonMarks(marks){this.addonMarks=marks||[];this.marksKey=JSON.stringify(this.addonMarks.map(m=>[m.id,m.beat,m.midi,m.kind,m.fingers,m.source,!!m.body]));this.drawnMarksKey=null;this.drawMarks();}
 drawMarks(){const host=this.host;if(!host)return;const existing=host.querySelector('.addon-mark');if(existing&&this.drawnMarksKey===this.marksKey)return;
  for(const old of host.querySelectorAll('.addon-mark'))old.remove();this.drawnMarksKey=this.marksKey;if(!this.addonMarks?.length)return;
  const box=n=>{if(typeof n.getBBox!=='function')return null;try{const b=n.getBBox();return b&&b.height?b:null;}catch{return null;}};
  const notes=[...host.querySelectorAll('.score-note')].map(n=>({n,beat:Number(n.dataset.beat),midi:Number(n.dataset.midi),parent:n.parentNode}));
  const placed=[];
  for(const m of this.addonMarks){const hit=notes.find(x=>x.midi===m.midi&&Math.abs(x.beat-m.beat)<.002);if(!hit)continue;const bb=hit.bb||(hit.bb=box(hit.n));if(!bb)continue;
   const above=m.hand==='LH'?false:m.hand==='RH'?true:m.midi>=60;placed.push({m,note:hit,bb,above});}
  if(!placed.length)return;
  // The chord a note belongs to: noteheads at the same beat in the same drawing, close together on one staff.
  const chordOf=p=>{if(p.chord)return p.chord;const head=p.bb.height,same=notes.filter(x=>x.parent===p.note.parent&&Math.abs(x.beat-p.note.beat)<.002).map(x=>({...x,bb:x.bb||(x.bb=box(x.n))})).filter(x=>x.bb).sort((a,b)=>a.bb.y-b.bb.y);
   let group=[],chord=null;for(const x of same){if(group.length&&x.bb.y-(group.at(-1).bb.y+group.at(-1).bb.height)>head*5){if(group.some(g=>g.n===p.note.n))chord=group;group=[];}group.push(x);}if(!chord)chord=group;
   const c={top:Math.min(...chord.map(x=>x.bb.y)),bottom:Math.max(...chord.map(x=>x.bb.y+x.bb.height)),key:p.note.beat.toFixed(3)+':'+chord[0].midi};for(const q of placed)if(chord.some(x=>x.n===q.note.n))q.chord=c;return c;};
  const columns=new Map();
  for(const p of placed){const c=chordOf(p),k=c.key+(p.above?'^':'v');(columns.get(k)||columns.set(k,{chord:c,above:p.above,items:[]}).get(k)).items.push(p);}
  for(const col of columns.values()){const head=Math.min(...col.items.map(p=>Math.min(p.bb.height,p.bb.width||p.bb.height))),size=head*.95,gap=head*.3,step=size*.95;
   // Fingering: highest note at the top of the column; the column starts just clear of the chord.
   const fingers=col.items.filter(p=>p.m.kind==='fingering'&&p.m.fingers).sort((a,b)=>b.m.midi-a.m.midi);
   fingers.forEach((p,i)=>{const n=fingers.length,y=col.above?col.chord.top-gap-(n-1-i)*step:col.chord.bottom+gap+size*.72+i*step;
    const g=this.markGroup(p,p.note.n);const cx=p.bb.x+p.bb.width/2,w=Math.max(size*.75,size*.6*p.m.fingers.length);
    g.append(svg('rect',{x:cx-w/2,y:y-size*.8,width:w,height:size,fill:'transparent',class:'addon-hit'}));
    const text=svg('text',{x:cx,y,'text-anchor':'middle','font-size':size,'font-weight':700,class:'addon-digit','paint-order':'stroke','stroke-width':size*.18,'stroke-linejoin':'round'});text.textContent=p.m.fingers;g.append(text);p.note.n.parentNode.insertBefore(g,p.note.n.nextSibling);});
   // Comments: a small bubble at the notehead's upper right (right hand) or lower right (left hand).
   for(const p of col.items.filter(p=>!(p.m.kind==='fingering'&&p.m.fingers))){const bh=size*.95,bw=bh*1.35,x=p.bb.x+p.bb.width+head*.15,y=col.above?p.bb.y-bh-head*.15:p.bb.y+p.bb.height+head*.15+bh*.38;
    const g=this.markGroup(p,p.note.n);const tail=col.above?`l${-bh*.32} ${bh*.36}v${-bh*.36}`:`v${-bh*.36}`;
    const d=col.above?`M${x} ${y+bh*.22}q0 ${-bh*.22} ${bh*.22} ${-bh*.22}h${bw-bh*.44}q${bh*.22} 0 ${bh*.22} ${bh*.22}v${bh*.56}q0 ${bh*.22} ${-bh*.22} ${bh*.22}h${-(bw-bh*.44)*.6}${tail}h${-bh*.1}q${-bh*.22} 0 ${-bh*.22} ${-bh*.22}z`
     :`M${x} ${y+bh*.22}q0 ${-bh*.22} ${bh*.22} ${-bh*.22}h${bh*.12}l${-bh*.34} ${-bh*.38}l${bh*.62} ${bh*.38}h${bw-bh*.84}q${bh*.22} 0 ${bh*.22} ${bh*.22}v${bh*.56}q0 ${bh*.22} ${-bh*.22} ${bh*.22}h${-(bw-bh*.44)}q${-bh*.22} 0 ${-bh*.22} ${-bh*.22}z`;
    g.append(svg('path',{class:'addon-bubble',d}));const dots=svg('text',{x:x+bw/2,y:y+bh*.68,'text-anchor':'middle','font-size':bh*.75,'font-weight':700,class:'addon-bubble-text'});dots.textContent='…';g.append(dots);p.note.n.parentNode.insertBefore(g,p.note.n.nextSibling);}}}
 markGroup({m},note){const g=svg('g',{class:`addon-mark addon-${m.kind} addon-${m.source}`,'data-id':m.id,transform:note.getAttribute('transform')||''});const t=svg('title',{});t.textContent=(m.author?m.author+': ':'')+(m.kind==='fingering'?'fingering '+m.fingers+(m.body?' · '+m.body:''):m.body);g.append(t);return g;}
 showOriginal(page){this.originalPage=page;if(this.score?.imported){if(!this.score.originalAsset)return;this.originalImage.hidden=this.score.originalAsset.type==='application/pdf';if(!this.originalPDF){this.originalPDF=el('iframe');this.originalPDF.className='import-source-pdf';this.originalPDF.title='Your original sheet PDF';this.originalPDF.setAttribute('sandbox','');this.details.append(this.originalPDF);}this.originalPDF.hidden=this.score.originalAsset.type!=='application/pdf';if(this.originalPDF.hidden)this.originalImage.src=this.score.originalAsset.url;else this.originalPDF.src=this.score.originalAsset.url;this.originalImage.alt='Your attached original sheet';return;}this.originalImage.hidden=false;if(this.originalPDF)this.originalPDF.hidden=true;const folder=this.score?.folder||'scores/entertainer';this.originalImage.src=`${folder}/${this.fingered?'fingered':'original'}/page-${page}.jpg`;this.originalImage.alt=`${this.score?.title||'The Entertainer'} source score, page ${page}`;}
 // The layout depends on the height of the score's window (Sheet, Both and Full sheet give it different
 // heights; so do resizing and turning a phone). Lay it out again whenever that changes, even while paused.
 watch(){const host=this.host;if(typeof ResizeObserver!=='undefined'){let queued=false;new ResizeObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;this.refresh();});}).observe(host);}
  // Pinch on a trackpad (or Ctrl + wheel) zooms the score rather than the page.
  host.addEventListener('wheel',e=>{if(!e.ctrlKey||!this.zoomKind())return;e.preventDefault();this.setZoom(this.zoomFor()*Math.exp(-e.deltaY*.01),true);},{passive:false});}
 refresh(){if(this.available&&this.lastUpdate)this.update(this.lastUpdate);}
 // Zoom: 100% fits every line of the piece in the window. The moving score and the full sheet keep their own zoom.
 zoomKind(){return this.mode==='sheet'?(this.host.dataset?.stacked==='1'?'full':null):'strip';}
 zoomFor(kind=this.zoomKind()){return this.zooms?.[kind]||1;}
 setZoom(z,gradual=false){const kind=this.zoomKind();if(!kind)return;z=Math.round(Math.min(ScoreView.ZOOM_MAX,Math.max(ScoreView.ZOOM_MIN,z))*100)/100;if(Math.abs(z-1)<.03)z=1;
  (this.zooms||={})[kind]=z;try{localStorage.setItem('openpiano.score-zoom',JSON.stringify(this.zooms));}catch{}this.zoomControls();
  clearTimeout(this.zoomTimer);if(gradual)this.zoomTimer=setTimeout(()=>this.refresh(),140);else this.refresh();}
 zoomControls(){const kind=this.zoomKind(),parent=this.host.parentElement;if(!parent)return;
  if(!this.zoomBar){const bar=el('div',undefined,'score-zoom');bar.setAttribute('role','group');bar.setAttribute('aria-label','Score zoom');
   const make=(text,label,step)=>{const b=el('button',text);b.type='button';b.title=label;b.setAttribute('aria-label',label);b.onclick=e=>{e.stopPropagation();this.setZoom(step?this.zoomFor()*step:1);};bar.append(b);return b;};
   make('−','Zoom out',1/1.15);this.zoomLabel=make('100%','Fit the window (100%)',0);make('+','Zoom in',1.15);this.zoomBar=bar;}
  if(this.zoomBar.parentElement!==parent){if(getComputedStyle(parent).position==='static')parent.style.position='relative';parent.append(this.zoomBar);}
  this.zoomBar.hidden=!kind;const text=Math.round(this.zoomFor(kind)*100)+'%';if(kind&&this.zoomLabel.textContent!==text)this.zoomLabel.textContent=text;}
 setScore(score){this.score=score;this.data=score.engraving||(score.id==='entertainer'?window.PianoEngraving:null);this.available=!!this.data;{const first=this.data?.systems?.[0],box=first?.svg?.match(/viewBox="[-\d.]+ [-\d.]+ [-\d.]+ ([-\d.]+)"/),ratio=box&&first.height?Number(box[1])/first.height:1;this.unitScale=Math.pow(10,Math.round(Math.log10(ratio||1)));}this.details.hidden=!this.available||(score.imported&&!score.originalAsset)||(!score.imported&&score.originalPages===0);this.keyboard.hidden=!this.available;this.page=-1;this.system=-1;this.anchors=null;this.followSystem=null;this.originalPage=1;this.originalNav.replaceChildren();if(this.available&&this.details.hidden)this.scale=Math.min(9,195/Math.max(...this.data.systems.map(s=>s.staffGap||20)));if(this.available&&!this.details.hidden){this.scale=Math.min(9,195/Math.max(...this.data.systems.map(s=>s.staffGap||20)));for(let i=1;i<=(score.originalPages||4);i++){const button=el('button','Page '+i,'secondary');button.onclick=()=>this.showOriginal(i);this.originalNav.append(button);}this.showOriginal(1);}this.baseScale=this.scale;}
 setMode(mode){if(this.mode!==mode){this.mode=mode;this.followSystem=null;this.page=-1;this.system=-1;this.host.replaceChildren();this.host.style.overflowY='';this.strip=null;}}
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
  const H=Math.max(160,(this.host.clientHeight||320)-20),zoom=this.zoomFor('strip');
  if(!this.strip||!this.host.contains(this.strip)||this.stripData!==data||this.stripScale!==this.scale||Math.abs((this.stripHeight||0)-H)>8||this.stripZoom!==zoom){this.labelsStamp=null;this.host.replaceChildren();this.host.className='live-score scrolling-score';this.strip=el('div',undefined,'scroll-strip');
   // Size the line to the music it holds: every notehead, with room for stems and beams, fits the strip.
   const lay=ScoreView.stripLayout(data,H,this.unitScale||1,zoom);this.scale=lay.scale;this.strip.style.height=lay.height+'px';
   data.systems.forEach((sys,i)=>{const panel=el('div',undefined,'scroll-system');panel.innerHTML=sys.svg;panel.style.width=(sys.width*this.scale)+'px';panel.style.height=lay.height+'px';const drawing=panel.querySelector('svg');if(drawing){drawing.style.height=(sys.height*this.scale)+'px';drawing.style.position='absolute';drawing.style.top=(lay.staffTop[i]-sys.staffTop*this.scale)+'px';drawing.setAttribute('preserveAspectRatio','xMinYMin meet');}this.strip.append(panel);});
   // Zoomed in past the window's height, the line scrolls up and down, starting with the staves in view.
   const playhead=el('div',undefined,'fixed-playhead'),tall=lay.height>H+1;this.host.style.overflowY=tall?'auto':'';if(tall){playhead.style.bottom='auto';playhead.style.height=(lay.height-10)+'px';}
   this.host.append(this.strip,playhead);this.stripData=data;this.stripScale=this.scale;this.stripHeight=H;this.stripZoom=zoom;this.stripBegin=0;this.smoothX=null;
   const mid=data.systems.reduce((sum,sys,i)=>sum+lay.staffTop[i]+(sys.staffGap||0)*this.scale/2,0)/data.systems.length;this.host.scrollTop=tall?Math.max(0,10+mid-this.host.clientHeight/2):0;}
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
  const zoom=this.zoomFor('full'),fitKey=host.clientHeight+':'+zoom;host.classList.toggle('zoomed',zoom>1);if(this.stackFitH!==fitKey&&host.clientHeight>0){this.stackFitH=fitKey;host.style.removeProperty('--page-max');const gaps=[];for(let k=0;k+1<data.systems.length&&gaps.length<12;k++){const a=place(k),b=place(k+1);if(a&&b&&b.div===a.div&&b.top>a.top)gaps.push([b.top-a.top,a.height]);}
   if(gaps.length){gaps.sort((x,y)=>x[0]-y[0]);const [step,h]=gaps[Math.floor(gaps.length/2)],w=host.querySelector('.sheet-page')?.clientWidth||1000,fit=(host.clientHeight-20)/(step+h);host.style.setProperty('--page-max',Math.floor(Math.max(560,Math.min(1000,w*Math.min(1,fit)))*zoom)+'px');}}
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
  if(a){const xa=a[1].getBoundingClientRect().left,xb=b?b[1].getBoundingClientRect().left:xa,f=b?Math.max(0,Math.min(1,(at-a[0])/Math.max(.001,b[0]-a[0]))):0;const x=xa+f*(xb-xa)-hostBox.left+host.scrollLeft;line.style.left=x+'px';
   // Zoomed wider than the window, the page also follows sideways.
   if(zoom>1&&(x<host.scrollLeft+40||x>host.scrollLeft+host.clientWidth-60))host.scrollLeft=Math.max(0,x-host.clientWidth*.3);}
  line.style.top=cur.top+'px';line.style.height=cur.height+'px';return sys.page;}
 update(args){this.lastUpdate=args;let {events,matcher,fingers,hintsRight,hintsLeft,page=null,beat=null,timed=null,demo=false}=args;if(!this.available)return false;const data=this.data;const current=events[Math.min(matcher.index,events.length-1)],at=beat??current.beat;this.lastBeat=at;const where=this.position(at);let activePage;
 const now=(typeof performance!=='undefined'?performance.now():Date.now())/1000,dt=this.lastTime==null?1:now-this.lastTime;this.lastTime=now;
 const stacked=this.mode==='sheet'&&this.host.dataset?.stacked==='1';this.zoomControls();
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
// Vertical layout of the continuous line. Every line's staves sit at one height (the eye does not jump at a
// line change), and every line's content fits the strip: imported scores record how far each line reaches
// above and below its staves (ink); library scores are measured from their noteheads, with room for stems,
// beams and slurs beyond the outermost ones. One scale serves the whole score so bars keep their spacing.
// zoom scales the fitted size; zoomed in, the line is taller than H (the view then scrolls up and down) and
// `height` says how tall. It is never less than H.
ScoreView.stripLayout=function(data,H,unitScale=1,zoom=1){
 const S=data.systems,heads=(data.pages||[]).map(p=>p.notes||[]);
 // Staff space in score units: Verovio staff lines, else LilyPond's unit spacing.
 const m=/class="staff"><path d="M[-\d.]+ ([-\d.]+) L[^"]*"[^>]*\/?>(?:<\/path>)?<path d="M[-\d.]+ ([-\d.]+) L/.exec(S[0]?.svg||'');
 const sp=m?Math.abs(Number(m[2])-Number(m[1]))/unitScale:1;
 const need=S.map(s=>{const gap=s.staffGap||sp*4;let above,below;
  if(s.ink){above=(s.staffTop-s.ink[0])/sp;below=(s.ink[1]-s.staffTop-gap)/sp;}
  else{const top=s.y+s.staffTop,bottom=top+gap,ys=(heads[s.page]||[]).filter(n=>n.beat>=s.start-.001&&n.beat<s.end-.001&&n.y>=s.y-sp&&n.y<=s.y+s.height+sp).map(n=>n.y);
   above=Math.max(3,ys.length?(top-Math.min(...ys))/sp+3.5:0);below=Math.max(3,ys.length?(Math.max(...ys)-bottom)/sp+3.5:0);}
  // There is nothing to show beyond the stored crop.
  return {above:Math.max(0,Math.min(above,s.staffTop/sp)),below:Math.max(0,Math.min(below,(s.height-s.staffTop-gap)/sp)),gap:gap/sp};});
 const A=Math.max(...need.map(n=>n.above)),B=Math.max(...need.map(n=>n.gap+n.below));
 const px=Math.min(9*sp,H/(A+B))*zoom,height=Math.max(H,Math.ceil((A+B)*px)),top=A*px+(height-(A+B)*px)/2;
 return {scale:px/sp,staffTop:S.map(()=>top),space:sp,height};
};
ScoreView.ZOOM_MIN=.5;ScoreView.ZOOM_MAX=2.5;
ScoreView.savedZooms=function(){try{const z=JSON.parse(localStorage.getItem('openpiano.score-zoom')||'{}');return z&&typeof z==='object'?z:{};}catch{return {};}};
window.PianoScoreView=ScoreView;
})();
