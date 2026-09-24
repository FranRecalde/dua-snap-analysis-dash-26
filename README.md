# Class Snapshot Dashboard

## What it is

A browser-only dashboard for analysing mock snapshot results by class. You can also add new class lists to see how pupils move into their next classes, and a question-level analysis (QLA) file to explore performance by paper, skill and question. Both are optional.

## Privacy

The dashboard runs entirely in your browser. It sends no pupil data anywhere. Snapshot, class-list and QLA data are held in memory only and cleared when you log out or refresh the page. Exports hide pupil names by default and carry the footer: “Contains pupil data. Handle under the trust data protection policy.” The login is a privacy screen, **not** a security control.

## Files it accepts

**Mock snapshot (.xlsx or .csv).** The header row must contain a surname and first-name column. Headers are matched without regard to case, by these words or phrases rather than by column position:

| Field | Matched header keywords |
| --- | --- |
| Surname | legal surname; last name; surname |
| First name | first name; forename |
| Admission number | admission number; admission no; adm number; adm no; adno; admission |
| Year group | year group; year |
| Tutor group | tutor group; reg group; form |
| Sex | gender; sex |
| Attendance | att. %; att %; att.%; attendance |
| Disadvantaged | disadvantaged; pupil premium; pp; disadv |
| SEN | sen status; sen |
| EAL | eal; english as an additional language; first language; first lang; language |
| KS2 band | ks2 pag band; ks2 band |
| Scaled score | ave scaled score; scaled score |
| Attainment level | attainment level; prior attainment |
| Subject | subject |
| Class | teaching group; class; set |
| Result | result; grade |
| Points | points |
| Estimate | estimate |
| Progress | progress |

**New class lists.** Upload one file per class (the class name comes from its file name), or one file with a **Class** column. Each list needs surname and first name; admission number helps match pupils reliably. The dashboard can also read tutor group, sex, SEN, pupil premium and EAL columns.

**QLA.** Upload a workbook with one sheet per paper; add **F** or **H** at the end of a sheet name for tiered papers. Each sheet needs **Student Name** as “Surname, First Name”, **Class**, question columns starting with **Q**, a **Marks per Q** row giving each question's maximum mark, and **TOTAL MARKS** and **PERCENTAGE** columns at the end (the dashboard recalculates these). Optional section labels and AO1/AO2/AO3 labels can describe questions. Enter **A** for an absent pupil and leave no other blanks. Paper and question names can suit any subject. Open **What a QLA file needs** beside the upload area for the on-screen guide, or use **Download QLA template** for an example.

## What each section shows

- **Overview and class comparison:** Headline figures, a class comparison table and charts of attainment across classes.
- **Suggested actions:** A ranked top five drawn from mock results, class balance and QLA where those files are loaded. Each action gives its source and the number of pupils affected; the full list is available too.
- **Distance from grade 5:** Counts by distance band and class, plus pupils closest to grade 5, furthest away, or below a 5+ estimate.
- **Student groups:** Results and gaps for groups such as SEN, disadvantaged pupils, sex and EAL where available, with top performers by class.
- **Movement and class balance:** With new class lists, a movement matrix, new-class profiles and flags for possible imbalances.
- **QLA – Papers and skills:** Paper and skill strengths and weaknesses, compared within each tier, with a class-by-paper view.
- **QLA – Questions:** Best and weakest questions, a question table and a class heatmap for the selected paper and tier.
- **QLA – Classes:** A selected class's paper results, question strengths and concerns, and pupil detail.
- **QLA – Students:** Pupil skill profiles and action groups, including grade 4 pupils by weakest paper and absences.
- **QLA – QLA actions:** Targeted actions from the QLA, including priorities and the full list.
- **Exports:** Choose sections for a PDF report or slides for a PowerPoint presentation. Exports use the current data and filters; check the hide-names setting before sharing.

## Key rules

Absent pupils are excluded from results and comparisons. An estimate of **0** is treated as missing. Foundation and Higher results are never compared with each other. Comparisons based on averages, percentages or gaps need at least five pupils; lists of individual pupils can appear with just one.

## How to run it

From the repository folder, run `npm install`, then `npm run dev` and open the local address shown. Run `npm test` for the full test suite and `npm run build` to build the dashboard. On Windows, use `npm.cmd` in place of `npm` (for example, `npm.cmd run dev`).

## For developers and AI agents

Read [GEMINI.md](GEMINI.md) or [AGENTS.md](AGENTS.md) before making changes; they must stay identical. The calculation modules keep data processing separate from the page:

- `parser.js` reads and cleans snapshots and new class lists; `stats.js` calculates snapshot, class, group and distance figures.
- `movementStats.js` calculates the movement matrix, new-class profiles and balance flags.
- `qlaParser.js` reads QLA sheets; `qlaService.js` matches QLA pupils to the snapshot and supplies the template; `qlaStats.js` calculates QLA measures; `qlaActions.js` generates QLA actions.
- `actions.js` combines and ranks suggested actions; `actionGroupSize.js` defines which action rules need a five-pupil comparison group.

## Known limits

Without an admission number, matching across files relies on names and can be uncertain. The dashboard handles one snapshot at a time. It does not yet compare results year on year.
