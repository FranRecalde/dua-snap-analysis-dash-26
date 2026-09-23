/**
 * Class Snapshot Dashboard
 * Private, browser only class and cohort analysis for Heads of Department.
 * Dixons Unity Academy
 */

import * as XLSX from 'xlsx';
import { exportPowerPointPresentation } from './pptxExport.js';
import {
  computeHeadlines,
  filterRecords,
  buildPseudonymMaps,
  calculateMetrics,
  calculateClassBreakdown,
  calculateColumnExtremes,
  sortClasses,
  formatProgress,
  formatPct,
  GCSE_GRADES,
  GRADE_COLORS,
  DISTANCE_BANDS,
  calculateStudentGap,
  calculateDistanceBand,
  calculateDistanceMetrics,
  calculateDistanceBreakdownByClass,
  filterDistanceRecords,
  getFarthestFromGrade5,
  getClosestToGrade5ByClass,
  getEstimate5PlusShortfall,
  calculateGroupMetrics,
  calculateStudentGroupsBreakdown,
  calculateGroupBreakdownPerClass,
  getTopPerformersByClass
} from './stats.js';
import {
  parseSnapshotSpreadsheet,
  formatUKDate,
  buildNameKey,
  parseClassListFile,
  mergeClassListsIntoSnapshot,
  extractClassNameFromFileName
} from './parser.js';

// Configuration & Storage Keys
export const STORAGE_PREFIX = 'class_snapshot_';
export const SESSION_AUTH_KEY = `${STORAGE_PREFIX}auth_session`;
export const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;

// Password hash for: Unity2026!
const EXPECTED_HASH = 'aef276c8b73d35370acccbee7252e8ab42b1abf75bb0806585b18ed070d91534';
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000; // 60 seconds

// Application State (In-Memory Only - Privacy Compliant)
let allRecords = [];
let currentFileName = '';
let currentSnapshotName = '';
let currentDiagnostics = null;
let isNameHidden = false;
let currentPseudonymMaps = null;

// New Classes State (In-Memory Only - Never in localStorage)
let isNewClassesEnabled = false;
let stagedClassFiles = [];
let classListsData = null; // { matchedCount, inSnapshotNotInNewClass, inNewClassesNoMockResult, conflicts, allNewClassStudents }
let activeGrouping = 'current'; // 'current' (Year 10) or 'new' (Year 11)

// Overview & Class Comparison State
let currentRankBy = 'average-grade';
let currentSortKey = 'averageGrade';
let currentSortDir = 'desc';
let cohortMetrics = null;
let classBreakdowns = [];

// Distance from Grade 5 State
let distFilters = {
  className: 'ALL',
  sen: 'ALL',
  disadvantaged: 'ALL',
  band: 'ALL'
};

// Student Groups & Top Performers State
let selectedTopPerformersClass = null;

let pdfExportOptions = {
  headlines: true,
  overview: true,
  hideNames: false,
  orientation: 'portrait'
};

let pptxExportOptions = {
  headlines: true,
  hideNames: false
};

/**
 * SHA-256 password hasher using subtle crypto
 */
export async function hashPassword(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Toast notification helper
 */
export function showToast(message, duration = 3000) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast-notice';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1c2421;
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 13.5px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      z-index: 9999;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(255, 255, 255, 0.15);
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, duration);
}

/**
 * Clear all dashboard data and session keys with prefix
 */
export function clearAllStoredData() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      sessionStorage.removeItem(SESSION_AUTH_KEY);
    } catch (e) {
      console.warn('Failed to clear stored data:', e);
    }
  }
}

/**
 * Authentication handling
 */
