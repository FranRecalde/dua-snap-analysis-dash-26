import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('New Classes UI Structure & Integration Tests', () => {
  const templateHtml = fs.readFileSync(path.resolve(__dirname, '../src/template.html'), 'utf-8');

  it('contains the "Are students in new classes?" panel in template.html', () => {
    expect(templateHtml).toContain('Are students in new classes?');
    expect(templateHtml).toContain('id="btn-new-classes-no"');
    expect(templateHtml).toContain('id="btn-new-classes-yes"');
    expect(templateHtml).toContain('id="new-classes-upload-section"');
    expect(templateHtml).toContain('Upload the new class lists');
    expect(templateHtml).toContain('id="class-lists-input"');
    expect(templateHtml).toContain('id="staged-class-lists-wrapper"');
  });

  it('contains the View Switch at the top of the dashboard', () => {
    expect(templateHtml).toContain('id="view-switch-container"');
    expect(templateHtml).toContain('Group by:');
    expect(templateHtml).toContain('id="btn-group-current"');
    expect(templateHtml).toContain('id="btn-group-new"');
    expect(templateHtml).toContain('Current classes (Year 10)');
    expect(templateHtml).toContain('New classes (Year 11)');
  });

  it('contains the two mismatch lists sections', () => {
    expect(templateHtml).toContain('id="section-class-mismatch-lists"');
    expect(templateHtml).toContain('In new classes, no mock result');
    expect(templateHtml).toContain('id="container-new-classes-no-mock"');
    expect(templateHtml).toContain('In the snapshot, not in any new class');
    expect(templateHtml).toContain('id="container-snapshot-not-in-new"');
  });
});
