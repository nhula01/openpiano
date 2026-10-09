"""Staff detection for LilyPond pages: stray long lines, one-staff lines and four-staff passages."""
import pathlib, sys, unittest, xml.etree.ElementTree as ET

sys.path.insert(0, str(pathlib.Path(__file__).parents[1] / 'scripts'))
from engraving_staves import split_page, staff_lines, staves, systems_of

SVG = 'http://www.w3.org/2000/svg'


def page(staff_tops, joins, extra=''):
    """A fake LilyPond page: five-line staves at staff_tops; joins[i] draws a bar line from staff i to i+1."""
    parts = []
    for top in staff_tops:
        for k in range(5):
            parts.append(f'<g transform="translate(5, {top + k})"><line x1="0" y1="0" x2="100" y2="0"/></g>')
    for i, joined in enumerate(joins):
        if joined:
            a, b = staff_tops[i], staff_tops[i + 1] + 4
            parts.append(f'<g transform="translate(5, {a})"><rect x="0" y="0" width="0.2" height="{b - a}"/></g>')
    return ET.fromstring(f'<svg xmlns="{SVG}" viewBox="0 0 110 200">{"".join(parts)}{extra}</svg>')


class StaffTests(unittest.TestCase):
    def test_hairpins_and_8va_lines_are_not_staves(self):
        hairpin = '<g transform="translate(20, 30)"><line x1="0" y1="0" x2="30" y2="-0.6666"/></g><g transform="translate(20, 30.5)"><line x1="0" y1="0" x2="30" y2="0.6666"/></g>'
        ottava = '<g transform="translate(40, 2)"><line x1="0" y1="0" x2="36" y2="0" stroke-dasharray="0.3,0.7"/></g>'
        tree = page([10, 22, 45, 57], [True, False, True], hairpin + ottava)
        self.assertEqual([s[0] for s in staves(staff_lines(tree))], [10, 22, 45, 57])

    def test_one_staff_lines_stand_alone(self):
        # Two grand staves, then two lines with the left-hand staff hidden (Burgmüller, La Petite Réunion).
        tree = page([10, 22, 45, 57, 80, 95], [True, False, True, False, False])
        groups = systems_of(tree, staves(staff_lines(tree)))
        self.assertEqual([(a[0], b[0]) for a, b in groups], [(10, 22), (45, 57), (80, 80), (95, 95)])

    def test_four_staff_passage_is_one_system(self):
        # Rachmaninoff's Prelude in C-sharp minor writes its climax on two joined grand staves.
        tree = page([10, 22, 34, 46, 80, 92], [True, True, True, False, True])
        groups = systems_of(tree, staves(staff_lines(tree)))
        self.assertEqual([(a[0], b[0]) for a, b in groups], [(10, 46), (80, 92)])

    def test_systems_are_cut_between_staves_and_keep_ledger_notes(self):
        tree = page([10, 22, 45, 57], [True, False, True])
        # Beat 4 has a bass note on ledger lines far below its staff, closer to the next system.
        heads = [(0, 10, 12), (1, 20, 24), (4, 30, 13), (4, 30, 36.5), (8, 10, 47), (9, 20, 59)]
        systems = split_page(tree, heads, 0)
        self.assertEqual([s['start'] for s in systems], [0, 8])
        first, second = systems
        self.assertGreaterEqual(first['y'] + first['height'], 36.5)
        self.assertLessEqual(first['y'] + first['height'], 45)
        self.assertGreaterEqual(first['staffTop'], 0)
        self.assertAlmostEqual(second['y'], first['y'] + first['height'])


if __name__ == '__main__':
    unittest.main()