function checkAuth() {
  const isAuth = sessionStorage.getItem(SESSION_AUTH_KEY) === 'authenticated';
  const loginScreen = document.getElementById('login-screen');
  const trustBar = document.getElementById('trust-bar');
  const appRoot = document.getElementById('app-root');

  if (isAuth) {
    if (loginScreen) loginScreen.style.display = 'none';
    if (trustBar) trustBar.style.display = 'block';
    if (appRoot) appRoot.style.display = 'block';
  } else {
    if (loginScreen) loginScreen.style.display = 'flex';
    if (trustBar) trustBar.style.display = 'none';
    if (appRoot) appRoot.style.display = 'none';
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const alertEl = document.getElementById('login-error-alert');
  const pwdInput = document.getElementById('login-password');
  const submitBtn = document.getElementById('btn-login-submit');

  const attempts = parseInt(sessionStorage.getItem(`${STORAGE_PREFIX}login_attempts`) || '0', 10);
  const lockoutUntil = parseInt(sessionStorage.getItem(`${STORAGE_PREFIX}lockout_until`) || '0', 10);

  if (Date.now() < lockoutUntil) {
    const remainingSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
    if (alertEl) {
      alertEl.textContent = `Too many incorrect attempts. Please wait ${remainingSec}s.`;
      alertEl.style.display = 'block';
    }
    return;
  }

  const passwordVal = (pwdInput?.value || '').trim();
  const hash = await hashPassword(passwordVal);

  if (hash === EXPECTED_HASH) {
    sessionStorage.setItem(SESSION_AUTH_KEY, 'authenticated');
    sessionStorage.removeItem(`${STORAGE_PREFIX}login_attempts`);
    sessionStorage.removeItem(`${STORAGE_PREFIX}lockout_until`);
    if (alertEl) alertEl.style.display = 'none';
    checkAuth();
    showToast('Signed in successfully.');
  } else {
    const newAttempts = attempts + 1;
    sessionStorage.setItem(`${STORAGE_PREFIX}login_attempts`, String(newAttempts));

    if (newAttempts >= MAX_ATTEMPTS) {
      sessionStorage.setItem(`${STORAGE_PREFIX}lockout_until`, String(Date.now() + LOCKOUT_MS));
      if (alertEl) {
        alertEl.textContent = `Too many incorrect attempts. Locked out for 60 seconds.`;
        alertEl.style.display = 'block';
      }
    } else {
      if (alertEl) {
        alertEl.textContent = `Password not recognised. (${MAX_ATTEMPTS - newAttempts} attempts remaining)`;
        alertEl.style.display = 'block';
      }
    }
    if (pwdInput) pwdInput.value = '';
  }
}

function handleLogout() {
  sessionStorage.removeItem(SESSION_AUTH_KEY);
  checkAuth();
  showToast('Signed out.');
}

/**
 * HTML Escaping helper
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render Data Diagnostics Panel
 * DIAGNOSTICS PANEL: rows read, rows kept, matched columns, unmatched columns,
 * number of U grades, number not sat, number with missing estimate, duplicate students.
 */
function renderDiagnostics(diagnostics, fileName, snapshotName) {
  const panel = document.getElementById('diagnostics-panel');
  const fileSub = document.getElementById('diagnostics-file-sub');
  const statusBadge = document.getElementById('diagnostics-status-badge');
  const content = document.getElementById('diagnostics-content');
  if (!panel || !content) return;

  if (fileSub) {
    fileSub.textContent = snapshotName
      ? `${snapshotName} · Source: ${fileName}`
      : `Source file: ${fileName}`;
  }

  if (statusBadge) {
    const hasAlerts = diagnostics.numberNotSat > 0 || diagnostics.numberMissingEstimate > 0 || diagnostics.duplicateStudents > 0;
    statusBadge.innerHTML = hasAlerts
      ? `<span class="diag-pill-badge diag-pill-amber">⚠️ Notice items detected</span>`
      : `<span class="diag-pill-badge diag-pill-green">✓ Validated &amp; ready</span>`;
  }

  const uGradePill = diagnostics.numberOfUGrades > 0
    ? `<span class="diag-pill-badge diag-pill-gray" style="margin-top:6px;">Points = 0</span>`
    : '';

  const notSatPill = diagnostics.numberNotSat > 0
    ? `<span class="diag-pill-badge diag-pill-amber" style="margin-top:6px;">Excluded from averages</span>`
    : `<span class="diag-pill-badge diag-pill-green" style="margin-top:6px;">All sat</span>`;

  const missingEstPill = diagnostics.numberMissingEstimate > 0
    ? `<span class="diag-pill-badge diag-pill-amber" style="margin-top:6px;">Progress missing</span>`
    : `<span class="diag-pill-badge diag-pill-green" style="margin-top:6px;">Complete</span>`;

  const dupPill = diagnostics.duplicateStudents > 0
    ? `<span class="diag-pill-badge diag-pill-red" style="margin-top:6px;">${diagnostics.duplicateStudents} duplicate students</span>`
    : `<span class="diag-pill-badge diag-pill-green" style="margin-top:6px;">None</span>`;

  const matchedChipsHtml = diagnostics.matchedColumns.map(col => {
    return `<span class="diag-chip diag-chip-matched" title="Column ${col.index + 1}: &quot;${escapeHtml(col.header)}&quot;">✓ ${escapeHtml(col.label)} <small style="opacity:0.75;">(${escapeHtml(col.header)})</small></span>`;
  }).join('');

  const unmatchedChipsHtml = diagnostics.unmatchedColumns.length > 0
    ? diagnostics.unmatchedColumns.map(col => {
        return `<span class="diag-chip diag-chip-unmatched" title="Column ${col.index + 1}: &quot;${escapeHtml(col.header)}&quot;">? ${escapeHtml(col.header)}</span>`;
      }).join('')
    : '<span style="font-size: 12.5px; color: var(--text-muted);">None — all columns recognized.</span>';

  // List of students who did not sit (result blank)
  let notSatHtml = '';
  if (diagnostics.notSatList && diagnostics.notSatList.length > 0) {
    const items = diagnostics.notSatList.map(s => {
      return `<li><strong>${escapeHtml(s.name)}</strong> · ${escapeHtml(s.className)} (Result blank)</li>`;
    }).join('');
    notSatHtml = `
      <div class="diag-list-card" style="border-left: 4px solid #f59e0b;">
        <div class="diag-list-title" style="color: #92400e;">
          <span>⚠️</span> Students Not Sat (${diagnostics.notSatList.length}) — Excluded from points averages
        </div>
        <ul class="diag-list-items">
          ${items}
        </ul>
      </div>
    `;
  }

  // List of students with missing estimates (estimate 0 or blank)
  let missingEstimateHtml = '';
  if (diagnostics.missingEstimateList && diagnostics.missingEstimateList.length > 0) {
    const items = diagnostics.missingEstimateList.slice(0, 10).map(s => {
      return `<li><strong>${escapeHtml(s.name)}</strong> · ${escapeHtml(s.className)} (Estimate 0 or blank)</li>`;
    }).join('');
    const extraCount = diagnostics.missingEstimateList.length - 10;
    const extraNote = extraCount > 0 ? `<li><em>...and ${extraCount} more</em></li>` : '';
    missingEstimateHtml = `
      <div class="diag-list-card" style="border-left: 4px solid #f59e0b;">
        <div class="diag-list-title" style="color: #92400e;">
          <span>ℹ️</span> Students with Missing Estimates (${diagnostics.missingEstimateList.length}) — Progress also set to missing
        </div>
        <ul class="diag-list-items">
          ${items}
          ${extraNote}
        </ul>
      </div>
    `;
  }

  // List of duplicate students
  let duplicatesHtml = '';
  if (diagnostics.duplicateStudentsList && diagnostics.duplicateStudentsList.length > 0) {
    const items = diagnostics.duplicateStudentsList.map(s => {
      return `<li><strong>${escapeHtml(s.name)}</strong> · ${escapeHtml(s.className)} (Student Key: <code>${escapeHtml(s.studentKey)}</code>) — appears <strong>${s.count} times</strong></li>`;
    }).join('');
    duplicatesHtml = `
      <div class="diag-list-card" style="border-left: 4px solid #ef4444;">
        <div class="diag-list-title" style="color: #991b1b;">
          <span>🚨</span> Duplicate Students Detected (${diagnostics.duplicateStudentsList.length})
        </div>
        <ul class="diag-list-items">
          ${items}
        </ul>
      </div>
    `;
  }

  // List of status conflicts between snapshot and class lists
  let conflictsHtml = '';
  if (classListsData && classListsData.conflicts && classListsData.conflicts.length > 0) {
    const items = classListsData.conflicts.map(c => {
      return `<li><strong>${escapeHtml(c.studentName)}</strong> (${escapeHtml(c.className)}) · ${escapeHtml(c.type)}: Snapshot has &quot;<strong>${escapeHtml(c.snapshotValue)}</strong>&quot; vs Class List &quot;<strong>${escapeHtml(c.classListValue)}</strong>&quot; (kept snapshot value)</li>`;
    }).join('');
    conflictsHtml = `
      <div class="diag-list-card" style="border-left: 4px solid #f59e0b;">
        <div class="diag-list-title" style="color: #92400e;">
          <span>⚠️</span> Status Conflicts with Class Lists (${classListsData.conflicts.length}) — Kept snapshot value
        </div>
        <ul class="diag-list-items">
          ${items}
        </ul>
      </div>
    `;
  }

  content.innerHTML = `
    <div class="diagnostic-grid">
      <div class="diagnostic-stat-box">
        <span class="diagnostic-stat-label">Rows Read</span>
        <span class="diagnostic-stat-val">${diagnostics.rowsRead}</span>
        <span class="diagnostic-stat-sub">Data rows in file</span>
      </div>

      <div class="diagnostic-stat-box">
        <span class="diagnostic-stat-label">Rows Kept</span>
        <span class="diagnostic-stat-val" style="color: #166534;">${diagnostics.rowsKept}</span>
        <span class="diagnostic-stat-sub">Valid assessment entries</span>
      </div>

      <div class="diagnostic-stat-box">
        <span class="diagnostic-stat-label">Matched Columns</span>
        <span class="diagnostic-stat-val">${diagnostics.matchedColumns.length}</span>
        <span class="diagnostic-stat-sub">Recognised keywords</span>
      </div>

      <div class="diagnostic-stat-box">
        <span class="diagnostic-stat-label">Unmatched Columns</span>
        <span class="diagnostic-stat-val">${diagnostics.unmatchedColumns.length}</span>
        <span class="diagnostic-stat-sub">Unused custom headers</span>
      </div>

      <div class="diagnostic-stat-box">
        <span class="diagnostic-stat-label">U Grades</span>
        <span class="diagnostic-stat-val">${diagnostics.numberOfUGrades}</span>
        <span class="diagnostic-stat-sub">Points = 0</span>
        ${uGradePill}
      </div>

      <div class="diagnostic-stat-box">
        <span class="diagnostic-stat-label">Not Sat</span>
        <span class="diagnostic-stat-val" style="${diagnostics.numberNotSat > 0 ? 'color: #b45309;' : ''}">${diagnostics.numberNotSat}</span>
        <span class="diagnostic-stat-sub">Blank results</span>
        ${notSatPill}
      </div>

      <div class="diagnostic-stat-box">
        <span class="diagnostic-stat-label">Missing Estimate</span>
        <span class="diagnostic-stat-val" style="${diagnostics.numberMissingEstimate > 0 ? 'color: #b45309;' : ''}">${diagnostics.numberMissingEstimate}</span>
        <span class="diagnostic-stat-sub">Estimate 0 or blank</span>
        ${missingEstPill}
      </div>

      <div class="diagnostic-stat-box">
        <span class="diagnostic-stat-label">Duplicate Students</span>
        <span class="diagnostic-stat-val" style="${diagnostics.duplicateStudents > 0 ? 'color: #dc2626;' : ''}">${diagnostics.duplicateStudents}</span>
        <span class="diagnostic-stat-sub">Duplicates detected</span>
        ${dupPill}
      </div>
    </div>

    <div class="diagnostic-detail-section">
      <div class="diagnostic-columns-block">
        <div class="diag-col-heading">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="#166534" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Matched Columns (${diagnostics.matchedColumns.length}):
        </div>
        <div class="diag-chip-group">
          ${matchedChipsHtml}
        </div>
      </div>

      <div class="diagnostic-columns-block" style="margin-top: 14px;">
        <div class="diag-col-heading" style="color: ${diagnostics.unmatchedColumns.length > 0 ? '#92400e;' : 'var(--text-secondary);'}">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          Unmatched Columns (${diagnostics.unmatchedColumns.length}):
        </div>
        <div class="diag-chip-group">
          ${unmatchedChipsHtml}
        </div>
      </div>

      ${notSatHtml}
      ${missingEstimateHtml}
      ${duplicatesHtml}
      ${conflictsHtml}
    </div>
  `;

  panel.style.display = 'block';
}

/**
 * Return records formatted for active grouping ('current' or 'new')
 */
function getActiveRecords(grouping = activeGrouping) {
  if (grouping === 'new' && classListsData) {
    const matchedSnapshot = allRecords
      .filter(r => r.hasNewClass && r.newClassName)
      .map(r => ({
        ...r,
        activeClass: r.newClassName,
        className: r.newClassName,
        rawClass: r.rawNewClassName || r.newClassName
      }));

    const newClassOnly = (classListsData.inNewClassesNoMockResult || []).map(r => ({
      ...r,
      activeClass: r.newClassName,
      className: r.newClassName,
      rawClass: r.rawNewClassName || r.newClassName
    }));

    return [...matchedSnapshot, ...newClassOnly];
  }

  return allRecords.map(r => ({
    ...r,
    activeClass: r.className
  }));
}

/**
 * Switch active grouping: 'current' (Year 10) | 'new' (Year 11)
 */
function setActiveGrouping(grouping) {
  if (activeGrouping === grouping) return;
  activeGrouping = grouping;

  const btnCurrent = document.getElementById('btn-group-current');
  const btnNew = document.getElementById('btn-group-new');
  const hint = document.getElementById('view-switch-hint');

  if (activeGrouping === 'new') {
    btnNew?.classList.add('active');
    btnNew?.setAttribute('aria-checked', 'true');
    btnCurrent?.classList.remove('active');
    btnCurrent?.setAttribute('aria-checked', 'false');
    if (hint) hint.textContent = 'All sections, charts, filters, and exports are grouped by New classes (Year 11).';
  } else {
    btnCurrent?.classList.add('active');
    btnCurrent?.setAttribute('aria-checked', 'true');
    btnNew?.classList.remove('active');
    btnNew?.setAttribute('aria-checked', 'false');
    if (hint) hint.textContent = 'All sections, charts, filters, and exports are grouped by Current classes (Year 10).';
  }

  // Reset class dropdown filters so they don't hold an old class from the previous grouping
  distFilters.className = 'ALL';
  selectedTopPerformersClass = null;

  // Re-render all dashboard views
  renderOverviewSection();
  renderDistanceSection(true);
  renderStudentGroupsSection(true);
}

/**
 * Clear class lists from memory and reset UI
 */
function clearClassLists() {
  classListsData = null;
  stagedClassFiles = [];
  activeGrouping = 'current';

  const viewSwitchContainer = document.getElementById('view-switch-container');
  const mismatchSection = document.getElementById('section-class-mismatch-lists');
  const stagedWrapper = document.getElementById('staged-class-lists-wrapper');
  const clearBtn = document.getElementById('btn-clear-class-lists');
  const fileInput = document.getElementById('class-lists-input');
  const btnNo = document.getElementById('btn-new-classes-no');
  const btnYes = document.getElementById('btn-new-classes-yes');
  const uploadSec = document.getElementById('new-classes-upload-section');

  if (viewSwitchContainer) viewSwitchContainer.style.display = 'none';
  if (mismatchSection) mismatchSection.style.display = 'none';
  if (stagedWrapper) {
    stagedWrapper.innerHTML = '';
    stagedWrapper.style.display = 'none';
  }
  if (clearBtn) clearBtn.style.display = 'none';
  if (fileInput) fileInput.value = '';

  isNewClassesEnabled = false;
  btnNo?.classList.add('active');
  btnNo?.setAttribute('aria-pressed', 'true');
  btnYes?.classList.remove('active');
  btnYes?.setAttribute('aria-pressed', 'false');
  if (uploadSec) uploadSec.style.display = 'none';

  if (currentDiagnostics) {
    renderDiagnostics(currentDiagnostics, currentFileName, currentSnapshotName);
  }
}

/**
 * Render Section 1: Overview and Class Comparison
 */
function renderOverviewSection() {
  const section = document.getElementById('section-overview');
  if (!section || !allRecords || allRecords.length === 0) return;

  const activeRecords = getActiveRecords();

  // 1. Calculate Metrics
  cohortMetrics = calculateMetrics(activeRecords);
  classBreakdowns = calculateClassBreakdown(activeRecords);

  // 2. Headline Cards
  const hlStudents = document.getElementById('hl-students');
  const hlAvgGrade = document.getElementById('hl-avg-grade');
  const hlPct5Plus = document.getElementById('hl-pct-5plus');
  const hlPct4Plus = document.getElementById('hl-pct-4plus');
  const hlPct7Plus = document.getElementById('hl-pct-7plus');
  const hlUCount = document.getElementById('hl-u-count');
  const hlAvgProgress = document.getElementById('hl-avg-progress');
  const hlProgressCount = document.getElementById('hl-progress-count');

  if (hlStudents) hlStudents.textContent = cohortMetrics.studentsCount.toLocaleString();
  if (hlAvgGrade) {
    hlAvgGrade.textContent = cohortMetrics.averageGrade !== null ? cohortMetrics.averageGrade.toFixed(2) : '-';
  }
  if (hlPct5Plus) hlPct5Plus.textContent = formatPct(cohortMetrics.pct5Plus);
  if (hlPct4Plus) hlPct4Plus.textContent = formatPct(cohortMetrics.pct4Plus);
  if (hlPct7Plus) hlPct7Plus.textContent = formatPct(cohortMetrics.pct7Plus);
  if (hlUCount) hlUCount.textContent = cohortMetrics.uCount;
  
  if (hlAvgProgress) {
    hlAvgProgress.textContent = formatProgress(cohortMetrics.averageProgress);
    if (cohortMetrics.averageProgress !== null && cohortMetrics.averageProgress > 0) {
      hlAvgProgress.style.color = 'var(--brand-green)';
    } else if (cohortMetrics.averageProgress !== null && cohortMetrics.averageProgress < 0) {
      hlAvgProgress.style.color = '#dc2626';
    } else {
      hlAvgProgress.style.color = 'var(--text-primary)';
    }
  }

  if (hlProgressCount) {
    hlProgressCount.textContent = cohortMetrics.progressCount > 0
      ? `n = ${cohortMetrics.progressCount} with estimate`
      : 'No estimates recorded';
  }

  // 3. Render Comparison Table
  renderClassComparisonTable();

  // 4. Render Charts
  renderCharts();

  // 5. Display Section
  section.style.display = 'block';
}

/**
 * Render Class Comparison Table
 */
function renderClassComparisonTable() {
  const tbody = document.getElementById('comparison-table-body');
  if (!tbody || !classBreakdowns || classBreakdowns.length === 0) return;

  // Sort classes
  const sortedClasses = sortClasses(classBreakdowns, currentSortKey, currentSortDir);
  const extremes = calculateColumnExtremes(classBreakdowns);

  const getCellClass = (colKey, val) => {
    if (val === null || val === undefined || isNaN(val) || !extremes[colKey]) return '';
    if (val === extremes[colKey].max) return 'cell-highest';
    if (val === extremes[colKey].min) return 'cell-lowest';
    return '';
  };

  const rowsHtml = sortedClasses.map(c => {
    const smallGroupBadge = c.isSmallGroup
      ? `<span class="badge-small-group" title="Fewer than 10 students in class (${c.students} students)">⚠️ small group, read with care</span>`
      : '';

    const avgGradeDisplay = c.averageGrade !== null ? c.averageGrade.toFixed(2) : '<span style="color:var(--text-muted);">-</span>';
    const medianDisplay = c.medianGrade !== null ? c.medianGrade.toFixed(1) : '<span style="color:var(--text-muted);">-</span>';
    const progressDisplay = c.averageProgress !== null
      ? `${formatProgress(c.averageProgress)} <span style="font-size:11px;opacity:0.8;">(n=${c.progressCount})</span>`
      : '<span style="color:var(--text-muted);">-</span>';
    const attDisplay = c.averageAttendance !== null
      ? `${c.averageAttendance.toFixed(1)}%`
      : '<span style="color:var(--text-muted);">-</span>';

    return `
      <tr>
        <td title="Raw Class: ${escapeHtml(c.rawClass)}">
          <div class="class-name-cell">
            <span class="class-title">${escapeHtml(c.className)}</span>
            ${smallGroupBadge}
          </div>
        </td>
        <td class="${getCellClass('students', c.students)}">
          <strong>${c.students}</strong>
          <div class="class-results-ratio">results for ${c.satCount} of ${c.students} students</div>
        </td>
        <td class="${getCellClass('averageGrade', c.averageGrade)}">${avgGradeDisplay}</td>
        <td class="${getCellClass('medianGrade', c.medianGrade)}">${medianDisplay}</td>
        <td class="${getCellClass('pct5Plus', c.pct5Plus)}">${formatPct(c.pct5Plus)}</td>
        <td class="${getCellClass('pct4Plus', c.pct4Plus)}">${formatPct(c.pct4Plus)}</td>
        <td class="${getCellClass('pct7Plus', c.pct7Plus)}">${formatPct(c.pct7Plus)}</td>
        <td class="${getCellClass('uCount', c.uCount)}">${c.uCount}</td>
        <td class="${getCellClass('averageProgress', c.averageProgress)}">${progressDisplay}</td>
        <td class="${getCellClass('pctSENSupport', c.pctSENSupport)}">${formatPct(c.pctSENSupport)}</td>
        <td class="${getCellClass('pctDisadvantaged', c.pctDisadvantaged)}">${formatPct(c.pctDisadvantaged)}</td>
        <td class="${getCellClass('averageAttendance', c.averageAttendance)}">${attDisplay}</td>
      </tr>
    `;
  }).join('');

  // Cohort row
  const cohortAvgGrade = cohortMetrics?.averageGrade !== null ? cohortMetrics.averageGrade.toFixed(2) : '-';
  const cohortMedian = cohortMetrics?.medianGrade !== null ? cohortMetrics.medianGrade.toFixed(1) : '-';
  const cohortProgress = cohortMetrics?.averageProgress !== null
    ? `${formatProgress(cohortMetrics.averageProgress)} <span style="font-size:11px;opacity:0.8;">(n=${cohortMetrics.progressCount})</span>`
    : '-';
  const cohortAtt = cohortMetrics?.averageAttendance !== null ? `${cohortMetrics.averageAttendance.toFixed(1)}%` : '-';

  const cohortRowHtml = `
    <tr class="cohort-row">
      <td>
        <span class="cohort-badge">Cohort Total</span>
      </td>
      <td>
        <strong>${cohortMetrics ? cohortMetrics.studentsCount : 0}</strong>
        <div class="class-results-ratio">results for ${cohortMetrics ? cohortMetrics.satCount : 0} of ${cohortMetrics ? cohortMetrics.studentsCount : 0} students</div>
      </td>
      <td>${cohortAvgGrade}</td>
      <td>${cohortMedian}</td>
      <td>${cohortMetrics ? formatPct(cohortMetrics.pct5Plus) : '0.0%'}</td>
      <td>${cohortMetrics ? formatPct(cohortMetrics.pct4Plus) : '0.0%'}</td>
      <td>${cohortMetrics ? formatPct(cohortMetrics.pct7Plus) : '0.0%'}</td>
      <td>${cohortMetrics ? cohortMetrics.uCount : 0}</td>
      <td>${cohortProgress}</td>
      <td>${cohortMetrics ? formatPct(cohortMetrics.pctSENSupport) : '0.0%'}</td>
      <td>${cohortMetrics ? formatPct(cohortMetrics.pctDisadvantaged) : '0.0%'}</td>
      <td>${cohortAtt}</td>
    </tr>
  `;

  tbody.innerHTML = rowsHtml + cohortRowHtml;

  // Update header indicators
  const thList = document.querySelectorAll('#comparison-table-head-row th[data-sort-key]');
  thList.forEach(th => {
    const key = th.getAttribute('data-sort-key');
    const indicator = th.querySelector('.sort-indicator');
    if (key === currentSortKey) {
      th.classList.add('active-sort');
      if (indicator) indicator.textContent = currentSortDir === 'asc' ? '▲' : '▼';
    } else {
      th.classList.remove('active-sort');
      if (indicator) indicator.textContent = '↕';
    }
  });
}

/**
 * Render Charts: Bar Chart of Average Grade & Stacked Bar of Grade Distribution
 */
function renderCharts() {
  const avgBarsContainer = document.getElementById('chart-avg-grade-bars');
  const gradeDistContainer = document.getElementById('chart-grade-dist-bars');
  if (!classBreakdowns || classBreakdowns.length === 0) return;

  // Sorted by current rank/sort
  const sortedClasses = sortClasses(classBreakdowns, currentSortKey, currentSortDir);

  // 1. Average Grade Horizontal Bars
  if (avgBarsContainer) {
    const cohortAvg = cohortMetrics?.averageGrade || 0;
    const cohortPct = Math.min(100, Math.max(0, (cohortAvg / 9) * 100));

    // Cohort benchmark line position (label width 100px + gap 12px = 112px, bar track width calc)
    const benchmarkLineHtml = `
      <div class="chart-cohort-line" style="left: calc(112px + (100% - 174px) * ${cohortPct / 100});" title="Cohort Average: ${cohortAvg.toFixed(2)}"></div>
    `;

    const barsHtml = sortedClasses.map(c => {
      const avg = c.averageGrade !== null ? c.averageGrade : 0;
      const fillPct = Math.min(100, Math.max(0, (avg / 9) * 100));
      const valDisplay = c.averageGrade !== null ? c.averageGrade.toFixed(2) : 'N/A';

      return `
        <div class="bar-row">
          <div class="bar-row-label" title="${escapeHtml(c.className)} (${escapeHtml(c.rawClass)})">
            ${escapeHtml(c.className)}
          </div>
          <div class="bar-row-track">
            <div class="bar-row-fill" style="width: ${fillPct}%;" title="${escapeHtml(c.className)}: ${valDisplay} avg grade"></div>
          </div>
          <div class="bar-row-val">${valDisplay}</div>
        </div>
      `;
    }).join('');

    avgBarsContainer.innerHTML = benchmarkLineHtml + barsHtml;

    const subLabel = document.getElementById('chart-avg-grade-sub');
    if (subLabel) {
      subLabel.textContent = `Points average (scale 0–9) · Dashed line indicates cohort average (${cohortAvg.toFixed(2)})`;
    }
  }

  // 2. Stacked Bar Chart for Grade Distribution
  if (gradeDistContainer) {
    const stackedRowsHtml = sortedClasses.map(c => {
      const satCount = c.satCount || 0;
      let segmentsHtml = '';

      if (satCount === 0) {
        segmentsHtml = `<div class="stacked-segment" style="width: 100%; background: #94a3b8; font-size: 11px;">No sat entries</div>`;
      } else {
        GCSE_GRADES.forEach(grade => {
          const count = c.gradeDistribution[grade] || 0;
          if (count > 0) {
            const pct = (count / satCount) * 100;
            const color = GRADE_COLORS[grade];
            const textDisplay = pct >= 8 ? grade : '';
            segmentsHtml += `
              <div class="stacked-segment"
                   style="width: ${pct}%; background: ${color};"
                   title="${escapeHtml(c.className)} — Grade ${grade}: ${count} student${count > 1 ? 's' : ''} (${pct.toFixed(1)}%)">
                ${textDisplay}
              </div>
            `;
          }
        });
      }

      return `
        <div class="stacked-row">
          <div class="stacked-row-label" title="${escapeHtml(c.className)}">
            ${escapeHtml(c.className)}
          </div>
          <div class="stacked-bar-track">
            ${segmentsHtml}
          </div>
          <div class="stacked-row-total">${satCount} sat</div>
        </div>
      `;
    }).join('');

    gradeDistContainer.innerHTML = stackedRowsHtml;
  }
}

/**
 * Resolves student display name with respect to hideNames / privacy setting
 */
function getDisplayStudentName(record, isHidden, fallbackIndex) {
  if (!record) return 'Unknown Student';
  if (isHidden) {
    const fullName = `${record.surname || ''} ${record.firstName || ''}`.trim().toLowerCase();
    const nameKey = buildNameKey(record.surname, record.firstName);

    if (currentPseudonymMaps && currentPseudonymMaps.studentMap) {
      if (fullName && currentPseudonymMaps.studentMap.has(fullName)) {
        return currentPseudonymMaps.studentMap.get(fullName);
      }
      if (nameKey && currentPseudonymMaps.studentMap.has(nameKey)) {
        return currentPseudonymMaps.studentMap.get(nameKey);
      }
      if (record.studentKey && currentPseudonymMaps.studentMap.has(String(record.studentKey).toLowerCase())) {
        return currentPseudonymMaps.studentMap.get(String(record.studentKey).toLowerCase());
      }
    }
    return `Student ${fallbackIndex || record.id || 1}`;
  }

  const s = (record.surname || '').trim();
  const f = (record.firstName || '').trim();
  if (s && f) return `${s}, ${f}`;
  return s || f || 'Unnamed Student';
}

function renderGradeBadge(resultStr) {
  const res = String(resultStr || '').trim();
  if (res === 'Not sat' || res === '') {
    return `<span class="grade-badge" style="background:#f3f4f6; color:#4b5563; border:1px solid #d1d5db;">Not sat</span>`;
  }
  const color = GRADE_COLORS[res] || '#4b5563';
  return `<span class="grade-badge" style="background:${color}; color:#ffffff; font-weight:700;">${escapeHtml(res)}</span>`;
}

function renderGapBadge(gap) {
  if (gap === null || gap === undefined) {
    return `<span class="badge-gap" style="background:#f3f4f6; color:#9ca3af;">-</span>`;
  }
  if (gap === 0) {
    return `<span class="badge-gap badge-gap-0" title="At or above Grade 5 (gap 0)">0</span>`;
  }
  if (gap === 1) {
    return `<span class="badge-gap badge-gap-1" title="1 grade away (Grade 4)">1</span>`;
  }
  if (gap === 2) {
    return `<span class="badge-gap badge-gap-2" title="2 grades away (Grade 3)">2</span>`;
  }
  return `<span class="badge-gap badge-gap-high" title="${gap} grades away">${gap}</span>`;
}

function renderSENBadge(sen) {
  const val = String(sen || 'No SEN').trim();
  if (val === 'EHCP') {
    return `<span class="status-badge" style="background:#fef2f2; color:#991b1b; border:1px solid #fecaca; font-weight:700;">EHCP</span>`;
  }
  if (val === 'SEN Support') {
    return `<span class="status-badge" style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; font-weight:600;">SEN Support</span>`;
  }
  return `<span style="color:var(--text-muted); font-size:12.5px;">No SEN</span>`;
}

function renderDisadvBadge(disadvantaged) {
  const val = String(disadvantaged || 'No').trim();
  if (val === 'Yes') {
    return `<span class="status-badge" style="background:#fdf4ff; color:#86198f; border:1px solid #f5d0fe; font-weight:700;">Yes</span>`;
  }
  return `<span style="color:var(--text-muted); font-size:12.5px;">No</span>`;
}

function renderAttendanceBadge(att) {
  if (!att) return `<span style="color:var(--text-muted);">-</span>`;
  const clean = String(att).trim();
  const display = clean.includes('%') ? clean : `${clean}%`;
  const num = parseFloat(clean);
  if (!isNaN(num) && num < 90) {
    return `<span style="color:#b91c1c; font-weight:700;" title="Persistent Absence (&lt;90%)">${escapeHtml(display)} ⚠️</span>`;
  }
  return `<span>${escapeHtml(display)}</span>`;
}

function updateHideNamesButtons() {
  const quickBtn = document.getElementById('btn-quick-toggle-hide-names');
  if (quickBtn) {
    quickBtn.textContent = isNameHidden ? '👁️ Hide names: On' : '👁️ Hide names: Off';
    if (isNameHidden) {
      quickBtn.style.background = 'var(--brand-green-light)';
      quickBtn.style.borderColor = 'var(--brand-green-border)';
      quickBtn.style.color = 'var(--brand-green)';
    } else {
      quickBtn.style.background = '';
      quickBtn.style.borderColor = '';
      quickBtn.style.color = '';
    }
  }
  const settingCb = document.getElementById('setting-hide-names');
  if (settingCb) settingCb.checked = isNameHidden;
}

/**
 * Render Section 2: Distance from grade 5
 */
function renderDistanceSection(rebuildClassSelect = true) {
  const section = document.getElementById('section-distance-grade-5');
  if (!section || !allRecords || allRecords.length === 0) return;

  const activeRecords = getActiveRecords();

  // 1. Populate/Update Class Select
  const classSelect = document.getElementById('dist-filter-class');
  if (classSelect && rebuildClassSelect) {
    const prev = distFilters.className;
    const uniqueClasses = Array.from(new Set(activeRecords.map(r => r.className || 'Unknown Class')))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    let optHtml = '<option value="ALL">All classes</option>';
    uniqueClasses.forEach(c => {
      const isSel = (c === prev) ? 'selected' : '';
      optHtml += `<option value="${escapeHtml(c)}" ${isSel}>${escapeHtml(c)}</option>`;
    });
    classSelect.innerHTML = optHtml;
    if (uniqueClasses.includes(prev)) {
      classSelect.value = prev;
    } else {
      classSelect.value = 'ALL';
      distFilters.className = 'ALL';
    }
  }

  // 2. Sync filters to UI controls
  const senSelect = document.getElementById('dist-filter-sen');
  if (senSelect && senSelect.value !== distFilters.sen) senSelect.value = distFilters.sen;

  const disSelect = document.getElementById('dist-filter-disadvantaged');
  if (disSelect && disSelect.value !== distFilters.disadvantaged) disSelect.value = distFilters.disadvantaged;

  const bandSelect = document.getElementById('dist-filter-band');
  if (bandSelect && bandSelect.value !== distFilters.band) bandSelect.value = distFilters.band;

  // 3. Filter records
  const filtered = filterDistanceRecords(activeRecords, distFilters);

  // 4. Update count badge
  const countBadge = document.getElementById('dist-filter-count-badge');
  if (countBadge) {
    countBadge.textContent = `Showing ${filtered.length} of ${activeRecords.length} students`;
  }

  // 5. Component 1: Table by Class
  renderDistanceClassTable(filtered);

  // 6. Component 2: Farthest from grade 5
  renderFarthestFromGrade5(filtered);

  // 7. Component 3: Closest to grade 5 (all grade 4 students, by class)
  renderClosestToGrade5(filtered);

  // 8. Component 4: Estimate says 5+, result below 5
  renderEstimate5PlusShortfall(filtered);

  // 9. Show section
  section.style.display = 'block';
}

/**
 * Component 1: Distance from Grade 5 by Class
 */
function renderDistanceClassTable(records) {
  const tbody = document.getElementById('tbody-distance-by-class');
  if (!tbody) return;

  const { classes, cohort } = calculateDistanceBreakdownByClass(records);

  if (classes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state-banner">No student records match the active filter criteria.</td></tr>`;
    return;
  }

  const rowsHtml = classes.map(c => {
    const highlightClass = c.isHighestAvgGap ? 'class="highlight-highest-gap"' : '';
    const highestBadge = c.isHighestAvgGap
      ? `<span class="highest-gap-badge" title="Highest average gap among students below Grade 5">⚠️ Highest gap</span>`
      : '';
    const smallGroupBadge = c.isSmallGroup
      ? `<span class="small-group-badge" title="Small group (&lt;10 students). Interpret with care.">⚠️ small group</span>`
      : '';

    const avgGapDisplay = c.below5Count > 0
      ? `<strong>${c.averageGapBelow5.toFixed(2)}</strong> <span style="font-size:11.5px;color:var(--text-muted);">(n=${c.below5Count})</span> ${highestBadge}`
      : `<span style="color:var(--text-muted);">0.00</span> <span style="font-size:11.5px;color:var(--text-muted);">(0 below 5)</span>`;

    return `
      <tr ${highlightClass}>
        <td style="text-align: left;">
          <span title="${escapeHtml(c.rawClass || c.className)}" style="cursor:help;">
            <strong>${escapeHtml(c.className)}</strong>
          </span>
          ${smallGroupBadge}
        </td>
        <td><strong>${c.satCount}</strong></td>
        <td>${c.countAtOrAbove5} <span style="color:var(--text-muted);font-size:12px;">(${formatPct(c.pctAtOrAbove5)})</span></td>
        <td>${c.countOneAway} <span style="color:var(--text-muted);font-size:12px;">(${formatPct(c.pctOneAway)})</span></td>
        <td>${c.countTwoAway} <span style="color:var(--text-muted);font-size:12px;">(${formatPct(c.pctTwoAway)})</span></td>
        <td>${c.countThreeOrMoreAway} <span style="color:var(--text-muted);font-size:12px;">(${formatPct(c.pctThreeOrMoreAway)})</span></td>
        <td>${avgGapDisplay}</td>
      </tr>
    `;
  }).join('');

  const cohortAvgGap = cohort.below5Count > 0 && cohort.averageGapBelow5 !== null
    ? `<strong>${cohort.averageGapBelow5.toFixed(2)}</strong> <span style="font-size:11.5px;color:var(--text-muted);">(n=${cohort.below5Count})</span>`
    : `<span style="color:var(--text-muted);">0.00</span> <span style="font-size:11.5px;color:var(--text-muted);">(0 below 5)</span>`;

  const cohortRowHtml = `
    <tr class="cohort-total-row">
      <td style="text-align: left;"><strong>Cohort Total</strong></td>
      <td><strong>${cohort.satCount}</strong></td>
      <td><strong>${cohort.countAtOrAbove5}</strong> <span style="color:var(--text-muted);font-size:12px;">(${formatPct(cohort.pctAtOrAbove5)})</span></td>
      <td><strong>${cohort.countOneAway}</strong> <span style="color:var(--text-muted);font-size:12px;">(${formatPct(cohort.pctOneAway)})</span></td>
      <td><strong>${cohort.countTwoAway}</strong> <span style="color:var(--text-muted);font-size:12px;">(${formatPct(cohort.pctTwoAway)})</span></td>
      <td><strong>${cohort.countThreeOrMoreAway}</strong> <span style="color:var(--text-muted);font-size:12px;">(${formatPct(cohort.pctThreeOrMoreAway)})</span></td>
      <td>${cohortAvgGap}</td>
    </tr>
  `;

  tbody.innerHTML = rowsHtml + cohortRowHtml;
}

/**
 * Component 2: Farthest from grade 5 (sorted by gap descending)
 */
function renderFarthestFromGrade5(records) {
  const tbody = document.getElementById('tbody-farthest');
  const countBadge = document.getElementById('farthest-count-badge');
  if (!tbody) return;

  const farthestList = getFarthestFromGrade5(records);
  if (countBadge) {
    countBadge.textContent = `${farthestList.length} student${farthestList.length === 1 ? '' : 's'}`;
  }

  if (farthestList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state-banner">No sat students match the active filter criteria.</td></tr>`;
    return;
  }

  const rowsHtml = farthestList.map((s, idx) => {
    const studentName = getDisplayStudentName(s, isNameHidden, idx + 1);
    const estDisplay = s.estimate !== null ? s.estimate.toFixed(1) : '-';

    return `
      <tr>
        <td style="text-align: left;"><strong>${escapeHtml(studentName)}</strong></td>
        <td style="text-align: left;">${escapeHtml(s.className)}</td>
        <td>${renderGradeBadge(s.result)}</td>
        <td>${estDisplay}</td>
        <td>${renderGapBadge(s.gap)}</td>
        <td>${renderSENBadge(s.sen)}</td>
        <td>${renderDisadvBadge(s.disadvantaged)}</td>
        <td>${renderAttendanceBadge(s.attendance)}</td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;
}

/**
 * Component 3: Closest to grade 5 (all grade 4 students, by class)
 */
function renderClosestToGrade5(records) {
  const container = document.getElementById('closest-classes-container');
  const countBadge = document.getElementById('closest-count-badge');
  if (!container) return;

  const grouped = getClosestToGrade5ByClass(records);
  const classNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  let totalStudents = 0;
  classNames.forEach(c => { totalStudents += grouped[c].length; });

  if (countBadge) {
    countBadge.textContent = `${totalStudents} student${totalStudents === 1 ? '' : 's'} (Grade 4)`;
  }

  if (totalStudents === 0) {
    container.innerHTML = `<div class="empty-state-banner">No Grade 4 students found matching the selected filter criteria.</div>`;
    return;
  }

  const cardsHtml = classNames.map(cName => {
    const students = grouped[cName];
    const studentRows = students.map((s, idx) => {
      const studentName = getDisplayStudentName(s, isNameHidden, idx + 1);
      const estDisplay = s.estimate !== null ? s.estimate.toFixed(1) : '-';

      return `
        <tr>
          <td style="text-align: left;"><strong>${escapeHtml(studentName)}</strong></td>
          <td style="text-align: left;">${escapeHtml(s.className)}</td>
          <td>${renderGradeBadge(s.result)}</td>
          <td>${estDisplay}</td>
          <td><span class="badge-gap badge-gap-1" title="1 grade away from Grade 5">1 grade</span></td>
          <td>${renderSENBadge(s.sen)}</td>
          <td>${renderDisadvBadge(s.disadvantaged)}</td>
          <td>${renderAttendanceBadge(s.attendance)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="closest-class-card">
        <div class="closest-class-header">
          <div class="closest-class-title">
            <span>📁</span>
            <span>Class ${escapeHtml(cName)}</span>
          </div>
          <span class="closest-class-count-tag">${students.length} student${students.length > 1 ? 's' : ''} (Grade 4)</span>
        </div>
        <div class="table-responsive">
          <table class="comparison-table student-detail-table">
            <thead>
              <tr>
                <th style="text-align: left;">Name</th>
                <th style="text-align: left;">Class</th>
                <th>Result</th>
                <th>Estimate</th>
                <th>Gap</th>
                <th>SEN</th>
                <th>Disadvantaged</th>
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              ${studentRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = cardsHtml;
}

/**
 * Component 4: Estimate says 5+, result below 5
 */
function renderEstimate5PlusShortfall(records) {
  const tbody = document.getElementById('tbody-estimate-shortfall');
  const countBadge = document.getElementById('shortfall-count-badge');
  if (!tbody) return;

  const list = getEstimate5PlusShortfall(records);

  if (countBadge) {
    countBadge.textContent = `${list.length} student${list.length === 1 ? '' : 's'}`;
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state-banner">No students with estimate ≥ 5.0 and result &lt; 5 match the current filters.</td></tr>`;
    return;
  }

  const rowsHtml = list.map((s, idx) => {
    const studentName = getDisplayStudentName(s, isNameHidden, idx + 1);

    return `
      <tr>
        <td style="text-align: left;"><strong>${escapeHtml(studentName)}</strong></td>
        <td style="text-align: left;">${escapeHtml(s.className)}</td>
        <td>${renderGradeBadge(s.result)}</td>
        <td><strong>${s.estimate.toFixed(1)}</strong></td>
        <td><span class="badge-shortfall">-${s.shortfall.toFixed(1)} grades</span></td>
        <td>${renderGapBadge(s.gap)}</td>
        <td>${renderSENBadge(s.sen)}</td>
        <td>${renderDisadvBadge(s.disadvantaged)}</td>
        <td>${renderAttendanceBadge(s.attendance)}</td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;
}

/**
 * -------------------------------------------------------------
 * SECTION 3: Student Groups & Top Performers
 * -------------------------------------------------------------
 */

function renderStudentGroupsSection(resetSelection = false) {
  const section = document.getElementById('section-student-groups');
  if (!section) return;

  if (!allRecords || allRecords.length === 0) {
    section.style.display = 'none';
    return;
  }

  // 1. Cohort-Level Groups Summary Table
  renderCohortStudentGroups();

  // 2. Expandable Breakdown per Class
  renderClassStudentGroupsBreakdown();

  // 3. Top Performers per Class
  renderTopPerformers(resetSelection);

  section.style.display = 'block';
}

/**
 * 1. Cohort Breakdown by Student Group
 */
function renderCohortStudentGroups() {
  const tbody = document.getElementById('tbody-cohort-student-groups');
  const countBadge = document.getElementById('cohort-groups-count-badge');
  if (!tbody) return;

  const activeRecords = getActiveRecords();
  const hasClassLists = Boolean(classListsData);
  const categories = calculateStudentGroupsBreakdown(activeRecords, activeRecords, { includeEAL: hasClassLists });

  if (countBadge) {
    const catLabel = hasClassLists ? '6 categories (including EAL)' : '5 categories';
    countBadge.textContent = `${activeRecords.length} students across ${catLabel}`;
  }

  let html = '';
  categories.forEach(cat => {
    html += `
      <tr class="category-group-row">
        <td colspan="6">
          <span style="display:inline-flex; align-items:center; gap:6px;">
            📁 <strong>${escapeHtml(cat.category)}</strong>
          </span>
        </td>
      </tr>
    `;

    cat.groups.forEach(group => {
      const avgGradeDisplay = group.tooFew
        ? `<span class="too-few-suppressed">-</span> <span class="too-few-tag">too few to compare</span>`
        : (group.averageGrade !== null ? `<strong>${group.averageGrade.toFixed(2)}</strong>` : `<span style="color:var(--text-muted);">-</span>`);

      const pct5PlusDisplay = group.tooFew
        ? `<span class="too-few-suppressed">-</span> <span class="too-few-tag">too few to compare</span>`
        : (group.satCount > 0 ? `<strong>${formatPct(group.pct5Plus)}</strong>` : `<span style="color:var(--text-muted);">-</span>`);

      const progressDisplay = group.tooFew
        ? `<span class="too-few-suppressed">-</span> <span class="too-few-tag">too few to compare</span>`
        : (group.averageProgress !== null ? `${formatProgress(group.averageProgress)} <span style="font-size:11.5px;color:var(--text-muted);">(n=${group.progressCount})</span>` : `<span style="color:var(--text-muted);">-</span>`);

      let gapDisplay = '';
      if (group.tooFew) {
        gapDisplay = `<span class="too-few-suppressed">-</span> <span class="too-few-tag">too few to compare</span>`;
      } else {
        const parts = [];
        if (group.gradeGap !== null) {
          const sign = group.gradeGap > 0 ? '+' : '';
          const cls = group.gradeGap > 0 ? 'badge-gap-pos' : (group.gradeGap < 0 ? 'badge-gap-neg' : 'badge-gap-neutral');
          parts.push(`<span class="${cls}">${sign}${group.gradeGap.toFixed(1)} grades</span>`);
        }
        if (group.progressGap !== null) {
          const sign = group.progressGap > 0 ? '+' : '';
          const cls = group.progressGap > 0 ? 'badge-gap-pos' : (group.progressGap < 0 ? 'badge-gap-neg' : 'badge-gap-neutral');
          parts.push(`<span class="${cls}" style="font-size:12px;">Prog: ${sign}${group.progressGap.toFixed(2)}</span>`);
        }
        gapDisplay = parts.length > 0 ? parts.join(' <span style="color:var(--text-muted);">·</span> ') : `<span style="color:var(--text-muted);">-</span>`;
      }

      html += `
        <tr>
          <td style="text-align: left;"><strong>${escapeHtml(group.name)}</strong></td>
          <td><strong>${group.studentsCount}</strong></td>
          <td>${avgGradeDisplay}</td>
          <td>${pct5PlusDisplay}</td>
          <td>${progressDisplay}</td>
          <td>${gapDisplay}</td>
        </tr>
      `;
    });
  });

  tbody.innerHTML = html;
}

/**
 * 2. Breakdown per Class (Expandable)
 */
function renderClassStudentGroupsBreakdown() {
  const container = document.getElementById('classes-group-accordion-container');
  if (!container) return;

  const activeRecords = getActiveRecords();
  const hasClassLists = Boolean(classListsData);
  const classBreakdowns = calculateGroupBreakdownPerClass(activeRecords, { includeEAL: hasClassLists });

  if (classBreakdowns.length === 0) {
    container.innerHTML = `<div class="empty-state-banner">No classes found in the active dataset.</div>`;
    return;
  }

  let html = '';
  classBreakdowns.forEach((c, cIdx) => {
    let tableRows = '';

    c.breakdown.forEach(cat => {
      tableRows += `
        <tr class="category-group-row">
          <td colspan="6">
            <span style="display:inline-flex; align-items:center; gap:6px;">
              📁 <strong>${escapeHtml(cat.category)}</strong>
            </span>
          </td>
        </tr>
      `;

      cat.groups.forEach(group => {
        // Small group rule: If a group has fewer than 5 students in a class, show the count but grey out percentages with note "too few to compare"
        const avgGradeDisplay = group.tooFew
          ? `<span class="too-few-suppressed">-</span> <span class="too-few-tag">too few to compare</span>`
          : (group.averageGrade !== null ? `<strong>${group.averageGrade.toFixed(2)}</strong>` : `<span style="color:var(--text-muted);">-</span>`);

        const pct5PlusDisplay = group.tooFew
          ? `<span class="too-few-suppressed">-</span> <span class="too-few-tag">too few to compare</span>`
          : (group.satCount > 0 ? `<strong>${formatPct(group.pct5Plus)}</strong>` : `<span style="color:var(--text-muted);">-</span>`);

        const progressDisplay = group.tooFew
          ? `<span class="too-few-suppressed">-</span> <span class="too-few-tag">too few to compare</span>`
          : (group.averageProgress !== null ? `${formatProgress(group.averageProgress)} <span style="font-size:11.5px;color:var(--text-muted);">(n=${group.progressCount})</span>` : `<span style="color:var(--text-muted);">-</span>`);

        let gapDisplay = '';
        if (group.tooFew) {
          gapDisplay = `<span class="too-few-suppressed">-</span> <span class="too-few-tag">too few to compare</span>`;
        } else {
          const parts = [];
          if (group.gradeGap !== null) {
            const sign = group.gradeGap > 0 ? '+' : '';
            const cls = group.gradeGap > 0 ? 'badge-gap-pos' : (group.gradeGap < 0 ? 'badge-gap-neg' : 'badge-gap-neutral');
            parts.push(`<span class="${cls}">${sign}${group.gradeGap.toFixed(1)} grades</span>`);
          }
          if (group.progressGap !== null) {
            const sign = group.progressGap > 0 ? '+' : '';
            const cls = group.progressGap > 0 ? 'badge-gap-pos' : (group.progressGap < 0 ? 'badge-gap-neg' : 'badge-gap-neutral');
            parts.push(`<span class="${cls}" style="font-size:12px;">Prog: ${sign}${group.progressGap.toFixed(2)}</span>`);
          }
          gapDisplay = parts.length > 0 ? parts.join(' <span style="color:var(--text-muted);">·</span> ') : `<span style="color:var(--text-muted);">-</span>`;
        }

        tableRows += `
          <tr>
            <td style="text-align: left;"><strong>${escapeHtml(group.name)}</strong></td>
            <td><strong>${group.studentsCount}</strong></td>
            <td>${avgGradeDisplay}</td>
            <td>${pct5PlusDisplay}</td>
            <td>${progressDisplay}</td>
            <td>${gapDisplay}</td>
          </tr>
        `;
      });
    });

    // Expand the first class by default for immediate discoverability
    const isFirst = cIdx === 0;
    const classSatCount = activeRecords.filter(r => (r.activeClass || r.className) === c.className && !r.isNotSat && r.points !== null && !isNaN(r.points)).length;

    html += `
      <div class="class-accordion-item" data-class-name="${escapeHtml(c.className)}">
        <button type="button" class="class-accordion-header ${isFirst ? 'active' : ''}" aria-expanded="${isFirst ? 'true' : 'false'}">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>📁</span>
            <span>Class <strong>${escapeHtml(c.className)}</strong></span>
            <span style="font-size: 12px; font-weight: normal; color: var(--text-muted);">(${escapeHtml(c.rawClass)})</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="table-count-tag">${c.studentsCount} students (results for ${classSatCount} of ${c.studentsCount} students)</span>
            <span class="accordion-chevron">▼</span>
          </div>
        </button>
        <div class="class-accordion-body" style="display: ${isFirst ? 'block' : 'none'};">
          <div class="table-responsive">
            <table class="comparison-table">
              <thead>
                <tr>
                  <th style="text-align: left;">Group</th>
                  <th>Students</th>
                  <th>Average Grade</th>
                  <th>% 5+</th>
                  <th>Average Progress (with n)</th>
                  <th>Gap vs Cohort Rest</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Bind accordion click handlers
  const headers = container.querySelectorAll('.class-accordion-header');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling;
      if (!body) return;
      const isOpen = header.classList.contains('active');
      if (isOpen) {
        header.classList.remove('active');
        header.setAttribute('aria-expanded', 'false');
        body.style.display = 'none';
      } else {
        header.classList.add('active');
        header.setAttribute('aria-expanded', 'true');
        body.style.display = 'block';
      }
    });
  });
}

/**
 * 3. Top Performers per Class
 */
function renderTopPerformers(resetSelection = false) {
  const container = document.getElementById('top-performers-content-container');
  const classSelect = document.getElementById('top-performers-class-select');
  if (!container || !classSelect) return;

  const activeRecords = getActiveRecords();
  const performersMap = getTopPerformersByClass(activeRecords);
  const classNames = Object.keys(performersMap);

  if (classNames.length === 0) {
    container.innerHTML = `<div class="empty-state-banner">No class assessment records available for top performers.</div>`;
    classSelect.innerHTML = `<option value="">No classes</option>`;
    return;
  }

  // Populate dropdown options
  const selectHtml = classNames.map(cName => {
    const isSelected = (!resetSelection && selectedTopPerformersClass === cName) ? 'selected' : '';
    const satCount = performersMap[cName].satCount !== undefined ? performersMap[cName].satCount : performersMap[cName].totalStudents;
    return `<option value="${escapeHtml(cName)}" ${isSelected}>Class ${escapeHtml(cName)} (${performersMap[cName].totalStudents} students · results for ${satCount} of ${performersMap[cName].totalStudents} students)</option>`;
  }).join('');

  classSelect.innerHTML = selectHtml;

  if (resetSelection || !selectedTopPerformersClass || !performersMap[selectedTopPerformersClass]) {
    selectedTopPerformersClass = classNames[0];
  }
  classSelect.value = selectedTopPerformersClass;

  const targetClassData = performersMap[selectedTopPerformersClass];
  if (!targetClassData) {
    container.innerHTML = `<div class="empty-state-banner">Please select a class to view top performers.</div>`;
    return;
  }

  // Render 3 Cards:
  // 1. Top 5 by Points
  // 2. 5 Biggest Positive Progress Scores
  // 3. 5 Biggest Negative Progress Scores
  const { topPoints, positiveProgress, negativeProgress, className } = targetClassData;

  // Card 1: Top 5 by Points (tie break: higher progress)
  let topPointsHtml = '';
  if (topPoints.length === 0) {
    topPointsHtml = `<tr><td colspan="6" class="empty-state-banner">No sat students in this class.</td></tr>`;
  } else {
    topPointsHtml = topPoints.map((s, idx) => {
      const studentName = getDisplayStudentName(s, isNameHidden, idx + 1);
      const estDisplay = s.estimate !== null ? s.estimate.toFixed(1) : '-';
      const progDisplay = s.progress !== null ? formatProgress(s.progress) : '-';

      return `
        <tr>
          <td style="font-weight: 700; color: var(--text-secondary); width: 36px; text-align: center;">${idx + 1}</td>
          <td style="text-align: left;"><strong>${escapeHtml(studentName)}</strong></td>
          <td>${renderGradeBadge(s.result)}</td>
          <td>${estDisplay}</td>
          <td><strong>${progDisplay}</strong></td>
          <td style="font-size: 11.5px; text-align: left;">
            ${renderSENBadge(s.sen)} ${renderDisadvBadge(s.disadvantaged)}
          </td>
        </tr>
      `;
    }).join('');
  }

  // Card 2: 5 Biggest Positive Progress Scores
  let posProgHtml = '';
  if (positiveProgress.length === 0) {
    posProgHtml = `<tr><td colspan="6" class="empty-state-banner">No students with positive progress in this class.</td></tr>`;
  } else {
    posProgHtml = positiveProgress.map((s, idx) => {
      const studentName = getDisplayStudentName(s, isNameHidden, idx + 1);
      const estDisplay = s.estimate !== null ? s.estimate.toFixed(1) : '-';

      return `
        <tr>
          <td style="font-weight: 700; color: var(--text-secondary); width: 36px; text-align: center;">${idx + 1}</td>
          <td style="text-align: left;"><strong>${escapeHtml(studentName)}</strong></td>
          <td><span class="badge-prog-pos">+${s.progress.toFixed(2)}</span></td>
          <td>${renderGradeBadge(s.result)}</td>
          <td>${estDisplay}</td>
          <td style="font-size: 11.5px; text-align: left;">
            ${renderSENBadge(s.sen)} ${renderDisadvBadge(s.disadvantaged)}
          </td>
        </tr>
      `;
    }).join('');
  }

  // Card 3: 5 Biggest Negative Progress Scores
  let negProgHtml = '';
  if (negativeProgress.length === 0) {
    negProgHtml = `<tr><td colspan="6" class="empty-state-banner">No students with negative progress in this class.</td></tr>`;
  } else {
    negProgHtml = negativeProgress.map((s, idx) => {
      const studentName = getDisplayStudentName(s, isNameHidden, idx + 1);
      const estDisplay = s.estimate !== null ? s.estimate.toFixed(1) : '-';

      return `
        <tr>
          <td style="font-weight: 700; color: var(--text-secondary); width: 36px; text-align: center;">${idx + 1}</td>
          <td style="text-align: left;"><strong>${escapeHtml(studentName)}</strong></td>
          <td><span class="badge-prog-neg">${s.progress.toFixed(2)}</span></td>
          <td>${renderGradeBadge(s.result)}</td>
          <td>${estDisplay}</td>
          <td style="font-size: 11.5px; text-align: left;">
            ${renderSENBadge(s.sen)} ${renderDisadvBadge(s.disadvantaged)}
          </td>
        </tr>
      `;
    }).join('');
  }

  container.innerHTML = `
    <div class="top-performers-grid">
      <!-- 1. Top 5 Points -->
      <div class="top-performer-card">
        <div class="top-performer-card-header top-card-points">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>⭐</span>
            <span>Top 5 by Points</span>
          </div>
          <span style="font-size:11.5px; font-weight:600; opacity:0.85;">Class ${escapeHtml(className)}</span>
        </div>
        <div class="table-responsive">
          <table class="comparison-table student-detail-table">
            <thead>
              <tr>
                <th style="width:36px; text-align:center;">#</th>
                <th style="text-align:left;">Name</th>
                <th>Result</th>
                <th>Estimate</th>
                <th>Progress</th>
                <th style="text-align:left;">Context</th>
              </tr>
            </thead>
            <tbody>
              ${topPointsHtml}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 2. 5 Biggest Positive Progress -->
      <div class="top-performer-card">
        <div class="top-performer-card-header top-card-pos-prog">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>📈</span>
            <span>5 Biggest Positive Progress</span>
          </div>
          <span style="font-size:11.5px; font-weight:600; opacity:0.85;">Estimate only</span>
        </div>
        <div class="table-responsive">
          <table class="comparison-table student-detail-table">
            <thead>
              <tr>
                <th style="width:36px; text-align:center;">#</th>
                <th style="text-align:left;">Name</th>
                <th>Progress</th>
                <th>Result</th>
                <th>Estimate</th>
                <th style="text-align:left;">Context</th>
              </tr>
            </thead>
            <tbody>
              ${posProgHtml}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 3. 5 Biggest Negative Progress -->
      <div class="top-performer-card">
        <div class="top-performer-card-header top-card-neg-prog">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>📉</span>
            <span>5 Biggest Negative Progress</span>
          </div>
          <span style="font-size:11.5px; font-weight:600; opacity:0.85;">Estimate only</span>
        </div>
        <div class="table-responsive">
          <table class="comparison-table student-detail-table">
            <thead>
              <tr>
                <th style="width:36px; text-align:center;">#</th>
                <th style="text-align:left;">Name</th>
                <th>Progress</th>
                <th>Result</th>
                <th>Estimate</th>
                <th style="text-align:left;">Context</th>
              </tr>
            </thead>
            <tbody>
              ${negProgHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Two Lists: Always visible when class lists are loaded:
 * 1. "In new classes, no mock result" (by new class)
 * 2. "In the snapshot, not in any new class"
 */
function renderClassMismatchLists() {
  const section = document.getElementById('section-class-mismatch-lists');
  const containerNoMock = document.getElementById('container-new-classes-no-mock');
  const containerNotInNew = document.getElementById('container-snapshot-not-in-new');
  const badgeNoMock = document.getElementById('badge-no-mock-count');
  const badgeNotInNew = document.getElementById('badge-snapshot-not-new-count');

  if (!section) return;

  if (!classListsData) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  // 1. In new classes, no mock result (by new class)
  const noMockList = classListsData.inNewClassesNoMockResult || [];
  if (badgeNoMock) badgeNoMock.textContent = noMockList.length;

  if (containerNoMock) {
    if (noMockList.length === 0) {
      containerNoMock.innerHTML = `
        <div style="color: var(--text-muted); font-size: 13px; padding: 12px 4px; text-align: center;">
          ✓ All students in new classes have a mock exam result recorded.
        </div>
      `;
    } else {
      // Group by new class name
      const byClass = new Map();
      noMockList.forEach(s => {
        const cName = s.newClassName || 'Unassigned';
        if (!byClass.has(cName)) byClass.set(cName, []);
        byClass.get(cName).push(s);
      });

      const sortedClasses = Array.from(byClass.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      let html = '';
      sortedClasses.forEach(cName => {
        const students = byClass.get(cName);
        const rowsHtml = students.map((s, idx) => {
          const displayName = getDisplayStudentName(s, isNameHidden, idx + 1);
          return `
            <tr>
              <td style="text-align: left;"><strong>${escapeHtml(displayName)}</strong></td>
              <td style="color: var(--text-muted); font-size: 12px;">${escapeHtml(s.admissionNumber || '-')}</td>
              <td>${renderSENBadge(s.sen)}</td>
              <td>${renderDisadvBadge(s.disadvantaged)}</td>
              <td>${s.eal === 'Yes' ? '<span class="status-badge" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; font-weight:700;">Yes</span>' : '<span style="color:var(--text-muted); font-size:12.5px;">No</span>'}</td>
            </tr>
          `;
        }).join('');

        html += `
          <div style="margin-bottom: 14px;">
            <div class="mismatch-group-header">
              ${escapeHtml(cName)} <span style="font-weight: 500; opacity: 0.85;">(${students.length} student${students.length === 1 ? '' : 's'})</span>
            </div>
            <div class="table-responsive">
              <table class="comparison-table student-detail-table">
                <thead>
                  <tr>
                    <th style="text-align: left;">Name</th>
                    <th>Adm No</th>
                    <th>SEN</th>
                    <th>Disadvantaged</th>
                    <th>EAL</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        `;
      });

      containerNoMock.innerHTML = html;
    }
  }

  // 2. In the snapshot, not in any new class
  const notInNewList = classListsData.inSnapshotNotInNewClass || [];
  if (badgeNotInNew) badgeNotInNew.textContent = notInNewList.length;

  if (containerNotInNew) {
    if (notInNewList.length === 0) {
      containerNotInNew.innerHTML = `
        <div style="color: var(--text-muted); font-size: 13px; padding: 12px 4px; text-align: center;">
          ✓ All snapshot students have been allocated to a new class.
        </div>
      `;
    } else {
      const rowsHtml = notInNewList.map((s, idx) => {
        const displayName = getDisplayStudentName(s, isNameHidden, idx + 1);
        const resultDisplay = s.result !== null && s.result !== undefined && s.result !== '' ? s.result : '-';
        const progDisplay = s.progress !== null && !isNaN(s.progress) ? formatProgress(s.progress) : '-';

        return `
          <tr>
            <td style="text-align: left;"><strong>${escapeHtml(displayName)}</strong></td>
            <td>${escapeHtml(s.className || 'Unknown')}</td>
            <td><strong>${renderGradeBadge(resultDisplay)}</strong></td>
            <td>${s.points !== null ? s.points : '-'}</td>
            <td>${progDisplay}</td>
            <td>${renderSENBadge(s.sen)}</td>
            <td>${renderDisadvBadge(s.disadvantaged)}</td>
          </tr>
        `;
      }).join('');

      containerNotInNew.innerHTML = `
        <div class="table-responsive">
          <table class="comparison-table student-detail-table">
            <thead>
              <tr>
                <th style="text-align: left;">Name</th>
                <th>Current Class</th>
                <th>Result</th>
                <th>Points</th>
                <th>Progress</th>
                <th>SEN</th>
                <th>Disadvantaged</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
    }
  }
}

/**
 * Setup event listeners for "Are students in new classes?" panel and class list uploads
 */
function initNewClassesHandlers() {
  const btnNo = document.getElementById('btn-new-classes-no');
  const btnYes = document.getElementById('btn-new-classes-yes');
  const uploadSection = document.getElementById('new-classes-upload-section');
  const fileInput = document.getElementById('class-lists-input');
  const browseBtn = document.getElementById('btn-browse-class-lists');
  const clearBtn = document.getElementById('btn-clear-class-lists');
  const dropzoneClassLists = document.getElementById('dropzone-class-lists');

  const btnGroupCurrent = document.getElementById('btn-group-current');
  const btnGroupNew = document.getElementById('btn-group-new');

  // Toggle Yes / No
  if (btnNo && btnYes && uploadSection) {
    btnNo.addEventListener('click', () => {
      isNewClassesEnabled = false;
      btnNo.classList.add('active');
      btnNo.setAttribute('aria-pressed', 'true');
      btnYes.classList.remove('active');
      btnYes.setAttribute('aria-pressed', 'false');
      uploadSection.style.display = 'none';
      if (classListsData) {
        clearClassLists();
        renderOverviewSection();
        renderDistanceSection(true);
        renderStudentGroupsSection(true);
      }
    });

    btnYes.addEventListener('click', () => {
      isNewClassesEnabled = true;
      btnYes.classList.add('active');
      btnYes.setAttribute('aria-pressed', 'true');
      btnNo.classList.remove('active');
      btnNo.setAttribute('aria-pressed', 'false');
      uploadSection.style.display = 'block';
    });
  }

  // Browse files button
  if (browseBtn && fileInput) {
    browseBtn.addEventListener('click', () => fileInput.click());
  }

  // Clear class lists button
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearClassLists();
      renderOverviewSection();
      renderDistanceSection(true);
      renderStudentGroupsSection(true);
      showToast('Class lists removed.');
    });
  }

  // Group by buttons (View Switch)
  if (btnGroupCurrent && btnGroupNew) {
    btnGroupCurrent.addEventListener('click', () => {
      setActiveGrouping('current');
    });
    btnGroupNew.addEventListener('click', () => {
      setActiveGrouping('new');
    });
  }

  // File selection
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        await handleClassListFiles(files);
      }
    });
  }

  // Drag and drop for class lists dropzone
  if (dropzoneClassLists) {
    dropzoneClassLists.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzoneClassLists.classList.add('drag-over');
    });
    dropzoneClassLists.addEventListener('dragleave', () => {
      dropzoneClassLists.classList.remove('drag-over');
    });
    dropzoneClassLists.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzoneClassLists.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) {
        await handleClassListFiles(files);
      }
    });
  }
}

