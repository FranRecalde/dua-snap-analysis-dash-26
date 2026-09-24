import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PDF_SECTIONS,
  selectedPdfSections,
  setPdfSectionVisibility,
  livePdfFilterSummary,
  matrixPrintColumns,
  createStudentNameRedactor,
  redactStudentNames
} from '../src/pdfExport.js';

describe('PDF stage 1 export', () => {
  it('prints only ticked sections and restores the screen afterwards', () => {
    const elements = Object.fromEntries(PDF_SECTIONS.map(section => {
      const classes = new Set();
      return [section.id, {
        classes,
        classList: {
          toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
          remove: name => classes.delete(name)
        }
      }];
    }));
    const documentRef = { getElementById: id => elements[id] };
    const { selected, restore } = setPdfSectionVisibility(documentRef, {
      overview: true, suggested: false, distance: true, groups: false,
      movement: false, diagnostics: false
    }, false);

    expect(selected.map(section => section.label)).toEqual([
      'Overview and class comparison', 'Distance from grade 5'
    ]);
    expect(elements['print-suggested-actions'].classes.has('pdf-export-hidden')).toBe(true);
    expect(elements['section-overview'].classes.has('pdf-export-hidden')).toBe(false);
    restore();
    expect(elements['print-suggested-actions'].classes.has('pdf-export-hidden')).toBe(false);
  });

  it('uses the live class and other active filters on the cover', () => {
    expect(livePdfFilterSummary({
      className: '11 Sp1', sen: 'SEN Support', disadvantaged: 'ALL', band: 'one_grade_away'
    })).toBe('Class: 11 Sp1 · SEN: SEN Support · Distance band: One grade away');
  });

  it('keeps Movement unavailable without class lists', () => {
    expect(selectedPdfSections({ movement: true }, false)).toEqual([]);
    expect(selectedPdfSections({ movement: true }, true).map(section => section.key)).toEqual(['movement']);
    const template = readFileSync(new URL('../src/template.html', import.meta.url), 'utf8');
    expect(template).toContain('id="pdf-movement-option" style="display: none;"');
  });

  it('replaces invented full names with initials and class for printing', () => {
    const records = [{ firstName: 'Cara', surname: 'Rivera', className: '11 Sp1' }];
    const printText = redactStudentNames('Rivera, Cara; Cara Rivera; Rivera Cara', records);
    expect(printText).toBe('C.R., 11 Sp1; C.R., 11 Sp1; C.R., 11 Sp1');
    expect(printText).not.toMatch(/Cara|Rivera/);
    const withScreenPrivacy = createStudentNameRedactor(records, new Map([['rivera cara', 'Student 1']]));
    expect(withScreenPrivacy('Student 1')).toBe('C.R., 11 Sp1');
  });

  it('splits a wide movement matrix without dropping a class column', () => {
    const chunks = matrixPrintColumns(18);
    expect(chunks.length).toBe(3);
    expect(chunks.flatMap(indices => indices.slice(1, -2))).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1)
    );
    expect(chunks.every(indices => indices[0] === 0 && indices.at(-2) === 16 && indices.at(-1) === 17)).toBe(true);
    const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    expect(styles).toContain('display: table-header-group !important;');
  });
});
