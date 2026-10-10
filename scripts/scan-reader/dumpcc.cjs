// node dumpcc.cjs <imgdir> <labeldir> <out.jsonl> : features of every piece of ink, with its box in source pixels
global.window={};global.atob=s=>Buffer.from(s,'base64').toString('binary');require(require('path').join(__dirname, '../../site/piano-scan-reader.js'));const S=window.PianoScanReader;
const {readPGM}=require('./pgm.cjs');const fs=require('fs');
const [dir,labdir,out]=process.argv.slice(2);const fd=fs.openSync(out,'w');let n=0;
for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.pgm'))){
  const {w,h,g}=readPGM(dir+'/'+f);const P=S.preparePage(g,w,h);if(!P||!P.staves.length)continue;
  const W=P.w,H=P.h,sp=P.d;
  const {label,comps}=S.inkPieces(P);
  const ca=Math.cos(P.angle),sa=Math.sin(P.angle);
  const back=(x,y)=>{const dx=x-W/2,dy=y-H/2;return [(ca*dx-sa*dy+W/2)/P.scale,(sa*dx+ca*dy+H/2)/P.scale];};
  for(const c of comps){
    if(c.n<3)continue;const bw=c.x1-c.x0+1,bh=c.y1-c.y0+1;if(bw>12*sp||bh>12*sp)continue;
    const fe=S.shapeFeatures(label,c,W,sp,P.staves).map(v=>Math.round(v*1000)/1000);
    const [ax,ay]=back(c.x0,c.y0),[bx,by]=back(c.x1+1,c.y1+1);
    fs.writeSync(fd,JSON.stringify({page:f.replace(/__(clean|lite|scanlite|scan|photo)\.pgm$/,''),box:[ax,ay,bx,by],n:c.n,sp:sp/P.scale,f:fe})+'\n');n++;
  }
}
console.log(n);