/**
 * Handle uploaded class list files (supports multiple files at once)
 */
async function handleClassListFiles(files) {
  const errorEl = document.getElementById('class-lists-error');
  if (errorEl) errorEl.style.display = 'none';

  try {
    stagedClassFiles = [];

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      const parsed = parseClassListFile(rawMatrix, file.name);
      stagedClassFiles.push({
        fileName: file.name,
        defaultClassName: parsed.defaultClassName,
        confirmedClassName: parsed.defaultClassName,
        hasClassColumn: parsed.hasClassColumn,
        students: parsed.students
      });
    }

    renderStagedClassFiles();
  } catch (err) {
    console.error('Failed to parse class lists:', err);
    if (errorEl) {
      errorEl.textContent = `Error reading class lists: ${err.message}`;
      errorEl.style.display = 'block';
    }
  }
}

/**
 * Render staged files preview and editable boxes before confirming
 */
function renderStagedClassFiles() {
  const stagedWrapper = document.getElementById('staged-class-lists-wrapper');
  if (!stagedWrapper) return;

  if (stagedClassFiles.length === 0) {
    stagedWrapper.innerHTML = '';
    stagedWrapper.style.display = 'none';
    return;
  }

  let rowsHtml = '';
  stagedClassFiles.forEach((fileItem, idx) => {
    if (fileItem.hasClassColumn) {
      const distinctClasses = Array.from(new Set(fileItem.students.map(s => s.newClassName).filter(Boolean)));
      rowsHtml += `
        <div class="staged-file-row">
          <div class="staged-file-info">
            <span>📄</span>
            <strong>${escapeHtml(fileItem.fileName)}</strong>
            <span style="font-size: 12px; color: var(--text-muted);">
              (${fileItem.students.length} students · contains Class column: <em>${escapeHtml(distinctClasses.join(', '))}</em>)
            </span>
          </div>
          <span style="font-size: 12px; color: #166534; font-weight: 600;">✓ Uses file's Class column</span>
        </div>
      `;
    } else {
      rowsHtml += `
        <div class="staged-file-row">
          <div class="staged-file-info">
            <span>📄</span>
            <strong>${escapeHtml(fileItem.fileName)}</strong>
            <span style="font-size: 12px; color: var(--text-muted);">(${fileItem.students.length} students)</span>
          </div>
          <div class="staged-file-input-wrapper">
            <label for="input-class-name-${idx}">Class name:</label>
            <input type="text"
                   id="input-class-name-${idx}"
                   class="input-staged-class-name"
                   data-file-index="${idx}"
                   value="${escapeHtml(fileItem.confirmedClassName)}"
                   placeholder="e.g. 11 Sp1" />
          </div>
        </div>
      `;
    }
  });

  stagedWrapper.innerHTML = `
    <div class="staged-class-files-card">
      <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">
        Review &amp; Confirm Class Names (${stagedClassFiles.length} ${stagedClassFiles.length === 1 ? 'file' : 'files'})
      </div>
      <p style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 12px;">
        Confirm each class name below before merging into the active snapshot. You can edit the class names directly if needed.
      </p>
      <div class="staged-files-list">
        ${rowsHtml}
      </div>
      <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px; flex-wrap: wrap;">
        <button type="button" class="btn-confirm-classes" id="btn-confirm-class-lists">Confirm &amp; Apply Class Lists</button>
      </div>
    </div>
  `;

  stagedWrapper.style.display = 'block';

  // Wire confirm button
  const confirmBtn = document.getElementById('btn-confirm-class-lists');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      confirmAndApplyClassLists();
    });
  }
}

