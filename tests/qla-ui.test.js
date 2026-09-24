import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('QLA UI Structure & Layout Tests', () => {
  const templateHtml = fs.readFileSync(path.resolve(__dirname, '../src/template.html'), 'utf-8');

  it('1. Contains the third QLA card beside snapshot upload and new classes panel in upload-cards-grid', () => {
    expect(templateHtml).toContain('class="upload-cards-grid"');
    expect(templateHtml).toContain('id="panel-qla"');
    expect(templateHtml).toContain('More insights with QLAs (optional)');
    expect(templateHtml).toContain('Upload a question level analysis to see question, paper and skill insights.');
  });

  it('2. QLA card is disabled by default with note and accepts .xlsx or .csv', () => {
    expect(templateHtml).toContain('id="qla-disabled-note"');
    expect(templateHtml).toContain('Upload the snapshot first.');
    expect(templateHtml).toContain('id="qla-file-input"');
    expect(templateHtml).toContain('accept=".xlsx, .csv"');
    expect(templateHtml).toContain('id="btn-browse-qla"');
  });

  it('3. QLA card has loaded state elements including "Remove QLA" button', () => {
    expect(templateHtml).toContain('id="qla-loaded-info"');
    expect(templateHtml).toContain('id="qla-assessment-title"');
    expect(templateHtml).toContain('id="qla-papers-count"');
    expect(templateHtml).toContain('id="btn-remove-qla"');
    expect(templateHtml).toContain('Remove QLA');
  });

  it('4. Contains empty "More insights with QLAs" section after student groups with 5 tabs', () => {
    // Check section exists and is hidden by default
    expect(templateHtml).toContain('id="section-qla-insights"');
    expect(templateHtml).toContain('aria-label="More insights with QLAs"');

    // Check position: section-qla-insights must appear AFTER section-student-groups
    const studentGroupsIdx = templateHtml.indexOf('id="section-student-groups"');
    const qlaInsightsIdx = templateHtml.indexOf('id="section-qla-insights"');
    expect(studentGroupsIdx).toBeGreaterThan(-1);
    expect(qlaInsightsIdx).toBeGreaterThan(studentGroupsIdx);

    // Check 5 tabs
    expect(templateHtml).toContain('data-tab="papers-skills"');
    expect(templateHtml).toContain('Papers and skills');
    expect(templateHtml).toContain('data-tab="questions"');
    expect(templateHtml).toContain('Questions');
    expect(templateHtml).toContain('data-tab="classes"');
    expect(templateHtml).toContain('Classes');
    expect(templateHtml).toContain('data-tab="students"');
    expect(templateHtml).toContain('Students');
    expect(templateHtml).toContain('data-tab="actions"');
    expect(templateHtml).toContain('QLA actions');

    // All 5 tabs have now been built; none retain "Coming soon"
    expect(templateHtml).toContain('id="pane-papers-skills"');
    expect(templateHtml).toContain('id="pane-questions"');
    expect(templateHtml).toContain('id="pane-classes"');
    expect(templateHtml).toContain('id="pane-students"');
    expect(templateHtml).toContain('id="pane-actions"');
    const comingSoonMatches = (templateHtml.match(/Coming soon/g) || []).length;
    expect(comingSoonMatches).toBe(0);
  });

  it('5. Does NOT create any page navigation element (respecting condition 1)', () => {
    expect(templateHtml).not.toContain('id="page-navigation"');
    expect(templateHtml).not.toContain('id="page-nav"');
  });

  it('6. Contains "Download QLA template" button in the QLA card', () => {
    expect(templateHtml).toContain('id="btn-download-qla-template"');
    expect(templateHtml).toContain('Download QLA template');
  });

  it('7. Contains collapsible "What a QLA file needs" guide panel with the format rules', () => {
    expect(templateHtml).toContain('id="qla-format-guide"');
    expect(templateHtml).toContain('What a QLA file needs');
    expect(templateHtml).toContain('One sheet per paper');
    expect(templateHtml).toContain('Student Name');
    expect(templateHtml).toContain('Class');
    expect(templateHtml).toContain('Marks per Q');
    expect(templateHtml).toContain('TOTAL MARKS');
    expect(templateHtml).toContain('PERCENTAGE');
    expect(templateHtml).toContain('for absent');
    expect(templateHtml).toContain('Works for any subject');
  });

  it('8. Papers and skills tab contains filter bar, tier highlights, paper cards, class table, and class highlights', () => {
    expect(templateHtml).toContain('id="qla-filter-bar"');
    expect(templateHtml).toContain('id="qla-filter-class"');
    expect(templateHtml).toContain('id="qla-filter-tier"');
    expect(templateHtml).toContain('id="qla-filter-sen"');
    expect(templateHtml).toContain('id="qla-filter-disadvantaged"');
    expect(templateHtml).toContain('id="btn-qla-reset-filters"');
    expect(templateHtml).toContain('id="qla-tier-highlights"');
    expect(templateHtml).toContain('id="qla-paper-cards-grid"');
    expect(templateHtml).toContain('id="qla-class-paper-table"');
    expect(templateHtml).toContain('id="qla-class-highlights-list"');
  });

  it('9. Questions tab contains filter bar, paper selector, quality alerts, skills card, best/worst, question table, heatmap, and topic/AO grid', () => {
    expect(templateHtml).toContain('id="qla-questions-filter-bar"');
    expect(templateHtml).toContain('id="qla-questions-paper-select"');
    expect(templateHtml).toContain('id="qla-q-filter-class"');
    expect(templateHtml).toContain('id="qla-q-filter-sen"');
    expect(templateHtml).toContain('id="qla-q-filter-disadvantaged"');
    expect(templateHtml).toContain('id="btn-qla-q-reset-filters"');
    expect(templateHtml).toContain('id="qla-q-filter-count-badge"');
    expect(templateHtml).toContain('id="qla-questions-alerts-grid"');
    expect(templateHtml).toContain('id="qla-questions-quality-flags"');
    expect(templateHtml).toContain('id="qla-dictation-translation-card"');
    expect(templateHtml).toContain('id="qla-best-worst-container"');
    expect(templateHtml).toContain('id="qla-question-table-wrapper"');
    expect(templateHtml).toContain('id="qla-question-table"');
    expect(templateHtml).toContain('id="qla-heatmap-wrapper"');
    expect(templateHtml).toContain('id="qla-question-heatmap-table"');
    expect(templateHtml).toContain('id="qla-topic-ao-container"');
  });

  it('10. Settings modal includes facility threshold inputs for strong and weak thresholds in existing modal', () => {
    expect(templateHtml).toContain('id="setting-qla-facility-strong"');
    expect(templateHtml).toContain('id="setting-qla-facility-weak"');
    expect(templateHtml).toContain('QLA Question Facility Thresholds');
  });

  it('11. Heatmap container has local scroll container styles (overflow-x: auto; max-width: 100%)', () => {
    expect(templateHtml).toContain('class="qla-heatmap-scroll-container"');
    expect(templateHtml).toContain('overflow-x: auto');
    expect(templateHtml).toContain('max-width: 100%');
  });

  it('12. Classes tab contains class selector, header stats, paper summary, highlights, best/worst, furthest below, beating cohort, and student table', () => {
    expect(templateHtml).toContain('id="qla-classes-class-select"');
    expect(templateHtml).toContain('id="qla-class-header-stats"');
    expect(templateHtml).toContain('id="qla-class-paper-table"');
    expect(templateHtml).toContain('id="qla-class-paper-highlights"');
    expect(templateHtml).toContain('id="qla-class-best-worst-card"');
    expect(templateHtml).toContain('id="qla-class-furthest-below-card"');
    expect(templateHtml).toContain('id="qla-class-beating-cohort-card"');
    expect(templateHtml).toContain('id="qla-class-student-table"');
  });

  it('13. Student list table has its own local horizontal scroll container (overflow-x: auto; max-width: 100%)', () => {
    expect(templateHtml).toContain('class="qla-table-scroll-container"');
    expect(templateHtml).toContain('overflow-x: auto');
    expect(templateHtml).toContain('max-width: 100%');
  });

  it('14. Students tab contains filter bar, skill profile table, Grade 4s card, Farthest from 5 card, Weak questions card, Group gaps card, and Missed papers card', () => {
    expect(templateHtml).toContain('id="qla-students-filter-bar"');
    expect(templateHtml).toContain('id="qla-students-filter-class"');
    expect(templateHtml).toContain('id="qla-students-filter-sen"');
    expect(templateHtml).toContain('id="qla-students-filter-disadvantaged"');
    expect(templateHtml).toContain('id="qla-students-filter-weakest"');
    expect(templateHtml).toContain('id="btn-qla-students-reset-filters"');
    expect(templateHtml).toContain('id="qla-students-profile-table"');
    expect(templateHtml).toContain('id="qla-card-grade4-weakest"');
    expect(templateHtml).toContain('id="qla-grade4-groups-container"');
    expect(templateHtml).toContain('id="qla-card-farthest5-weakest"');
    expect(templateHtml).toContain('id="qla-farthest5-groups-container"');
    expect(templateHtml).toContain('id="qla-card-weak-questions"');
    expect(templateHtml).toContain('id="qla-weak-questions-list-container"');
    expect(templateHtml).toContain('id="qla-card-group-gaps"');
    expect(templateHtml).toContain('id="qla-group-gaps-table"');
    expect(templateHtml).toContain('id="qla-card-missed-papers"');
    expect(templateHtml).toContain('id="qla-missed-papers-table"');
  });

  it('15. Skill profile table and sub-tables have local scroll containers preventing horizontal page scroll', () => {
    // Check that skill profile table, group gaps table, and missed papers table sit inside scroll containers
    const paneStudentsIdx = templateHtml.indexOf('id="pane-students"');
    const paneActionsIdx = templateHtml.indexOf('id="pane-actions"');
    const studentsPaneHtml = templateHtml.slice(paneStudentsIdx, paneActionsIdx);

    expect(studentsPaneHtml).toContain('class="qla-table-scroll-container"');
    expect(studentsPaneHtml).toContain('overflow-x: auto');
    expect(studentsPaneHtml).toContain('max-width: 100%');
  });

  it('16. QLA actions tab contains top priorities card, toggle all actions container, 3 category containers, and copy email button', () => {
    const paneActionsIdx = templateHtml.indexOf('id="pane-actions"');
    const actionsPaneHtml = templateHtml.slice(paneActionsIdx);

    expect(actionsPaneHtml).toContain('id="qla-actions-count-badge"');
    expect(actionsPaneHtml).toContain('id="btn-copy-qla-actions-email"');
    expect(actionsPaneHtml).toContain('Copy actions as email text');
    expect(actionsPaneHtml).toContain('id="qla-actions-empty-state"');

    // Top Priorities section
    expect(actionsPaneHtml).toContain('id="qla-actions-card-top-priorities"');
    expect(actionsPaneHtml).toContain('id="qla-top-priorities-title"');
    expect(actionsPaneHtml).toContain('id="qla-top-priorities-list"');

    // Toggle button container and collapsible all actions container
    expect(actionsPaneHtml).toContain('id="qla-toggle-all-actions-container"');
    expect(actionsPaneHtml).toContain('id="btn-toggle-all-actions"');
    expect(actionsPaneHtml).toContain('id="qla-all-actions-container"');

    // 3 Category sections inside all actions container
    expect(actionsPaneHtml).toContain('id="qla-actions-card-dept"');
    expect(actionsPaneHtml).toContain('id="qla-actions-badge-dept"');
    expect(actionsPaneHtml).toContain('id="qla-actions-list-dept"');
    expect(actionsPaneHtml).toContain('Whole department');

    expect(actionsPaneHtml).toContain('id="qla-actions-card-class"');
    expect(actionsPaneHtml).toContain('id="qla-actions-badge-class"');
    expect(actionsPaneHtml).toContain('id="qla-actions-list-class"');
    expect(actionsPaneHtml).toContain('Class level');

    expect(actionsPaneHtml).toContain('id="qla-actions-card-students"');
    expect(actionsPaneHtml).toContain('id="qla-actions-badge-students"');
    expect(actionsPaneHtml).toContain('id="qla-actions-list-students"');
    expect(actionsPaneHtml).toContain('Students');
  });

  it('17. Settings modal includes QLA action threshold inputs in the existing modal including top priorities count', () => {
    expect(templateHtml).toContain('id="setting-qla-action-class-gap"');
    expect(templateHtml).toContain('id="setting-qla-action-zero-rate"');
    expect(templateHtml).toContain('id="setting-qla-action-demo-gap"');
    expect(templateHtml).toContain('id="setting-qla-action-absence-rate"');
    expect(templateHtml).toContain('id="setting-qla-action-top-priorities"');
    expect(templateHtml).toContain('Class gap (pts)');
    expect(templateHtml).toContain('Zero rate (%)');
    expect(templateHtml).toContain('Demographic gap (pts)');
    expect(templateHtml).toContain('Absence rate (%)');
    expect(templateHtml).toContain('Top priorities');
  });

  it('18. Top priorities card sits above the toggle all actions button and collapsible container', () => {
    const paneActionsIdx = templateHtml.indexOf('id="pane-actions"');
    const actionsPaneHtml = templateHtml.slice(paneActionsIdx);

    const topPrioritiesIdx = actionsPaneHtml.indexOf('id="qla-actions-card-top-priorities"');
    const toggleBtnIdx = actionsPaneHtml.indexOf('id="btn-toggle-all-actions"');
    const allActionsIdx = actionsPaneHtml.indexOf('id="qla-all-actions-container"');

    expect(topPrioritiesIdx).toBeGreaterThan(-1);
    expect(toggleBtnIdx).toBeGreaterThan(topPrioritiesIdx);
    expect(allActionsIdx).toBeGreaterThan(toggleBtnIdx);
  });
});
