import { describe, it, expect } from 'vitest';
import { buildPowerPointPresentation } from '../src/pptxExport.js';

const names = [
  ['Rivera', 'Cara'], ['Hale', 'Theo'], ['Chen', 'Priya'], ['Singh', 'Amir'], ['Diaz', 'Eva'],
  ['Bell', 'Noah'], ['Park', 'Mina'], ['Lewis', 'Owen'], ['Khan', 'Sara'], ['Moore', 'Ivy'],
  ['Reed', 'Leo'], ['Basu', 'Nina'], ['Fox', 'Maya'], ['Gray', 'Sam'], ['Ali', 'Lena'],
  ['Cole', 'Ben'], ['Shah', 'Ava'], ['Wood', 'Finn'], ['Ives', 'Lia'], ['Moss', 'Eli']
];

const records = names.map(([surname, firstName], index) => {
  const className = `10 Sp${Math.floor(index / 5) + 1}`;
  return {
    id: `invented-${index}`, surname, firstName, className, activeClass: className,
    newClassName: `11 Sp${Math.floor(index / 5) + 1}`, hasNewClass: true,
    points: index % 3 === 0 ? 4 : 5, result: index % 3 === 0 ? '4' : '5',
    isNotSat: false, estimate: 5, progress: index % 3 === 0 ? -1 : 0,
    sen: 'No SEN', disadvantaged: 'No', sex: index % 2 ? 'M' : 'F', attendance: 95
  };
});

const classListsData = {
  allNewClassStudents: records.map(record => ({ ...record, className: record.newClassName })),
  inSnapshotNotInNewClass: [], inNewClassesNoMockResult: []
};

const questions = [1, 2, 3, 4].map(number => ({
  key: `q${number}`, label: `Q${number} invented question`, topic: `Topic ${number}`, maxMarks: 5
}));

const papers = ['Foundation', 'Higher'].flatMap((tier, tierIndex) =>
  ['Listening', 'Reading'].map((paperName, paperIndex) => ({
    sheetName: `${paperName} ${tierIndex ? 'H' : 'F'}`,
    paper: paperName, tier, totalMax: 20, questions,
    students: records.slice(tierIndex * 10, tierIndex * 10 + 10).map((record, studentIndex) => {
      const marks = Object.fromEntries(questions.map((question, questionIndex) => [
        question.key, (studentIndex + questionIndex + paperIndex) % 6
      ]));
      return {
        name: `${record.surname}, ${record.firstName}`,
        nameKey: `${record.surname}_${record.firstName}`.toLowerCase(),
        surname: record.surname, firstName: record.firstName,
        activeClass: record.className, className: record.className,
        status: 'present', marks, total: Object.values(marks).reduce((a, b) => a + b, 0),
        snapshotMatched: true, result: record.points, displayResult: record.result,
        points: record.points, sen: record.sen, disadvantaged: record.disadvantaged
      };
    })
  }))
);

const slideContents = pres => pres._slides.map(slide => JSON.stringify(slide._slideObjects));
const build = qlaPapers => buildPowerPointPresentation({
  filteredRecords: records, allRecords: records, rawSnapshotRecords: records,
  distanceRecords: records, classListsData, qlaPapers,
  qlaAssessmentTitle: 'Autumn QLA', snapshotName: 'Autumn mock',
  ukDateToday: '24 September 2026'
});

describe('PowerPoint stage 4 QLA export', () => {
  it('builds with snapshot, class lists and QLA and includes every QLA section', async () => {
    const pres = build(papers);
    const content = slideContents(pres).join('\n');
    for (const title of [
      'QLA Top 5 priorities', 'Strongest and weakest paper', 'Best 3 and worst 3 questions',
      'Class by paper', '10 weakest questions heatmap', 'Approaches worth sharing',
      'Grade 4s by weakest paper'
    ]) expect(content).toContain(title);
    expect(content).toContain('Contains pupil data. Handle under the trust data protection policy.');
    expect((await pres.write({ outputType: 'nodebuffer' })).length).toBeGreaterThan(1000);
  });

  it('builds with only Foundation loaded', async () => {
    const pres = build(papers.filter(paper => paper.tier === 'Foundation'));
    const qlaSlides = slideContents(pres).filter(content => content.includes('QLA Top 5 priorities') || content.includes('10 weakest questions heatmap'));
    expect(qlaSlides.length).toBeGreaterThan(0);
    expect(qlaSlides.every(content => !content.includes('Higher'))).toBe(true);
    expect((await pres.write({ outputType: 'nodebuffer' })).length).toBeGreaterThan(1000);
  });

  it('never pairs Foundation and Higher on one slide ranking or table', () => {
    const pres = build(papers);
    expect(slideContents(pres).every(content => !(content.includes('Foundation') && content.includes('Higher')))).toBe(true);
  });

  it('removes full names from every slide when hide names is on', () => {
    const pres = buildPowerPointPresentation({
      filteredRecords: records, allRecords: records, rawSnapshotRecords: records,
      distanceRecords: records, classListsData, qlaPapers: papers,
      qlaAssessmentTitle: 'Rivera, Cara QLA', options: { hideNames: true }
    });
    const content = slideContents(pres).join('\n');
    expect(content).not.toMatch(/Rivera, Cara|Cara Rivera|Rivera Cara/);
    for (const [surname, firstName] of names) {
      expect(content).not.toContain(`${surname}, ${firstName}`);
      expect(content).not.toContain(`${firstName} ${surname}`);
    }
    expect(content).toContain('C.R., 10 Sp1');
  });

  it('paginates long question labels before a table reaches the footer', () => {
    const longPapers = papers.map(paper => ({
      ...paper,
      questions: paper.questions.map(question => ({ ...question, label: `${question.label} ${'invented detail '.repeat(12)}` }))
    }));
    const pres = build(longPapers);
    const tables = pres._slides.flatMap(slide => slide._slideObjects.filter(object => object._type === 'table'));
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      const y = table.options.y / 914400;
      const height = table.options.h / 914400;
      expect(y + height).toBeLessThanOrEqual(5.1);
    }
  });
});