/**
 * Confirms staged class names and merges into snapshot
 */
function confirmAndApplyClassLists() {
  const stagedInputs = document.querySelectorAll('.input-staged-class-name');
  stagedInputs.forEach(input => {
    const idx = parseInt(input.getAttribute('data-file-index'), 10);
    const val = input.value.trim();
    if (!isNaN(idx) && stagedClassFiles[idx]) {
      stagedClassFiles[idx].confirmedClassName = val || stagedClassFiles[idx].defaultClassName;
      // Also update students in this file
      stagedClassFiles[idx].students.forEach(st => {
        st.newClassName = stagedClassFiles[idx].confirmedClassName;
      });
    }
  });

  // Flatten all students
  const allNewClassStudents = [];
  stagedClassFiles.forEach(fileItem => {
    fileItem.students.forEach(s => {
      allNewClassStudents.push(s);
    });
  });

  if (allRecords.length === 0) {
    showToast(`Loaded ${allNewClassStudents.length} students from class lists. Please upload a mock snapshot to compare.`);
    return;
  }

  // Merge into snapshot
  const mergeResult = mergeClassListsIntoSnapshot(allRecords, allNewClassStudents);
  classListsData = {
    ...mergeResult,
    allNewClassStudents
  };

  // Switch to New classes by default once class lists are loaded
  activeGrouping = 'new';
  const btnGroupCurrent = document.getElementById('btn-group-current');
  const btnGroupNew = document.getElementById('btn-group-new');
  const viewSwitchHint = document.getElementById('view-switch-hint');
  const viewSwitchContainer = document.getElementById('view-switch-container');
  const clearBtn = document.getElementById('btn-clear-class-lists');
  const stagedWrapper = document.getElementById('staged-class-lists-wrapper');

  btnNew?.classList.add('active');
  btnNew?.setAttribute('aria-checked', 'true');
  btnCurrent?.classList.remove('active');
  btnCurrent?.setAttribute('aria-checked', 'false');
  if (viewSwitchHint) {
    viewSwitchHint.textContent = 'All sections, charts, filters, and exports are grouped by New classes (Year 11).';
  }
  if (viewSwitchContainer) viewSwitchContainer.style.display = 'block';
  if (clearBtn) clearBtn.style.display = 'inline-block';
  if (stagedWrapper) stagedWrapper.style.display = 'none';

  // Re-build pseudonyms if needed for new class students
  if (currentPseudonymMaps && classListsData.inNewClassesNoMockResult) {
    classListsData.inNewClassesNoMockResult.forEach((st, idx) => {
      const fullName = `${st.surname || ''} ${st.firstName || ''}`.trim().toLowerCase();
      const nameKey = buildNameKey(st.surname, st.firstName);
      const pseudo = `Student ${allRecords.length + idx + 1}`;
      if (fullName && !currentPseudonymMaps.studentMap.has(fullName)) {
        currentPseudonymMaps.studentMap.set(fullName, pseudo);
      }
      if (nameKey && !currentPseudonymMaps.studentMap.has(nameKey)) {
        currentPseudonymMaps.studentMap.set(nameKey, pseudo);
      }
    });
  }

  // Re-render Diagnostics to show conflict notes
  if (currentDiagnostics) {
    renderDiagnostics(currentDiagnostics, currentFileName, currentSnapshotName);
  }

  // Render Mismatch lists
  renderClassMismatchLists();

  // Re-render all dashboard views with new grouping
  renderOverviewSection();
  renderDistanceSection(true);
  renderStudentGroupsSection(true);

  showToast(`Matched ${mergeResult.matchedCount} students to Year 11 classes.`);
}

