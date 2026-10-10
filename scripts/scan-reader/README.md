# Picture reader: training and evaluation

`site/piano-scan-reader.js` recognises clefs, accidentals, rests, time-signature and tuplet numbers, dots and
ties with a small neural network whose 8-bit weights are stored at the end of that file. These scripts rebuild
the weights and measure the reader. They run outside the site (Node 22, Python 3 with numpy, OpenCV, Pillow and
Playwright's Chromium); nothing here is served.

Work in a scratch directory (`work/` below) with the repository's `node_modules` linked into it.

```sh
R=path/to/openpiano; mkdir work && cd work && ln -s $R/node_modules .
python3 $R/scripts/scan-reader/extract.py $R/site/scores corpus          # library piano sources
python3 $R/scripts/scan-reader/gen.py corpus/xml 80 5                     # synthetic scores using every symbol
python3 $R/scripts/scan-reader/gen.py corpus/xml 60 9 0.85                # …with many time signatures
python3 $R/scripts/scan-reader/gen.py corpus/xml 60 13 0.9 rare           # …with the rarer ones
# ids for each set: a JSON list of file stems in corpus/xml (library: corpus/ids.json)
node $R/scripts/scan-reader/render.mjs corpus/ids.json corpus/train 150 3 1   # Verovio, five music fonts
python3 $R/scripts/scan-reader/raster.py corpus/train 180 300                 # PNG pages + element boxes
python3 $R/scripts/scan-reader/degrade.py corpus/train/<page>.png <out>.pgm lite <seed>   # clean | lite | scan | photo
node $R/scripts/scan-reader/dumpcc.cjs <pgm dir> corpus/train cc_train.jsonl  # every piece of ink, as the reader sees it
python3 $R/scripts/scan-reader/label.py cc_train.jsonl corpus/train cc_train.npz   # label pieces by element boxes
python3 $R/scripts/scan-reader/train.py cc_train.npz cc_synth.npz …           # → model.json
python3 $R/scripts/scan-reader/quant.py model.json $R/site/piano-scan-reader.js
```

Evaluation pages are rendered the same way from scores not used for training, degraded with `scan` and `photo`,
and read with `evaluate.cjs <meta.json> <pgm dir> clean,scan,photo`, which scores each page with `score.py`
(pitch and onset of every attack, measures aligned). Keep evaluation and training scores apart.

Pages are made from public-domain library scores (CC0 transcriptions) and synthetic scores; nothing else is used.
