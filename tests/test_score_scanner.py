"""Scanner boundary tests; they do not claim optical-recognition accuracy."""
import importlib.util,pathlib,tempfile,unittest,zipfile
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('scanner',pathlib.Path(__file__).parents[1]/'services/score-scanner/server.py');scanner=importlib.util.module_from_spec(spec);spec.loader.exec_module(scanner)
class ScannerTests(unittest.TestCase):
 def test_rejects_invalid_and_oversized_images(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d)
   with self.assertRaises(scanner.ScanError):scanner.validate(b'not a pdf','application/pdf',root)
   with self.assertRaises(scanner.ScanError):scanner.validate(b'GIF','image/gif',root)
   png=b'\x89PNG\r\n\x1a\n'+b'\0'*8+(8000).to_bytes(4,'big')+(8000).to_bytes(4,'big')
   with self.assertRaises(scanner.ScanError):scanner.validate(png,'image/png',root)
   small=png[:16]+(1000).to_bytes(4,'big')+(1000).to_bytes(4,'big')
   self.assertEqual(scanner.validate(small,'image/png',root)[1],1)
 def test_reads_one_score_from_compressed_export(self):
  with tempfile.TemporaryDirectory() as d:
   path=pathlib.Path(d)/'score.mxl'
   with zipfile.ZipFile(path,'w') as z:z.writestr('META-INF/container.xml','container');z.writestr('score.xml','<score-partwise/>')
   self.assertEqual(scanner.read_export(path),'<score-partwise/>')
 def test_missing_recognition_engine_is_not_a_fake_success(self):
  with patch.object(scanner.shutil,'which',return_value=None):
   with self.assertRaisesRegex(scanner.ScanError,'not installed'):scanner.convert(b'%PDF-1','application/pdf')
 def test_multiple_exports_are_rejected_and_temp_uploads_removed(self):
  captured=[]
  class Process:
   def __init__(self,args,**kwargs):
    out=pathlib.Path(args[args.index('-output')+1]);captured.append(out.parent);(out/'one.musicxml').write_text('<score-partwise/>');(out/'two.musicxml').write_text('<score-partwise/>')
   def wait(self,timeout):return 0
  with patch.object(scanner.shutil,'which',return_value='/trusted/executable'),patch.object(scanner,'validate',side_effect=lambda data,mime,folder:(folder/'input.pdf',2)),patch.object(scanner.subprocess,'Popen',Process):
   with self.assertRaisesRegex(scanner.ScanError,'one complete score'):scanner.convert(b'%PDF-1','application/pdf')
  self.assertTrue(all(not p.exists() for p in captured))
 def test_unverified_page_coverage_is_rejected(self):
  class Process:
   def __init__(self,args,**kwargs):
    out=pathlib.Path(args[args.index('-output')+1]);(out/'score.musicxml').write_text('<score-partwise><part><measure/></part></score-partwise>')
   def wait(self,timeout):return 0
  with patch.object(scanner.shutil,'which',return_value='/trusted/executable'),patch.object(scanner,'validate',side_effect=lambda data,mime,folder:(folder/'input.pdf',2)),patch.object(scanner.subprocess,'Popen',Process):
   with self.assertRaisesRegex(scanner.ScanError,'Page coverage'):scanner.convert(b'%PDF-1','application/pdf')
if __name__=='__main__':unittest.main()