async function processFile(file) {
  const errorEl = document.getElementById('upload-error');
  const emptyCard = document.getElementById('dashboard-empty-card');
  const actionToolbar = document.getElementById('action-toolbar');
  const fileInfoLabel = document.getElementById('file-info-label');
  const snapshotBanner = document.getElementById('header-snapshot-banner');
  const snapshotHeaderTitle = document.getElementById('header-snapshot-name');
  const snapshotBadge = document.getElementById('snapshot-title-badge');

  if (errorEl) errorEl.style.display = 'none';

  try {
    // Clearing snapshot also clears class lists
    clearClassLists();

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    // Ingest as 2D array of rows to scan for title and header row
    const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rawMatrix || rawMatrix.length === 0) {
      throw new Error('The spreadsheet appears to be empty or contains no readable rows.');
    }

    const parseResult = parseSnapshotSpreadsheet(rawMatrix, file.name);

    currentFileName = file.name;
    currentSnapshotName = parseResult.snapshotName;
    allRecords = parseResult.records; // PRIVACY: In-memory only!
    currentDiagnostics = parseResult.diagnostics;
    currentPseudonymMaps = buildPseudonymMaps(allRecords);

    // Show snapshot name in header bar
    if (currentSnapshotName) {
      if (snapshotBanner) snapshotBanner.style.display = 'inline-flex';
      if (snapshotHeaderTitle) snapshotHeaderTitle.textContent = currentSnapshotName;
      if (snapshotBadge) snapshotBadge.textContent = `Snapshot: ${currentSnapshotName}`;
    } else {
      if (snapshotBanner) snapshotBanner.style.display = 'none';
      if (snapshotBadge) snapshotBadge.textContent = `File: ${file.name}`;
    }

    if (fileInfoLabel) {
      const titleDisplay = currentSnapshotName ? `${currentSnapshotName} (${file.name})` : file.name;
      fileInfoLabel.textContent = `Loaded: ${titleDisplay} · ${parseResult.records.length} records`;
    }

    if (actionToolbar) {
      actionToolbar.style.display = 'flex';
    }

    updateHideNamesButtons();

    // Render Diagnostics Panel
    renderDiagnostics(parseResult.diagnostics, file.name, currentSnapshotName);

    // Render Section 1: Overview and class comparison
    renderOverviewSection();

    // Render Section 2: Distance from grade 5
    renderDistanceSection(true);

    // Render Section 3: Student groups
    renderStudentGroupsSection(true);

    // Render Mismatch Lists
    renderClassMismatchLists();

    // Hide empty card
    if (emptyCard) {
      emptyCard.style.display = 'none';
    }

    showToast(`Loaded ${parseResult.records.length} assessment records from ${file.name}`);
  } catch (err) {
    console.error('File parsing error:', err);
    if (errorEl) {
      errorEl.textContent = `Error reading file: ${err.message}`;
      errorEl.style.display = 'block';
    }
  }
}

