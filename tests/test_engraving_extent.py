"""Staff-system crops hold everything drawn for the system, not only its noteheads."""
import pathlib, sys, unittest, xml.etree.ElementTree as ET

sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / 'scripts'))
from engraving_extent import defs_of, extent, ink, widen
from engraving_staves import crop, split_page

SVG = 'http://www.w3.org/2000/svg'


def svg(body, view='0 0 100 100'):
    return ET.fromstring(f'<svg xmlns="{SVG}" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="{view}">{body}</svg>')


class ExtentTests(unittest.TestCase):
    def test_a_slur_reaches_as_far_as_its_curve_not_its_control_points(self):
        # Control points at y=0 and the ends at y=40: the curve itself only rises to y=10.
        root = svg('<path d="M0 40 C10 0 30 0 40 40"/>')
        top, bottom = ink(root)
        self.assertAlmostEqual(top, 10, delta=.2)
        self.assertEqual(bottom, 40)

    def test_relative_and_smooth_curves(self):
        # The smooth segment mirrors the last control point: an S-shaped curve from y=40 up to 10 and down to 70.
        root = svg('<path d="M0 40 c10 -40 30 -40 40 0 s30 40 40 0"/>')
        top, bottom = ink(root)
        self.assertAlmostEqual(top, 10, delta=.2)
        self.assertAlmostEqual(bottom, 70, delta=.2)

    def test_verovio_text_takes_its_size_from_the_tspans(self):
        # Verovio writes font-size="0px" on <text>; a tempo mark mixes words and a bigger metronome glyph.
        root = svg('<g class="tempo"><text x="10" y="1000" font-size="0px"><tspan font-size="405px">Allegro</tspan>'
                   '<tspan font-family="Leipzig" font-size="720px"></tspan></text></g>', '0 0 5000 5000')
        top, bottom = ink(root)
        self.assertLess(top, 1000 - 600)
        self.assertGreater(bottom, 1000)

    def test_glyphs_drawn_with_use_and_transforms(self):
        root = svg('<defs><path id="g" d="M0 0 L10 -20"/></defs><g transform="translate(0, 50)"><use xlink:href="#g" transform="translate(5, 5) scale(2)"/></g>')
        self.assertEqual(extent(root[1], defs_of(root)), (15, 55))

    def test_page_header_and_footer_are_not_part_of_a_system(self):
        root = svg('<g class="pgHead"><text y="2" font-size="5">Title</text></g><g class="system"><path d="M0 40 L10 60"/></g>')
        self.assertEqual(ink(root), (40, 60))

    def test_widening_stops_at_fixed_limits_so_repeating_it_changes_nothing(self):
        once = widen(20, 60, (5, 90), 10, 80, 1)
        self.assertEqual(once, (10, 80))
        self.assertEqual(widen(*once, (5, 90), 10, 80, 1), once)


def page(staff_tops, extra=''):
    parts = [f'<g transform="translate(5, {top + k})"><line x1="0" y1="0" x2="100" y2="0"/></g>' for top in staff_tops for k in range(5)]
    for a, b in zip(staff_tops[0::2], staff_tops[1::2]):
        parts.append(f'<g transform="translate(5, {a})"><rect x="0" y="0" width="0.2" height="{b + 4 - a}"/></g>')
    return ET.fromstring(f'<svg xmlns="{SVG}" viewBox="0 0 110 200">{"".join(parts)}{extra}</svg>')


class LilyPondCropTests(unittest.TestCase):
    def test_marks_reaching_past_the_cut_widen_the_crop(self):
        # A pedal bracket hangs 5 spaces below the lower staff, past the halfway line to the next system.
        pedal = '<g transform="translate(20, 33)"><rect x="0" y="0" width="10" height="0.2"/><rect x="0" y="-1.5" width="0.2" height="1.7"/></g>'
        tree = page([10, 22, 45, 57], pedal)
        first, second = split_page(tree, [(0, 10, 12), (1, 20, 24), (8, 10, 47), (9, 20, 59)], 0)
        self.assertGreaterEqual(first['y'] + first['height'], 33.2)
        self.assertIn('translate(20, 33)', first['svg'])
        self.assertNotIn('translate(20, 33)', second['svg'])
        self.assertGreaterEqual(first['staffTop'], 0)

    def test_an_element_belongs_to_the_system_its_drawing_is_centred_in(self):
        # Hung from a point inside the upper band, this bar line is drawn on the lower system's staves.
        bar = '<g transform="translate(60, 36)"><rect x="0" y="9" width="0.2" height="16"/></g>'
        tree = page([10, 22, 45, 57], bar)
        y0, y1 = 0, 38
        kept, *_ = crop(tree, 5, 105, y0, y1)
        self.assertNotIn('translate(60, 36)', kept)
        lower, *_ = crop(tree, 5, 105, 38, 75)
        self.assertIn('translate(60, 36)', lower)


if __name__ == '__main__':
    unittest.main()
