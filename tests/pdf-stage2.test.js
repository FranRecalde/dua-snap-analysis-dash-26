import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PDF_SECTIONS,
  selectedPdfSections,
  qlaPrintClasses,
  qlaPrintTiers,
  heatmapPrintColumns,
  redactStudentNames
} from '../src/pdfExport.js';

const papers = [
  { sheetName: 'Paper 1 F', paper: 'Paper 1', tier: 'Foundation', students: [
    { name: 'Rivera, Cara', activeClass: '11 Sp1' },
    { name: 'Hale, Theo', activeClass: '11 Sp2' }
  ] },
  { sheetName: 'Paper 1 H', paper: 'Paper 1', tier: 'Higher', students: [
    { name: 'Chen, Priya', activeClass: '11 Sp1' }
  ] }
];

describe('PDF stage 2 QLA export', () => {
  it('shows QLA options only when an assessment is loaded', () => {
    const options = Object.fromEntries(PDF_SECTIONS.filter(section => section.needsQla)
      .map(section => [section.key, true]));
    expect(selectedPdfSections(options, false, false)).toEqual([]);
    expect(selectedPdfSections(options, false, true).map(section => section.key)).toEqual([
      'qlaTop', 'qlaPapers', 'qlaQuestions', 'qlaClasses', 'qlaStudents', 'qlaActions'
    ]);
    const template = readFileSync(new URL('../src/template.html', import.meta.url), 'utf8');
    expect(template).toContain('id="pdf-qla-options" style="display: none;"');
  });

  it('renders selected QLA content independently of the visible tab', () => {
    const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
    const printBuilder = app.slice(app.indexOf('function preparePrintQlaSections()'), app.indexOf('function triggerPdfExport()'));
    expect(printBuilder).toContain('renderQlaQuestionsTab();');
    expect(printBuilder).toContain("document.getElementById('pane-questions')");
    expect(printBuilder).toContain('renderQlaClassesTab();');
    expect(printBuilder).not.toContain('activeTab');
  });

  it('prints only the chosen class when a single class is selected', () => {
    expect(qlaPrintClasses(papers)).toEqual(['11 Sp1', '11 Sp2']);
    expect(qlaPrintClasses(papers, '11 Sp2')).toEqual(['11 Sp2']);
    expect(qlaPrintClasses(papers, 'missing')).toEqual([]);
  });

  it('keeps Foundation and Higher papers in separate print groups', () => {
    expect(qlaPrintTiers(papers)).toEqual(['Foundation', 'Higher']);
    for (const tier of qlaPrintTiers(papers)) {
      const group = papers.filter(paper => paper.tier === tier);
      expect(new Set(group.map(paper => paper.tier))).toEqual(new Set([tier]));
    }
  });

  it('splits wide question heatmaps without losing class columns or headers', () => {
    const chunks = heatmapPrintColumns(17);
    expect(chunks.every(indices => indices[0] === 0 && indices[1] === 1)).toBe(true);
    expect(chunks.flatMap(indices => indices.slice(2))).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 2)
    );
  });

  it('hides invented QLA names supplied in surname, first-name form', () => {
    expect(redactStudentNames('Rivera, Cara', papers[0].students)).toBe('C.R., 11 Sp1');
  });
});