/**
 * Setup PDF Export
 */
function updatePrintCoverAndContents() {
  const ukDateToday = formatUKDate(new Date());
  const activeRecords = getActiveRecords();
  const headlines = computeHeadlines(activeRecords);

  const coverPeriod = document.getElementById('print-cover-period');
  if (coverPeriod) {
    const groupLabel = activeGrouping === 'new' ? 'New classes (Year 11)' : 'Current classes (Year 10)';
    coverPeriod.textContent = currentFileName ? `Snapshot: ${currentFileName} · Grouping: ${groupLabel}` : 'Mock Snapshot Analysis';
  }

  const coverDate = document.getElementById('print-cover-date');
  if (coverDate) coverDate.textContent = ukDateToday;

  const coverPrivacy = document.getElementById('print-cover-privacy');
  if (coverPrivacy) {
    coverPrivacy.textContent = (pdfExportOptions.hideNames || isNameHidden)
      ? 'Anonymised (Names hidden)'
      : 'Standard class identifiers';
  }

  const runningPeriod = document.getElementById('print-running-period');
  if (runningPeriod) runningPeriod.textContent = currentFileName || 'Mock Snapshot';

  // Update contents list
  const contentsList = document.getElementById('print-contents-list');
  if (contentsList) {
    contentsList.innerHTML = '';
    const sections = [];
    if (pdfExportOptions.headlines) sections.push('Headline Summary');
    if (pdfExportOptions.overview) sections.push('Class Snapshot Overview');

    sections.forEach(title => {
      const li = document.createElement('li');
      li.textContent = title;
      contentsList.appendChild(li);
    });
  }
}

