"""Optional isolated Audiveris bridge. No accounts, journal access or retained uploads."""
import collections, json, os, signal, pathlib, re, shutil, subprocess, tempfile, threading, time, zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
MAX_BYTES=15_000_000
MAX_PAGES=12
MAX_PIXELS=20_000_000
AUDIVERIS=os.environ.get('AUDIVERIS_BIN','Audiveris')
ORIGINS=set(os.environ.get('SCANNER_ORIGINS','http://127.0.0.1:8008').split(','))
SLOTS=threading.BoundedSemaphore(1)
RATE_LOCK=threading.Lock()
REQUESTS=collections.deque()
class ScanError(Exception):pass

def validate(data,mime,folder):
    if not data or len(data)>MAX_BYTES:raise ScanError('Choose a sheet smaller than 15 MB.')
    suffix={'application/pdf':'.pdf','image/png':'.png','image/jpeg':'.jpg'}.get(mime)
    if not suffix:raise ScanError('Use PDF, PNG or JPEG.')
    path=folder/('input'+suffix);path.write_bytes(data)
    if mime=='application/pdf':
        if not data.startswith(b'%PDF-'):raise ScanError('Invalid PDF header.')
        if not shutil.which('pdfinfo'):raise ScanError('Scanner PDF validation is unavailable.')
        info=subprocess.run(['pdfinfo',str(path)],capture_output=True,text=True,timeout=15)
        count=re.search(r'^Pages:\s+(\d+)',info.stdout,re.M)
        if info.returncode or not count:raise ScanError('Could not read this PDF. Export an unlocked PDF.')
        pages=int(count[1])
        if pages<1 or pages>MAX_PAGES:raise ScanError('Automatic scanning supports 1–12 complete pages; use a desktop scanner for longer works.')
        return path,pages
    if mime=='image/png':
        if not data.startswith(b'\x89PNG\r\n\x1a\n') or len(data)<24:raise ScanError('Invalid PNG header.')
        width=int.from_bytes(data[16:20],'big');height=int.from_bytes(data[20:24],'big')
    else:
        if not data.startswith(b'\xff\xd8'):raise ScanError('Invalid JPEG header.')
        width=height=0;i=2
        while i+4<len(data):
            if data[i]!=255:i+=1;continue
            marker=data[i+1];i+=2
            if marker in [0xd8,0xd9] or 0xd0<=marker<=0xd7:continue
            size=int.from_bytes(data[i:i+2],'big')
            if size<2 or i+size>len(data):break
            if marker in [0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]:
                height=int.from_bytes(data[i+3:i+5],'big');width=int.from_bytes(data[i+5:i+7],'big');break
            i+=size
    if not width or not height or width*height>MAX_PIXELS:raise ScanError('Use a sheet image up to 20 megapixels.')
    return path,1

def read_export(path):
    if path.suffix=='.mxl':
        with zipfile.ZipFile(path) as archive:
            entries=archive.infolist()
            if len(entries)>128 or sum(e.file_size for e in entries)>16_000_000:raise ScanError('The recognized score is too large.')
            candidates=[e for e in entries if e.filename.lower().endswith(('.xml','.musicxml')) and not e.filename.startswith('META-INF/')]
            if len(candidates)!=1:raise ScanError('The scanner found multiple score files; review them in Audiveris.')
            data=archive.read(candidates[0])
    else:data=path.read_bytes()
    if len(data)>8_000_000:raise ScanError('The recognized MusicXML is too large.')
    return data.decode('utf-8-sig')

