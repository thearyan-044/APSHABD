from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "PDS Brand Doc.docx"

INK = RGBColor(20, 20, 18)
CREAM = RGBColor(244, 239, 225)
RED = RGBColor(196, 49, 42)
MUTED = RGBColor(105, 101, 91)
LIGHT = "F4EFE1"


def font(run, size=11, bold=False, color=INK, italic=False, name="Aptos"):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = color


def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def margins(cell, top=100, start=140, bottom=100, end=140):
    tc = cell._tc.get_or_add_tcPr()
    tc_mar = tc.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc.append(tc_mar)
    for tag, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{tag}"))
        if node is None:
            node = OxmlElement(f"w:{tag}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def add_field(paragraph, field):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = field
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    txt = OxmlElement("w:t")
    txt.text = "1"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instr, sep, txt, end])


def add_bullet(doc, text):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(4)
    font(p.add_run(text), 10.5)
    return p


doc = Document()
sec = doc.sections[0]
sec.page_width = Inches(8.5)
sec.page_height = Inches(11)
sec.top_margin = sec.bottom_margin = Inches(1)
sec.left_margin = sec.right_margin = Inches(1)
sec.header_distance = sec.footer_distance = Inches(0.492)

# Compact-reference-guide preset, with a named PDS monochrome/red palette override.
normal = doc.styles["Normal"]
normal.font.name = "Aptos"
normal._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
normal.font.size = Pt(11)
normal.font.color.rgb = INK
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.25

for name, size, before, after in (("Heading 1", 16, 18, 10), ("Heading 2", 13, 14, 7), ("Heading 3", 12, 10, 5)):
    s = doc.styles[name]
    s.font.name = "Aptos Display"
    s._element.rPr.rFonts.set(qn("w:ascii"), "Aptos Display")
    s._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos Display")
    s.font.size = Pt(size)
    s.font.bold = True
    s.font.color.rgb = RED if name != "Heading 3" else INK
    s.paragraph_format.space_before = Pt(before)
    s.paragraph_format.space_after = Pt(after)
    s.paragraph_format.keep_with_next = True

for list_name in ("List Bullet", "List Number"):
    s = doc.styles[list_name]
    s.font.name = "Aptos"
    s.font.size = Pt(10.5)
    s.paragraph_format.left_indent = Inches(0.375)
    s.paragraph_format.first_line_indent = Inches(-0.188)
    s.paragraph_format.space_after = Pt(4)
    s.paragraph_format.line_spacing = 1.25

# Running furniture.
hp = sec.header.paragraphs[0]
hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
font(hp.add_run("PIN DROP SILENCE  /  LIVING BRAND DOCUMENT"), 8, True, MUTED)
fp = sec.footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
font(fp.add_run("PDS  /  "), 8, True, MUTED)
add_field(fp, "PAGE")

# Editorial cover.
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(92)
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
font(p.add_run("PIN DROP SILENCE"), 10, True, RED)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(10)
font(p.add_run("PDS BRAND DOC"), 32, True, INK, name="Aptos Display")
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(30)
font(p.add_run("Seven Cities. One Silence."), 15, False, MUTED, True)

logo = ROOT / "Logo" / "ChatGPT Image Jul 21, 2026, 11_10_57 PM.png"
if logo.exists():
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(str(logo), width=Inches(1.45))
    p.paragraph_format.space_after = Pt(28)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
font(p.add_run("A living strategic foundation for building an Indian city-led D2C streetwear house."), 11, False, INK)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(8)
font(p.add_run("Working edition 01  |  8 August 2026"), 9, True, MUTED)

doc.add_page_break()

doc.add_heading("How this document works", level=1)
p = doc.add_paragraph()
font(p.add_run("Living-document rule. "), 11, True, RED)
font(p.add_run("This file is the single working source for PDS brand decisions. As each question is answered, the relevant section will be updated in this same document, unresolved assumptions will be marked, and the decision log will advance."), 11)

doc.add_heading("Evidence rule", level=2)
add_bullet(doc, "The PDS website is reviewed before drafting or revising any brand section.")
add_bullet(doc, "Website language and visible product signals are treated as current evidence, not automatically as final strategy.")
add_bullet(doc, "Founder decisions are recorded as approved; ideas awaiting confirmation stay explicitly marked as open.")

doc.add_heading("Current website-derived brand snapshot", level=1)
p = doc.add_paragraph()
font(p.add_run("What the website currently establishes"), 11, True, INK)
for item in [
    "PDS presents itself as a streetwear house for Indian streets that speak without shouting.",
    "The master idea is 'Seven Cities. One Silence.'",
    "The seven-city world currently includes Chennai, Mumbai, Delhi, Pune, Bangalore, Kolkata and Hyderabad.",
    "The product language combines Indian streets and local scripts with Western streetwear forms such as heavyweight tees and varsity cuts.",
    "Drops are organised around cities and neighbourhoods, including places such as Bandra, Colaba, Dadar, Andheri, Thane and T Nagar.",
    "The emotional material includes memory, belonging, roads, routines, relationships and the places where people grow up or work.",
    "The site invites the audience to suggest locations, signalling an early community-led product-development instinct.",
]:
    add_bullet(doc, item)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(8)