function triggerPdfExport() {
  const modal = document.getElementById('export-pdf-modal');
  if (modal) modal.style.display = 'none';

  // Read options from UI
  pdfExportOptions.headlines = !!document.getElementById('pdf-opt-headlines')?.checked;
  pdfExportOptions.overview = !!document.getElementById('pdf-opt-overview')?.checked;
  pdfExportOptions.hideNames = !!document.getElementById('pdf-opt-hide-names')?.checked;
  
  const isLandscape = document.getElementById('pdf-orient-landscape')?.checked;
  pdfExportOptions.orientation = isLandscape ? 'landscape' : 'portrait';

  // Set page orientation style if needed
  let pageStyle = document.getElementById('print-page-style');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'print-page-style';
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = `@page { size: A4 ${pdfExportOptions.orientation}; margin: 12mm 10mm; }`;

  updatePrintCoverAndContents();

  // Trigger system print
  window.print();
}

/**
 * Setup PowerPoint Export
 */
async function triggerPptxExport() {
  const modal = document.getElementById('export-pptx-modal');
  const errorMsg = document.getElementById('export-pptx-error-msg');
  if (errorMsg) errorMsg.style.display = 'none';

  pptxExportOptions.headlines = !!document.getElementById('pptx-opt-headlines')?.checked;
  pptxExportOptions.hideNames = !!document.getElementById('pptx-opt-hide-names')?.checked;

  try {
    const activeRecords = getActiveRecords();
    const fileName = await exportPowerPointPresentation({
      filteredRecords: activeRecords,
      allRecords: activeRecords,
      options: pptxExportOptions,
      snapshotName: currentFileName || 'Mock Exam Snapshot',
      filtersAppliedStr: `Grouped by: ${activeGrouping === 'new' ? 'New classes (Year 11)' : 'Current classes (Year 10)'}`,
      ukDateToday: formatUKDate(new Date())
    });

    if (modal) modal.style.display = 'none';
    showToast(`PowerPoint saved: ${fileName}`);
  } catch (err) {
    console.error('PPTX export error:', err);
    if (errorMsg) {
      errorMsg.textContent = `Failed to generate PowerPoint: ${err.message}`;
      errorMsg.style.display = 'block';
    }
  }
}