def convert(data,mime):
    if not shutil.which(AUDIVERIS):raise ScanError('Recognition engine is not installed on this scanner server.')
    with tempfile.TemporaryDirectory(prefix='piano-scan-') as tmp:
        folder=pathlib.Path(tmp);path,pages=validate(data,mime,folder);out=folder/'result';out.mkdir()
        with (folder/'scan.log').open('wb') as log:
            process=subprocess.Popen([AUDIVERIS,'-batch','-transcribe','-export','-output',str(out),'--',str(path)],stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            try:returncode=process.wait(timeout=180)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid,signal.SIGKILL);process.wait();raise
        if returncode:raise ScanError('Recognition did not finish successfully. Try a clearer sheet or use Audiveris locally.')
        exports=list(out.rglob('*.mxl')) or list(out.rglob('*.musicxml'))
        if len(exports)!=1:raise ScanError('Recognition did not produce one complete score. Review the book or movements in Audiveris.')
        xml=read_export(exports[0])
        if '<!ENTITY' in xml.upper():raise ScanError('The recognized score contains unsupported XML entities.')
        # A multi-page input must keep its page boundaries in the recognized part.
        # Do not send a seemingly successful first-page-only conversion.
        import xml.etree.ElementTree as ET
        try:root=ET.fromstring(xml)
        except ET.ParseError:raise ScanError('Recognition produced invalid MusicXML.')
        parts=[e for e in root if e.tag.split('}')[-1]=='part']
        if not parts:raise ScanError('Recognition found no playable score.')
        recognized_pages=1+sum(e.tag.split('}')[-1]=='print' and e.attrib.get('new-page')=='yes' for e in parts[0].iter())
        if pages!=recognized_pages:raise ScanError('Page coverage could not be verified. Check every page in Audiveris and import its reviewed export.')
        return {'xml':xml,'pages':pages,'reviewRequired':True}

class Handler(BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def log_message(self,*args):pass
    def answer(self,status,payload):
        body=json.dumps(payload).encode();self.send_response(status)
        origin=self.headers.get('Origin')
        if origin in ORIGINS:self.send_header('Access-Control-Allow-Origin',origin)
        self.send_header('Connection','close');self.close_connection=True;self.send_header('Vary','Origin');self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_OPTIONS(self):
        if self.headers.get('Origin') not in ORIGINS:return self.answer(403,{'error':'Origin not allowed.'})
        self.send_response(204);self.send_header('Access-Control-Allow-Origin',self.headers['Origin']);self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS');self.send_header('Access-Control-Allow-Headers','Content-Type');self.send_header('Content-Length','0');self.end_headers()
    def do_GET(self):
        if urlsplit(self.path).path!='/health':return self.answer(404,{'error':'Not found.'})
        self.answer(200,{'ready':bool(shutil.which(AUDIVERIS) and shutil.which('pdfinfo')),'retainsUploads':False,'maxPages':MAX_PAGES})
    def do_POST(self):
        if urlsplit(self.path).path!='/scan':return self.answer(404,{'error':'Not found.'})
        if self.headers.get('Origin') not in ORIGINS:return self.answer(403,{'error':'Origin not allowed.'})
        try:length=int(self.headers.get('Content-Length','0'))
        except ValueError:return self.answer(400,{'error':'Invalid content length.'})
        if not 0<length<=MAX_BYTES:return self.answer(413,{'error':'Choose a sheet smaller than 15 MB.'})
        with RATE_LOCK:
            now=time.monotonic()
            while REQUESTS and REQUESTS[0]<now-3600:REQUESTS.popleft()
            if len(REQUESTS)>=int(os.environ.get('SCANNER_HOURLY_LIMIT','20')):return self.answer(429,{'error':'The community scanner reached its hourly limit. Try later or use the free desktop scanner.'})
            if not SLOTS.acquire(blocking=False):return self.answer(429,{'error':'The scanner is busy. Try again shortly.'})
            REQUESTS.append(now)
        try:
            self.connection.settimeout(30);data=self.rfile.read(length)
            if len(data)!=length:raise ScanError('The upload was incomplete.')
            self.answer(200,convert(data,self.headers.get('Content-Type','').split(';')[0]))
        except subprocess.TimeoutExpired:self.answer(422,{'error':'Recognition timed out. Use a clearer sheet or scan locally.'})
        except (ScanError,ValueError,zipfile.BadZipFile,UnicodeError) as e:self.answer(422,{'error':str(e)})
        except Exception:self.answer(500,{'error':'The scanner could not process this sheet.'})
        finally:SLOTS.release()

if __name__=='__main__':
    ThreadingHTTPServer((os.environ.get('SCANNER_BIND','127.0.0.1'),int(os.environ.get('SCANNER_PORT','8081'))),Handler).serve_forever()