font(p.add_run("Working interpretation: "), 10.5, True, RED)
font(p.add_run("PDS is best understood today as a hyperlocal Indian streetwear concept, not merely a graphic T-shirt label. This interpretation remains subject to founder confirmation."), 10.5, False, INK, True)

doc.add_heading("Brand-building roadmap", level=1)
rows = [
    ("01", "Problem and opportunity", "IN PROGRESS"),
    ("02", "Brand positioning", "OPEN"),
    ("03", "Target customer", "OPEN"),
    ("04", "Consumer insight", "OPEN"),
    ("05", "Product strategy", "OPEN"),
    ("06", "Drop architecture", "OPEN"),
    ("07", "Pricing and value", "OPEN"),
    ("08", "Go-to-market", "OPEN"),
    ("09", "D2C buying experience", "OPEN"),
    ("10", "Community and retention", "OPEN"),
    ("11", "Operations and supply chain", "OPEN"),
    ("12", "Unit economics", "OPEN"),
    ("13", "Competitive landscape", "OPEN"),
    ("14", "Brand protection and responsibility", "OPEN"),
    ("15", "Launch plan and milestones", "OPEN"),
]
table = doc.add_table(rows=1, cols=3)
table.autofit = False
table.columns[0].width = Inches(0.55)
table.columns[1].width = Inches(4.65)
table.columns[2].width = Inches(1.3)
headers = ["#", "SECTION", "STATUS"]
for i, text in enumerate(headers):
    cell = table.rows[0].cells[i]
    shade(cell, "141412")
    margins(cell)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    p = cell.paragraphs[0]
    font(p.add_run(text), 9, True, CREAM)
set_repeat_table_header(table.rows[0])
for num, section_name, status in rows:
    cells = table.add_row().cells
    for c in cells:
        margins(c)
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    shade(cells[0], LIGHT)
    shade(cells[2], "F8F5EC")
    font(cells[0].paragraphs[0].add_run(num), 9, True, RED)
    font(cells[1].paragraphs[0].add_run(section_name), 9.5, status == "IN PROGRESS", INK)
    font(cells[2].paragraphs[0].add_run(status), 8, True, RED if status == "IN PROGRESS" else MUTED)

doc.add_page_break()
doc.add_heading("01. Brand problem and opportunity", level=1)
p = doc.add_paragraph()
font(p.add_run("Status: "), 10, True, RED)
font(p.add_run("IN PROGRESS - awaiting founder answers"), 10, True, INK)

doc.add_heading("Website evidence", level=2)
for item in [
    "PDS says it is made for Indian streets that 'speak without shouting.'",
    "Its origin story centres on the belief that the loudest statement is the one worn, not shouted.",
    "It frames clothing as a canvas for a statement and combines Western streetwear codes with Indian streets, local language and personal memory.",
]:
    add_bullet(doc, item)

doc.add_heading("Draft opportunity hypothesis", level=2)
p = doc.add_paragraph()
font(p.add_run("Urban Indians want culturally specific streetwear that represents their city, neighbourhood and lived experience without feeling like generic tourist merchandise or borrowed Western imagery."), 11, True, INK)
p = doc.add_paragraph()
font(p.add_run("This is a draft hypothesis, not yet an approved brand statement."), 9.5, False, MUTED, True)

doc.add_heading("Founder questions to answer", level=2)
questions = [
    "What personal frustration or unmet need made you start Pin Drop Silence?",
    "What feels missing or wrong in the Indian streetwear available today?",
    "When someone wears PDS, what should it let them express about themselves?",
    "Is the primary territory city pride, neighbourhood belonging, personal memory, quiet confidence - or a deliberate combination?",
    "What should PDS never become, even if that route could sell more products?",
]
for q in questions:
    p = doc.add_paragraph(style="List Number")
    font(p.add_run(q), 10.5)

doc.add_heading("Decision log", level=1)
table = doc.add_table(rows=1, cols=4)
table.autofit = False
widths = [0.8, 1.15, 3.65, 0.9]
for i, w in enumerate(widths):
    table.columns[i].width = Inches(w)
for i, txt in enumerate(["DATE", "SECTION", "DECISION / CHANGE", "STATUS"]):
    shade(table.rows[0].cells[i], "141412")
    margins(table.rows[0].cells[i])
    font(table.rows[0].cells[i].paragraphs[0].add_run(txt), 8.5, True, CREAM)
set_repeat_table_header(table.rows[0])
cells = table.add_row().cells
for c in cells:
    margins(c)
font(cells[0].paragraphs[0].add_run("08 Aug 2026"), 8.5, False, MUTED)
font(cells[1].paragraphs[0].add_run("Foundation"), 8.5, True, INK)
font(cells[2].paragraphs[0].add_run("Created the living brand document and recorded the initial website-derived brand snapshot."), 9, False, INK)
font(cells[3].paragraphs[0].add_run("RECORDED"), 8, True, RED)

doc.core_properties.title = "PDS Brand Doc"
doc.core_properties.subject = "Living brand strategy document for Pin Drop Silence"
doc.core_properties.author = "Pin Drop Silence"
doc.core_properties.keywords = "Pin Drop Silence, PDS, brand strategy, D2C, streetwear"
doc.save(OUT)
print(OUT)