/**
 * Initialize all event listeners and components
 */
export function initApp() {
  // 1. Initial Authentication Check
  checkAuth();

  // 2. Auth Form Events
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  const btnTrustLogout = document.getElementById('btn-trust-logout');
  if (btnTrustLogout) {
    btnTrustLogout.addEventListener('click', handleLogout);
  }

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', handleLogout);
  }

  // Password toggle
  const togglePwdBtn = document.getElementById('btn-toggle-password');
  const pwdInput = document.getElementById('login-password');
  const eyeShow = document.getElementById('eye-icon-show');
  const eyeHide = document.getElementById('eye-icon-hide');

  if (togglePwdBtn && pwdInput) {
    togglePwdBtn.addEventListener('click', () => {
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
      if (eyeShow && eyeHide) {
        eyeShow.style.display = isPwd ? 'none' : 'block';
        eyeHide.style.display = isPwd ? 'block' : 'none';
      }
    });
  }

  // 3. Upload & Dropzone Events
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const browseBtn = document.getElementById('btn-browse');

  if (browseBtn && fileInput) {
    browseBtn.addEventListener('click', () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    });
  }

  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) processFile(file);
    });
  }

  // 4. PDF Modal Events
  const btnExportPdf = document.getElementById('btn-export-pdf');
  const exportPdfModal = document.getElementById('export-pdf-modal');
  const btnCloseExportModal = document.getElementById('btn-close-export-modal');
  const btnCancelExportPdf = document.getElementById('btn-cancel-export-pdf');
  const btnCreatePdf = document.getElementById('btn-create-pdf');
  const btnPdfSelectAll = document.getElementById('btn-pdf-select-all');
  const btnPdfSelectNone = document.getElementById('btn-pdf-select-none');

  if (btnExportPdf && exportPdfModal) {
    btnExportPdf.addEventListener('click', () => {
      exportPdfModal.style.display = 'flex';
    });
  }

  const closePdfModal = () => {
    if (exportPdfModal) exportPdfModal.style.display = 'none';
  };

  if (btnCloseExportModal) btnCloseExportModal.addEventListener('click', closePdfModal);
  if (btnCancelExportPdf) btnCancelExportPdf.addEventListener('click', closePdfModal);

  if (btnPdfSelectAll) {
    btnPdfSelectAll.addEventListener('click', () => {
      const cbs = exportPdfModal?.querySelectorAll('input[type="checkbox"]');
      cbs?.forEach(cb => { cb.checked = true; });
    });
  }

  if (btnPdfSelectNone) {
    btnPdfSelectNone.addEventListener('click', () => {
      const cbs = exportPdfModal?.querySelectorAll('input[type="checkbox"]');
      cbs?.forEach(cb => { cb.checked = false; });
    });
  }

  if (btnCreatePdf) {
    btnCreatePdf.addEventListener('click', triggerPdfExport);
  }

  // 5. PowerPoint Modal Events
  const btnExportPptx = document.getElementById('btn-export-pptx');
  const exportPptxModal = document.getElementById('export-pptx-modal');
  const btnClosePptxModal = document.getElementById('btn-close-pptx-modal');
  const btnCancelExportPptx = document.getElementById('btn-cancel-export-pptx');
  const btnCreatePptx = document.getElementById('btn-create-pptx');
  const btnPptxSelectAll = document.getElementById('btn-pptx-select-all');
  const btnPptxSelectNone = document.getElementById('btn-pptx-select-none');

  if (btnExportPptx && exportPptxModal) {
    btnExportPptx.addEventListener('click', () => {
      exportPptxModal.style.display = 'flex';
    });
  }

  const closePptxModal = () => {
    if (exportPptxModal) exportPptxModal.style.display = 'none';
  };

  if (btnClosePptxModal) btnClosePptxModal.addEventListener('click', closePptxModal);
  if (btnCancelExportPptx) btnCancelExportPptx.addEventListener('click', closePptxModal);

  if (btnPptxSelectAll) {
    btnPptxSelectAll.addEventListener('click', () => {
      const cbs = exportPptxModal?.querySelectorAll('input[type="checkbox"]');
      cbs?.forEach(cb => { cb.checked = true; });
    });
  }

  if (btnPptxSelectNone) {
    btnPptxSelectNone.addEventListener('click', () => {
      const cbs = exportPptxModal?.querySelectorAll('input[type="checkbox"]');
      cbs?.forEach(cb => { cb.checked = false; });
    });
  }

  if (btnCreatePptx) {
    btnCreatePptx.addEventListener('click', triggerPptxExport);
  }

  // 6. Settings Modal Events (Pattern kept)
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const settingsModal = document.getElementById('settings-modal');
  const btnCloseSettingsModal = document.getElementById('btn-close-settings-modal');
  const btnCancelSettings = document.getElementById('btn-cancel-settings');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const settingHideNames = document.getElementById('setting-hide-names');

  if (btnOpenSettings && settingsModal) {
    btnOpenSettings.addEventListener('click', () => {
      if (settingHideNames) settingHideNames.checked = isNameHidden;
      settingsModal.style.display = 'flex';
    });
  }

  const closeSettingsModal = () => {
    if (settingsModal) settingsModal.style.display = 'none';
  };

  if (btnCloseSettingsModal) btnCloseSettingsModal.addEventListener('click', closeSettingsModal);
  if (btnCancelSettings) btnCancelSettings.addEventListener('click', closeSettingsModal);

  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', () => {
      isNameHidden = !!settingHideNames?.checked;
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ hideNames: isNameHidden }));
      } catch (e) {
        console.warn('Could not save settings to localStorage:', e);
      }
      updateHideNamesButtons();
      renderOverviewSection();
      renderDistanceSection(false);
      renderStudentGroupsSection(false);
      renderClassMismatchLists();
      closeSettingsModal();
      showToast('Settings saved.');
    });
  }

  // Quick Hide Names Toggle Button in Toolbar
  const quickHideNamesBtn = document.getElementById('btn-quick-toggle-hide-names');
  if (quickHideNamesBtn) {
    quickHideNamesBtn.addEventListener('click', () => {
      isNameHidden = !isNameHidden;
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ hideNames: isNameHidden }));
      } catch (e) {
        console.warn('Could not save settings to localStorage:', e);
      }
      updateHideNamesButtons();
      renderOverviewSection();
      renderDistanceSection(false);
      renderStudentGroupsSection(false);
      renderClassMismatchLists();
      showToast(isNameHidden ? 'Student names hidden (privacy mode on).' : 'Student names visible.');
    });
  }

  // 7. Overview Section Controls (Rank By & Column Header Sorting)
  const rankSelect = document.getElementById('rank-classes-select');
  if (rankSelect) {
    rankSelect.addEventListener('change', (e) => {
      currentRankBy = e.target.value;
      if (currentRankBy === 'average-grade') currentSortKey = 'averageGrade';
      else if (currentRankBy === 'pct-5-plus') currentSortKey = 'pct5Plus';
      else if (currentRankBy === 'avg-progress') currentSortKey = 'averageProgress';
      currentSortDir = 'desc';
      renderClassComparisonTable();
      renderCharts();
    });
  }

  const tableHeadRow = document.getElementById('comparison-table-head-row');
  if (tableHeadRow) {
    tableHeadRow.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort-key]');
      if (!th) return;
      const sortKey = th.getAttribute('data-sort-key');
      if (currentSortKey === sortKey) {
        currentSortDir = currentSortDir === 'desc' ? 'asc' : 'desc';
      } else {
        currentSortKey = sortKey;
        currentSortDir = sortKey === 'className' ? 'asc' : 'desc';
      }

      // Sync dropdown if matches rank presets
      if (rankSelect) {
        if (currentSortKey === 'averageGrade' && currentSortDir === 'desc') rankSelect.value = 'average-grade';
        else if (currentSortKey === 'pct5Plus' && currentSortDir === 'desc') rankSelect.value = 'pct-5-plus';
        else if (currentSortKey === 'averageProgress' && currentSortDir === 'desc') rankSelect.value = 'avg-progress';
      }

      renderClassComparisonTable();
      renderCharts();
    });
  }

  // 8. Distance from Grade 5 Filter Controls
  const distClassSelect = document.getElementById('dist-filter-class');
  if (distClassSelect) {
    distClassSelect.addEventListener('change', (e) => {
      distFilters.className = e.target.value;
      renderDistanceSection(false);
    });
  }

  const distSenSelect = document.getElementById('dist-filter-sen');
  if (distSenSelect) {
    distSenSelect.addEventListener('change', (e) => {
      distFilters.sen = e.target.value;
      renderDistanceSection(false);
    });
  }

  const distDisadvSelect = document.getElementById('dist-filter-disadvantaged');
  if (distDisadvSelect) {
    distDisadvSelect.addEventListener('change', (e) => {
      distFilters.disadvantaged = e.target.value;
      renderDistanceSection(false);
    });
  }

  const distBandSelect = document.getElementById('dist-filter-band');
  if (distBandSelect) {
    distBandSelect.addEventListener('change', (e) => {
      distFilters.band = e.target.value;
      renderDistanceSection(false);
    });
  }

  const btnResetDistFilters = document.getElementById('btn-dist-reset-filters');
  if (btnResetDistFilters) {
    btnResetDistFilters.addEventListener('click', () => {
      distFilters = {
        className: 'ALL',
        sen: 'ALL',
        disadvantaged: 'ALL',
        band: 'ALL'
      };
      if (distClassSelect) distClassSelect.value = 'ALL';
      if (distSenSelect) distSenSelect.value = 'ALL';
      if (distDisadvSelect) distDisadvSelect.value = 'ALL';
      if (distBandSelect) distBandSelect.value = 'ALL';
      renderDistanceSection(false);
      showToast('Distance section filters reset.');
    });
  }

  // 9. Student Groups & Top Performers Controls
  const topPerfSelect = document.getElementById('top-performers-class-select');
  if (topPerfSelect) {
    topPerfSelect.addEventListener('change', (e) => {
      selectedTopPerformersClass = e.target.value;
      renderTopPerformers(false);
    });
  }

  const btnExpandAll = document.getElementById('btn-expand-all-classes');
  if (btnExpandAll) {
    btnExpandAll.addEventListener('click', () => {
      const container = document.getElementById('classes-group-accordion-container');
      if (!container) return;
      const headers = container.querySelectorAll('.class-accordion-header');
      headers.forEach(h => {
        h.classList.add('active');
        h.setAttribute('aria-expanded', 'true');
        const body = h.nextElementSibling;
        if (body) body.style.display = 'block';
      });
    });
  }

  const btnCollapseAll = document.getElementById('btn-collapse-all-classes');
  if (btnCollapseAll) {
    btnCollapseAll.addEventListener('click', () => {
      const container = document.getElementById('classes-group-accordion-container');
      if (!container) return;
      const headers = container.querySelectorAll('.class-accordion-header');
      headers.forEach(h => {
        h.classList.remove('active');
        h.setAttribute('aria-expanded', 'false');
        const body = h.nextElementSibling;
        if (body) body.style.display = 'none';
      });
    });
  }

  // 10. New Classes & Group by Controls
  initNewClassesHandlers();

  // Load saved settings
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.hideNames !== undefined) {
        isNameHidden = !!parsed.hideNames;
      }
    }
  } catch (e) {
    console.warn('Could not read settings from localStorage:', e);
  }
  updateHideNamesButtons();
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}

// Named exports for testing and external hooks
export {
  renderOverviewSection,
  renderClassComparisonTable,
  renderCharts,
  renderDistanceSection,
  renderStudentGroupsSection,
  renderCohortStudentGroups,
  renderClassStudentGroupsBreakdown,
  renderTopPerformers,
  renderClassMismatchLists,
  initNewClassesHandlers,
  clearClassLists,
  setActiveGrouping,
  getActiveRecords,
  processFile
};
