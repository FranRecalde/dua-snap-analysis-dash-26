/**
 * Class Snapshot Dashboard
 * Private, browser only class and cohort analysis for Heads of Department.
 * Dixons Unity Academy
 */

import * as XLSX from 'xlsx';
import { exportPowerPointPresentation } from './pptxExport.js';
import { generateSuggestedActions } from './actions.js';
import { PDF_SECTIONS, selectedPdfSections, setPdfSectionVisibility, livePdfFilterSummary, matrixPrintColumns, createStudentNameRedactor, qlaPrintClasses, qlaPrintTiers, heatmapPrintColumns } from './pdfExport.js';
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
import {
  processQlaWorkbookData,
  matchQlaStudents,
  generateQlaTemplateWorkbook
} from './qlaService.js';
import {
  filterQlaStudents,
  calculatePaperStats,
  calculateCohortTierHighlights,
  calculateClassPaperMatrix,
  calculateClassPaperHighlights,
  calculateQuestionStats,
  calculateBestAndWorstQuestions,
  calculateQuestionHeatmap,
  calculateTopicAndAOSummaries,
  getDictationAndTranslationQuestions,
  calculateClassReport,
  pickStrongestWeakestWithinTier,
  calculateStudentSkillProfiles,
  filterStudentProfiles,
  calculateGrade4sByWeakestPaper,
  calculateFarthestFrom5ByWeakestPaper,
  calculateWeakQuestionsAnalysis,
  calculateDemographicGroupGaps,
  calculateMissedPapersList,
  calculateStudentsReport
} from './qlaStats.js';
import {
  generateQlaActions,
  formatActionsAsEmailText,
  DEFAULT_QLA_ACTION_THRESHOLDS
} from './qlaActions.js';
import {
  DEFAULT_MOVEMENT_THRESHOLDS,
  calculateMovementMatrix,
  calculateNewClassProfiles,
  calculateBalanceFlags,
  compareClassNames
} from './movementStats.js';

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

// QLA State (In-Memory Only - Privacy Compliant, Never in localStorage)
let currentQlaData = null; // { rawSheets, fileName, assessmentTitle, papers, diagnostics }
let currentQlaFile = null;

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

// QLA Papers and Skills Tab State
let qlaTabFilters = {
  className: 'ALL',
  tier: 'ALL',
  sen: 'ALL',
  disadvantaged: 'ALL'
};

// QLA Questions Tab State
let qlaQuestionsState = {
  selectedPaper: null,
  sortKey: 'key',
  sortDir: 'asc',
  filters: {
    className: 'ALL',
    sen: 'ALL',
    disadvantaged: 'ALL'
  },
  thresholds: {
    strong: 70,
    weak: 40
  }
};

// QLA Classes Tab State
let qlaClassesState = {
  selectedClass: null,
  sortKey: 'name',
  sortDir: 'asc'
};

// QLA Students Tab State
let qlaStudentsState = {
  filters: {
    className: 'ALL',
    sen: 'ALL',
    disadvantaged: 'ALL',
    weakestPaper: 'ALL'
  },
  sortKey: 'name',
  sortDir: 'asc',
  expandedGrade4: new Set(),
  expandedFarthest5: new Set(),
  expandedWeakQuestions: new Set()
};

// QLA Actions Tab State
let qlaActionsState = {
  thresholds: {
    ...DEFAULT_QLA_ACTION_THRESHOLDS
  },
  expandedActions: new Set(),
  showAllActions: false
};

// Movement & Class Balance State
let movementState = {
  thresholds: {
    ...DEFAULT_MOVEMENT_THRESHOLDS
  },
  selectedCell: null,
  sortKey: 'className',
  sortDir: 'asc'
};

// Student Groups & Top Performers State
let selectedTopPerformersClass = null;

let pdfExportOptions = {
  overview: true,
  suggested: true,
  suggestedFull: false,
  distance: true,
  groups: true,
  movement: true,
  qlaTop: true,
  qlaPapers: true,
  qlaQuestions: true,
  qlaClasses: true,
  qlaStudents: true,
  qlaActions: true,
  diagnostics: false,
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
  clearQlaData();
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

  // QLA Diagnostics Block
  let qlaDiagHtml = '';
  if (currentQlaData && currentQlaData.diagnostics) {
    const qDiag = currentQlaData.diagnostics;

    const papersRows = (qDiag.papersFound || []).map(p => `
      <tr>
        <td><strong>${escapeHtml(p.name)}</strong> (${escapeHtml(p.sheetName)})</td>
        <td><span class="diag-pill-badge diag-pill-gray">${escapeHtml(p.tier)}</span></td>
        <td><strong>${p.studentCount}</strong></td>
        <td><span style="color: #166534; font-weight: 600;">${p.present}</span></td>
        <td><span style="${p.absent > 0 ? 'color: #b45309; font-weight: 600;' : ''}">${p.absent}</span></td>
        <td><span style="${p.incomplete > 0 ? 'color: #dc2626; font-weight: 600;' : ''}">${p.incomplete}</span></td>
      </tr>
    `).join('');

    let unmatchedHtml = '';
    if (qDiag.unmatchedCount > 0) {
      const items = (qDiag.unmatchedStudents || []).map(s => {
        return `<li><strong>${escapeHtml(s.name)}</strong> · Class: <code>${escapeHtml(s.className || 'None')}</code> · Paper: ${escapeHtml((s.papers || []).join(', '))} (Not in snapshot)</li>`;
      }).join('');
      unmatchedHtml = `
        <div class="diag-list-card" style="border-left: 4px solid #f59e0b; margin-top: 14px;">
          <div class="diag-list-title" style="color: #92400e;">
            <span>⚠️</span> Unmatched to Snapshot (${qDiag.unmatchedCount}) — Listed with QLA class column
          </div>
          <ul class="diag-list-items">
            ${items}
          </ul>
        </div>
      `;
    } else {
      unmatchedHtml = `
        <div style="margin-top: 10px; font-size: 13px; color: #166534; display: flex; align-items: center; gap: 6px;">
          <span>✓</span> All ${qDiag.totalStudents} QLA student entries matched to snapshot.
        </div>
      `;
    }

    let warningsHtml = '';
    if (qDiag.warnings && qDiag.warnings.length > 0) {
      const items = qDiag.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('');
      warningsHtml = `
        <div class="diag-list-card" style="border-left: 4px solid #dc2626; margin-top: 14px;">
          <div class="diag-list-title" style="color: #991b1b;">
            <span>⚠️</span> QLA Parser Warnings (${qDiag.warnings.length})
          </div>
          <ul class="diag-list-items">
            ${items}
          </ul>
        </div>
      `;
    }

    qlaDiagHtml = `
      <div class="diag-qla-block">
        <div class="diag-qla-header">
          <div class="diag-qla-title">
            <span>📑</span> QLA
          </div>
          <div>
            <span class="diag-pill-badge diag-pill-green">QLA Active</span>
          </div>
        </div>

        <div style="font-size: 13.5px; margin-bottom: 12px; color: var(--text-primary);">
          <strong>Assessment:</strong> ${escapeHtml(qDiag.assessmentTitle)}
        </div>

        <div class="table-responsive">
          <table class="diag-qla-table">
            <thead>
              <tr>
                <th>Paper Found</th>
                <th>Tier</th>
                <th>Students</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Incomplete</th>
              </tr>
            </thead>
            <tbody>
              ${papersRows}
            </tbody>
          </table>
        </div>

        ${unmatchedHtml}
        ${warningsHtml}
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
      ${qlaDiagHtml}
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
  qlaTabFilters.className = 'ALL';
  qlaQuestionsState.filters.className = 'ALL';
  qlaClassesState.selectedClass = null;
  qlaStudentsState.filters.className = 'ALL';
  selectedTopPerformersClass = null;

  // Reprocess QLA with activeGrouping if loaded
  if (currentQlaData && currentQlaData.rawSheets) {
    const reprocessed = processQlaWorkbookData(
      currentQlaData.rawSheets,
      currentQlaData.fileName,
      allRecords,
      activeGrouping
    );
    currentQlaData.papers = reprocessed.papers;
    currentQlaData.diagnostics = reprocessed.diagnostics;
    renderQlaPapersAndSkillsTab();
    renderQlaQuestionsTab();
    renderQlaClassesTab();
    renderQlaStudentsTab();
    renderQlaActionsTab();
  }

  // Re-render all dashboard views
  renderOverviewSection();
  renderDistanceSection(true);
  renderStudentGroupsSection(true);
  renderMovementAndBalanceSection();
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
  const movementSection = document.getElementById('section-movement-balance');
  const stagedWrapper = document.getElementById('staged-class-lists-wrapper');
  const clearBtn = document.getElementById('btn-clear-class-lists');
  const fileInput = document.getElementById('class-lists-input');
  const btnNo = document.getElementById('btn-new-classes-no');
  const btnYes = document.getElementById('btn-new-classes-yes');
  const uploadSec = document.getElementById('new-classes-upload-section');

  if (viewSwitchContainer) viewSwitchContainer.style.display = 'none';
  if (mismatchSection) mismatchSection.style.display = 'none';
  if (movementSection) movementSection.style.display = 'none';
  movementState.selectedCell = null;
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
 * Render Movement and Class Balance Section
 */
function renderMovementAndBalanceSection() {
  const section = document.getElementById('section-movement-balance');
  if (!section) return;

  if (!classListsData) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  // 1. Calculate Matrix, Profiles, and Flags
  const matrix = calculateMovementMatrix(allRecords, classListsData);
  const profilesData = calculateNewClassProfiles(allRecords, classListsData);
  const flagsData = calculateBalanceFlags(profilesData.classProfiles, profilesData.cohortProfile, movementState.thresholds);

  // Update header badges
  const classesCountBadge = document.getElementById('movement-classes-count-badge');
  if (classesCountBadge) {
    const num = profilesData.classProfiles.length;
    classesCountBadge.textContent = `${num} new class${num === 1 ? '' : 'es'}`;
  }

  const flagsCountBadge = document.getElementById('movement-flags-count-badge');
  if (flagsCountBadge) {
    flagsCountBadge.textContent = `${flagsData.count} flag${flagsData.count === 1 ? '' : 's'}`;
    flagsCountBadge.style.background = flagsData.count > 0 ? '#fef3c7' : '#dcfce7';
    flagsCountBadge.style.color = flagsData.count > 0 ? '#92400e' : '#15803d';
  }

  // 2. Render Balance Flags
  const flagsList = document.getElementById('movement-balance-flags-list');
  if (flagsList) {
    if (!flagsData.hasFlags) {
      flagsList.innerHTML = `
        <div class="balance-flag-card empty-flag">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          <span>No balance concerns at the current thresholds.</span>
        </div>
      `;
    } else {
      flagsList.innerHTML = flagsData.flags.map((flag, idx) => `
        <div class="balance-flag-card" id="balance-flag-${idx}">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.2" fill="none" style="flex-shrink: 0; margin-top: 1px;"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          <div>
            <strong>${escapeHtml(flag.text)}</strong>
            <div style="font-size: 11.5px; opacity: 0.9; margin-top: 2px;">${escapeHtml(flag.why)}</div>
          </div>
        </div>
      `).join('');
    }
  }

  // 3. Render Movement Matrix Table
  const matrixContainer = document.getElementById('movement-matrix-container');
  if (matrixContainer && matrix) {
    const colHeaders = matrix.newClasses.map(nc => `<th>${escapeHtml(nc)}</th>`).join('');

    // Rows
    const rowsHtml = matrix.currentClasses.map(cur => {
      const cellsHtml = matrix.newClasses.map(nw => {
        const students = matrix.grid[cur][nw] || [];
        const count = students.length;
        const isClickable = count > 0;
        const isSelected = movementState.selectedCell &&
          movementState.selectedCell.type === 'matrix' &&
          movementState.selectedCell.rowKey === cur &&
          movementState.selectedCell.colKey === nw;

        let style = '';
        if (count > 0) {
          const ratio = Math.min(1, count / matrix.maxCellCount);
          const bgOpacity = 0.12 + 0.65 * ratio;
          style = `background: rgba(46, 105, 48, ${bgOpacity.toFixed(2)}); color: ${bgOpacity > 0.45 ? '#ffffff' : '#1e3a24'}; font-weight: 600;`;
        }

        return `
          <td class="movement-matrix-cell ${isClickable ? 'clickable' : ''} ${isSelected ? 'active-selected' : ''}"
              style="${style}"
              data-cell-type="matrix"
              data-row="${escapeHtml(cur)}"
              data-col="${escapeHtml(nw)}">
            ${count > 0 ? count : '<span style="color:#cbd5e1;">-</span>'}
          </td>
        `;
      }).join('');

      const notInNewStudents = matrix.notInNewByCurrent[cur] || [];
      const notInNewCount = notInNewStudents.length;
      const isNotInNewSelected = movementState.selectedCell &&
        movementState.selectedCell.type === 'notInNew' &&
        movementState.selectedCell.rowKey === cur;

      return `
        <tr>
          <td><strong>${escapeHtml(cur)}</strong></td>
          ${cellsHtml}
          <td class="movement-matrix-cell ${notInNewCount > 0 ? 'clickable' : ''} ${isNotInNewSelected ? 'active-selected' : ''}"
              style="${notInNewCount > 0 ? 'background: #fff1f2; color: #9f1239; font-weight: 600;' : ''}"
              data-cell-type="notInNew"
              data-row="${escapeHtml(cur)}">
            ${notInNewCount > 0 ? notInNewCount : '<span style="color:#cbd5e1;">-</span>'}
          </td>
          <td class="movement-col-total">
            ${matrix.rowTotals[cur]}
          </td>
        </tr>
      `;
    }).join('');

    // Extra Row: "New to the cohort (no mock result)"
    const newToCohortCells = matrix.newClasses.map(nw => {
      const students = matrix.newToCohortByNew[nw] || [];
      const count = students.length;
      const isSelected = movementState.selectedCell &&
        movementState.selectedCell.type === 'newCohort' &&
        movementState.selectedCell.colKey === nw;

      return `
        <td class="movement-matrix-cell ${count > 0 ? 'clickable' : ''} ${isSelected ? 'active-selected' : ''}"
            style="${count > 0 ? 'background: #fdf4ff; color: #86198f; font-weight: 600;' : ''}"
            data-cell-type="newCohort"
            data-col="${escapeHtml(nw)}">
          ${count > 0 ? count : '<span style="color:#cbd5e1;">-</span>'}
        </td>
      `;
    }).join('');

    // Total Row
    const totalColsHtml = matrix.newClasses.map(nw => `
      <td class="movement-col-total">${matrix.colTotals[nw]}</td>
    `).join('');

    matrixContainer.innerHTML = `
      <table class="movement-matrix-table">
        <thead>
          <tr>
            <th style="min-width: 130px;">Current \\ New</th>
            ${colHeaders}
            <th style="background: #fff1f2; color: #9f1239;">Not in a new class</th>
            <th class="movement-col-total">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="movement-row-new-cohort">
            <td><em>New to the cohort (no mock result)</em></td>
            ${newToCohortCells}
            <td style="color:#cbd5e1;">-</td>
            <td class="movement-col-total">${matrix.newToCohortRowTotal}</td>
          </tr>
          <tr class="movement-row-total">
            <td>Total</td>
            ${totalColsHtml}
            <td class="movement-col-total" style="color: #9f1239;">${matrix.notInNewColTotal}</td>
            <td class="movement-col-total" style="background: #e2e8f0; font-size: 13px;">${matrix.grandTotal}</td>
          </tr>
        </tbody>
      </table>
    `;

    // Attach click events on cells
    matrixContainer.querySelectorAll('.movement-matrix-cell.clickable').forEach(cell => {
      cell.onclick = () => {
        const type = cell.getAttribute('data-cell-type');
        const row = cell.getAttribute('data-row');
        const col = cell.getAttribute('data-col');

        if (movementState.selectedCell &&
            movementState.selectedCell.type === type &&
            movementState.selectedCell.rowKey === row &&
            movementState.selectedCell.colKey === col) {
          movementState.selectedCell = null;
        } else {
          movementState.selectedCell = { type, rowKey: row, colKey: col };
        }
        renderMovementAndBalanceSection();
      };
    });
  }

  // 4. Render Drilldown Drawer
  const drawer = document.getElementById('movement-cell-drilldown-drawer');
  if (drawer) {
    if (!movementState.selectedCell) {
      drawer.style.display = 'none';
      drawer.innerHTML = '';
    } else {
      let studentList = [];
      let label = '';
      const sc = movementState.selectedCell;

      if (sc.type === 'matrix') {
        studentList = (matrix.grid[sc.rowKey] && matrix.grid[sc.rowKey][sc.colKey]) || [];
        label = `Students moving from ${sc.rowKey} to ${sc.colKey}`;
      } else if (sc.type === 'notInNew') {
        studentList = matrix.notInNewByCurrent[sc.rowKey] || [];
        label = `Students in ${sc.rowKey} not allocated to any new class`;
      } else if (sc.type === 'newCohort') {
        studentList = matrix.newToCohortByNew[sc.colKey] || [];
        label = `Students new to the cohort allocated to ${sc.colKey}`;
      }

      drawer.style.display = 'block';
      const studentRows = studentList.map((st, idx) => {
        const displayName = getDisplayStudentName(st, isNameHidden, idx + 1);
        const resultDisplay = st.displayResult || (st.result !== null && st.result !== undefined ? st.result : '—');
        const senDisplay = st.sen || 'No SEN';
        const disadvDisplay = st.disadvantaged || 'No';
        const ealDisplay = st.eal || 'No';

        return `
          <tr>
            <td><strong>${escapeHtml(displayName)}</strong></td>
            <td>${escapeHtml(st.className || st.currentClassName || '—')}</td>
            <td>${escapeHtml(st.newClassName || '—')}</td>
            <td style="text-align: center;"><strong>${escapeHtml(String(resultDisplay))}</strong></td>
            <td>${escapeHtml(senDisplay)}</td>
            <td>${escapeHtml(disadvDisplay)}</td>
            <td>${escapeHtml(ealDisplay)}</td>
          </tr>
        `;
      }).join('');

      drawer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div style="font-weight: 700; font-size: 13.5px; color: var(--brand-dark);">
            ${escapeHtml(label)} (${studentList.length} student${studentList.length === 1 ? '' : 's'}):
          </div>
          <button type="button" class="btn-secondary-action" id="btn-close-movement-drawer" style="padding: 2px 8px; font-size: 11px;">
            Close ✕
          </button>
        </div>
        <div class="table-responsive" style="max-height: 240px; overflow-y: auto;">
          <table class="data-table" style="font-size: 12px; margin-bottom: 0;">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Year 10 Class</th>
                <th>Year 11 Class</th>
                <th style="text-align: center;">Mock Result</th>
                <th>SEN</th>
                <th>Disadvantaged</th>
                <th>EAL</th>
              </tr>
            </thead>
            <tbody>
              ${studentRows}
            </tbody>
          </table>
        </div>
      `;

      const btnClose = document.getElementById('btn-close-movement-drawer');
      if (btnClose) {
        btnClose.onclick = () => {
          movementState.selectedCell = null;
          renderMovementAndBalanceSection();
        };
      }
    }
  }

  // 5. Render New Class Profile Table
  const tbody = document.getElementById('new-class-profile-tbody');
  const tfoot = document.getElementById('new-class-profile-tfoot');
  if (tbody && profilesData) {
    const sortedProfiles = [...profilesData.classProfiles].sort((a, b) => {
      let valA, valB;
      switch (movementState.sortKey) {
        case 'totalStudents': valA = a.totalStudents; valB = b.totalStudents; break;
        case 'studentsWithResults': valA = a.studentsWithResults; valB = b.studentsWithResults; break;
        case 'averageGrade': valA = a.averageGrade ?? -1; valB = b.averageGrade ?? -1; break;
        case 'pctGrade5Plus': valA = a.pctGrade5Plus ?? -1; valB = b.pctGrade5Plus ?? -1; break;
        case 'atOrAbove5': valA = a.distanceBands.atOrAbove5; valB = b.distanceBands.atOrAbove5; break;
        case 'oneAway': valA = a.distanceBands.oneAway; valB = b.distanceBands.oneAway; break;
        case 'twoAway': valA = a.distanceBands.twoAway; valB = b.distanceBands.twoAway; break;
        case 'threeOrMoreAway': valA = a.distanceBands.threeOrMoreAway; valB = b.distanceBands.threeOrMoreAway; break;
        case 'pctSenSupport': valA = a.pctSenSupport; valB = b.pctSenSupport; break;
        case 'pctDisadvantaged': valA = a.pctDisadvantaged; valB = b.pctDisadvantaged; break;
        case 'pctEAL': valA = a.pctEAL; valB = b.pctEAL; break;
        case 'high': valA = a.priorAttainment.high; valB = b.priorAttainment.high; break;
        case 'middle': valA = a.priorAttainment.middle; valB = b.priorAttainment.middle; break;
        case 'low': valA = a.priorAttainment.low; valB = b.priorAttainment.low; break;
        case 'noKs2': valA = a.priorAttainment.noKs2; valB = b.priorAttainment.noKs2; break;
        default:
          return compareClassNames(a.className, b.className) * (movementState.sortDir === 'desc' ? -1 : 1);
      }
      if (valA === valB) return compareClassNames(a.className, b.className);
      return (valA < valB ? -1 : 1) * (movementState.sortDir === 'desc' ? -1 : 1);
    });

    // Calculate extremes for highlights
    const calculateExtremes = (keys, profiles) => {
      const ext = {};
      keys.forEach(k => {
        let max = -Infinity;
        let min = Infinity;
        profiles.forEach(p => {
          let val;
          if (k === 'averageGrade') val = p.averageGrade;
          else if (k === 'pctGrade5Plus') val = p.pctGrade5Plus;
          else if (['atOrAbove5', 'oneAway', 'twoAway', 'threeOrMoreAway'].includes(k)) val = p.distanceBands[k];
          else if (['pctSenSupport', 'pctDisadvantaged', 'pctEAL'].includes(k)) val = p[k];
          else if (['high', 'middle', 'low', 'noKs2'].includes(k)) val = p.priorAttainment[k];
          else val = p[k];

          if (val !== null && val !== undefined && !isNaN(val)) {
            if (val > max) max = val;
            if (val < min) min = val;
          }
        });
        if (max !== -Infinity && min !== Infinity && max !== min) {
          ext[k] = { max, min };
        }
      });
      return ext;
    };

    const metricKeys = [
      'totalStudents', 'averageGrade', 'pctGrade5Plus',
      'atOrAbove5', 'oneAway', 'twoAway', 'threeOrMoreAway',
      'pctSenSupport', 'pctDisadvantaged', 'pctEAL',
      'high', 'middle', 'low', 'noKs2'
    ];
    const extremes = calculateExtremes(metricKeys, profilesData.classProfiles);

    const getExtremeClass = (key, val) => {
      if (val === null || val === undefined || !extremes[key]) return '';
      if (val === extremes[key].max) return 'cell-highest';
      if (val === extremes[key].min) return 'cell-lowest';
      return '';
    };

    tbody.innerHTML = sortedProfiles.map(p => {
      const avgGradeStr = p.averageGrade !== null ? p.averageGrade.toFixed(2) : '—';
      const pct5Str = p.pctGrade5Plus !== null ? `${p.pctGrade5Plus.toFixed(1)}%` : '—';

      return `
        <tr>
          <td><strong>${escapeHtml(p.className)}</strong></td>
          <td style="text-align: right;" class="${getExtremeClass('totalStudents', p.totalStudents)}">${p.totalStudents}</td>
          <td><span style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(p.resultRatioText)}</span></td>
          <td style="text-align: right;" class="${getExtremeClass('averageGrade', p.averageGrade)}">${avgGradeStr}</td>
          <td style="text-align: right;" class="${getExtremeClass('pctGrade5Plus', p.pctGrade5Plus)}">${pct5Str}</td>
          <td style="text-align: right;" class="${getExtremeClass('atOrAbove5', p.distanceBands.atOrAbove5)}">${p.distanceBands.atOrAbove5}</td>
          <td style="text-align: right;" class="${getExtremeClass('oneAway', p.distanceBands.oneAway)}">${p.distanceBands.oneAway}</td>
          <td style="text-align: right;" class="${getExtremeClass('twoAway', p.distanceBands.twoAway)}">${p.distanceBands.twoAway}</td>
          <td style="text-align: right;" class="${getExtremeClass('threeOrMoreAway', p.distanceBands.threeOrMoreAway)}">${p.distanceBands.threeOrMoreAway}</td>
          <td style="text-align: right;" class="${getExtremeClass('pctSenSupport', p.pctSenSupport)}">${p.pctSenSupport.toFixed(1)}%</td>
          <td style="text-align: right;" class="${getExtremeClass('pctDisadvantaged', p.pctDisadvantaged)}">${p.pctDisadvantaged.toFixed(1)}%</td>
          <td style="text-align: right;" class="${getExtremeClass('pctEAL', p.pctEAL)}">${p.pctEAL.toFixed(1)}%</td>
          <td style="text-align: right;" class="${getExtremeClass('high', p.priorAttainment.high)}">${p.priorAttainment.high}</td>
          <td style="text-align: right;" class="${getExtremeClass('middle', p.priorAttainment.middle)}">${p.priorAttainment.middle}</td>
          <td style="text-align: right;" class="${getExtremeClass('low', p.priorAttainment.low)}">${p.priorAttainment.low}</td>
          <td style="text-align: right;" class="${getExtremeClass('noKs2', p.priorAttainment.noKs2)}">${p.priorAttainment.noKs2}</td>
        </tr>
      `;
    }).join('');

    // Cohort Footer Row
    if (tfoot && profilesData.cohortProfile) {
      const cp = profilesData.cohortProfile;
      const cohortAvgStr = cp.averageGrade !== null ? cp.averageGrade.toFixed(2) : '—';
      const cohortPct5Str = cp.pctGrade5Plus !== null ? `${cp.pctGrade5Plus.toFixed(1)}%` : '—';

      tfoot.innerHTML = `
        <tr>
          <td><strong>Cohort Total / Average</strong></td>
          <td style="text-align: right;"><strong>${cp.totalStudents}</strong></td>
          <td><span style="font-size: 11.5px; font-weight: 600;">${escapeHtml(cp.resultRatioText)}</span></td>
          <td style="text-align: right;"><strong>${cohortAvgStr}</strong></td>
          <td style="text-align: right;"><strong>${cohortPct5Str}</strong></td>
          <td style="text-align: right;"><strong>${cp.distanceBands.atOrAbove5}</strong></td>
          <td style="text-align: right;"><strong>${cp.distanceBands.oneAway}</strong></td>
          <td style="text-align: right;"><strong>${cp.distanceBands.twoAway}</strong></td>
          <td style="text-align: right;"><strong>${cp.distanceBands.threeOrMoreAway}</strong></td>
          <td style="text-align: right;"><strong>${cp.pctSenSupport.toFixed(1)}%</strong></td>
          <td style="text-align: right;"><strong>${cp.pctDisadvantaged.toFixed(1)}%</strong></td>
          <td style="text-align: right;"><strong>${cp.pctEAL.toFixed(1)}%</strong></td>
          <td style="text-align: right;"><strong>${cp.priorAttainment.high}</strong></td>
          <td style="text-align: right;"><strong>${cp.priorAttainment.middle}</strong></td>
          <td style="text-align: right;"><strong>${cp.priorAttainment.low}</strong></td>
          <td style="text-align: right;"><strong>${cp.priorAttainment.noKs2}</strong></td>
        </tr>
      `;
    }

    // Attach sort listeners on table headers
    const tableEl = document.getElementById('new-class-profile-table');
    if (tableEl) {
      tableEl.querySelectorAll('th[data-sort]').forEach(th => {
        const sortKey = th.getAttribute('data-sort');
        const icon = th.querySelector('.sort-icon');
        if (icon) {
          icon.textContent = movementState.sortKey === sortKey
            ? (movementState.sortDir === 'asc' ? '▲' : '▼')
            : '↕';
        }
        th.onclick = () => {
          if (movementState.sortKey === sortKey) {
            movementState.sortDir = movementState.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            movementState.sortKey = sortKey;
            movementState.sortDir = 'asc';
          }
          renderMovementAndBalanceSection();
        };
      });
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
  renderMovementAndBalanceSection();

  if (currentQlaData && currentQlaData.rawSheets) {
    const reprocessed = processQlaWorkbookData(
      currentQlaData.rawSheets,
      currentQlaData.fileName,
      allRecords,
      activeGrouping
    );
    currentQlaData.papers = reprocessed.papers;
    currentQlaData.diagnostics = reprocessed.diagnostics;
    qlaClassesState.selectedClass = null;
    qlaStudentsState.filters.className = 'ALL';
    renderQlaPapersAndSkillsTab();
    renderQlaQuestionsTab();
    renderQlaClassesTab();
    renderQlaStudentsTab();
    renderQlaActionsTab();
  }

  showToast(`Matched ${mergeResult.matchedCount} students to Year 11 classes.`);
}

/**
 * Enable QLA Upload Card (called when snapshot is loaded)
 */
function enableQlaCard() {
  const panelQla = document.getElementById('panel-qla');
  const disabledNote = document.getElementById('qla-disabled-note');
  const browseBtn = document.getElementById('btn-browse-qla');
  const fileInput = document.getElementById('qla-file-input');

  if (panelQla) {
    panelQla.classList.remove('disabled');
    panelQla.removeAttribute('aria-disabled');
  }
  if (disabledNote) disabledNote.style.display = 'none';
  if (browseBtn) browseBtn.removeAttribute('disabled');
  if (fileInput) fileInput.removeAttribute('disabled');
}

/**
 * Disable QLA Upload Card (called when no snapshot is loaded)
 */
function disableQlaCard() {
  const panelQla = document.getElementById('panel-qla');
  const disabledNote = document.getElementById('qla-disabled-note');
  const browseBtn = document.getElementById('btn-browse-qla');
  const fileInput = document.getElementById('qla-file-input');
  const loadedInfo = document.getElementById('qla-loaded-info');
  const btnContainer = document.getElementById('qla-upload-btn-container');
  const subText = document.getElementById('qla-sub-text');

  if (panelQla) {
    panelQla.classList.add('disabled');
    panelQla.setAttribute('aria-disabled', 'true');
  }
  if (disabledNote) disabledNote.style.display = 'inline-block';
  if (browseBtn) browseBtn.setAttribute('disabled', 'true');
  if (fileInput) {
    fileInput.setAttribute('disabled', 'true');
    fileInput.value = '';
  }
  if (loadedInfo) loadedInfo.style.display = 'none';
  if (btnContainer) btnContainer.style.display = 'block';
  if (subText) subText.style.display = 'block';
}

/**
 * Update QLA Card to loaded state
 */
function updateQlaCardLoaded(qlaResult) {
  const loadedInfo = document.getElementById('qla-loaded-info');
  const btnContainer = document.getElementById('qla-upload-btn-container');
  const subText = document.getElementById('qla-sub-text');
  const titleEl = document.getElementById('qla-assessment-title');
  const countEl = document.getElementById('qla-papers-count');

  if (btnContainer) btnContainer.style.display = 'none';
  if (subText) subText.style.display = 'none';
  if (titleEl) titleEl.textContent = qlaResult.assessmentTitle;
  if (countEl) {
    const numPapers = qlaResult.papers.length;
    countEl.textContent = `${numPapers} ${numPapers === 1 ? 'paper' : 'papers'} loaded`;
  }
  if (loadedInfo) loadedInfo.style.display = 'block';
}

/**
 * Clear QLA Data from memory and reset UI (PRIVACY: In-Memory Only!)
 */
function clearQlaData(options = { notify: false }) {
  currentQlaData = null;
  currentQlaFile = null;

  const fileInput = document.getElementById('qla-file-input');
  if (fileInput) fileInput.value = '';

  const loadedInfo = document.getElementById('qla-loaded-info');
  const btnContainer = document.getElementById('qla-upload-btn-container');
  const subText = document.getElementById('qla-sub-text');
  const errorEl = document.getElementById('qla-upload-error');
  const insightsSection = document.getElementById('section-qla-insights');

  if (loadedInfo) loadedInfo.style.display = 'none';
  if (btnContainer) btnContainer.style.display = 'block';
  if (subText) subText.style.display = 'block';
  if (errorEl) errorEl.style.display = 'none';
  if (insightsSection) insightsSection.style.display = 'none';

  if (allRecords && allRecords.length > 0) {
    enableQlaCard();
  } else {
    disableQlaCard();
  }

  // Reset tab filters and clear tab elements
  qlaTabFilters = { className: 'ALL', tier: 'ALL', sen: 'ALL', disadvantaged: 'ALL' };
  const filterClass = document.getElementById('qla-filter-class');
  const filterTier = document.getElementById('qla-filter-tier');
  const filterSen = document.getElementById('qla-filter-sen');
  const filterDis = document.getElementById('qla-filter-disadvantaged');
  if (filterClass) filterClass.value = 'ALL';
  if (filterTier) filterTier.value = 'ALL';
  if (filterSen) filterSen.value = 'ALL';
  if (filterDis) filterDis.value = 'ALL';

  const tierHighlightsEl = document.getElementById('qla-tier-highlights');
  if (tierHighlightsEl) tierHighlightsEl.innerHTML = '';
  const paperCardsGrid = document.getElementById('qla-paper-cards-grid');
  if (paperCardsGrid) paperCardsGrid.innerHTML = '';
  const tableEl = document.querySelector('#pane-papers-skills #qla-class-paper-table');
  if (tableEl) tableEl.innerHTML = '';
  const highlightsListEl = document.getElementById('qla-class-highlights-list');
  if (highlightsListEl) highlightsListEl.innerHTML = '';

  // Questions tab reset
  qlaQuestionsState.selectedPaper = null;
  qlaQuestionsState.filters = { className: 'ALL', sen: 'ALL', disadvantaged: 'ALL' };
  const qFilterClass = document.getElementById('qla-q-filter-class');
  const qFilterSen = document.getElementById('qla-q-filter-sen');
  const qFilterDis = document.getElementById('qla-q-filter-disadvantaged');
  if (qFilterClass) qFilterClass.value = 'ALL';
  if (qFilterSen) qFilterSen.value = 'ALL';
  if (qFilterDis) qFilterDis.value = 'ALL';

  const qQualityFlags = document.getElementById('qla-questions-quality-flags');
  if (qQualityFlags) qQualityFlags.innerHTML = '';
  const qDictationCard = document.getElementById('qla-dictation-translation-card');
  if (qDictationCard) qDictationCard.innerHTML = '';
  const qBestWorst = document.getElementById('qla-best-worst-container');
  if (qBestWorst) qBestWorst.innerHTML = '';
  const qTable = document.getElementById('qla-question-table');
  if (qTable) qTable.innerHTML = '';
  const qHeatmap = document.getElementById('qla-question-heatmap-table');
  if (qHeatmap) qHeatmap.innerHTML = '';
  const qTopicAo = document.getElementById('qla-topic-ao-container');
  if (qTopicAo) qTopicAo.innerHTML = '';

  // Classes tab reset
  qlaClassesState.selectedClass = null;
  qlaClassesState.sortKey = 'name';
  qlaClassesState.sortDir = 'asc';
  const cClassSelect = document.getElementById('qla-classes-class-select');
  if (cClassSelect) cClassSelect.innerHTML = '';
  const cHeaderStats = document.getElementById('qla-class-header-stats');
  if (cHeaderStats) cHeaderStats.innerHTML = '';
  const cPaperTable = document.querySelector('#pane-classes #qla-class-paper-table');
  if (cPaperTable) cPaperTable.innerHTML = '';
  const cPaperHighlights = document.getElementById('qla-class-paper-highlights');
  if (cPaperHighlights) cPaperHighlights.innerHTML = '';
  const cBestWorst = document.getElementById('qla-class-best-worst-card');
  if (cBestWorst) cBestWorst.innerHTML = '';
  const cFurthestBelow = document.getElementById('qla-class-furthest-below-card');
  if (cFurthestBelow) cFurthestBelow.innerHTML = '';
  const cBeatingCohort = document.getElementById('qla-class-beating-cohort-card');
  if (cBeatingCohort) cBeatingCohort.innerHTML = '';
  const cStudentTable = document.getElementById('qla-class-student-table');
  if (cStudentTable) cStudentTable.innerHTML = '';

  // Actions tab reset
  qlaActionsState.expandedActions.clear();
  qlaActionsState.showAllActions = false;
  const aListTop = document.getElementById('qla-top-priorities-list');
  if (aListTop) aListTop.innerHTML = '';
  const aCardTop = document.getElementById('qla-actions-card-top-priorities');
  if (aCardTop) aCardTop.style.display = 'none';
  const aToggleAll = document.getElementById('qla-toggle-all-actions-container');
  if (aToggleAll) aToggleAll.style.display = 'none';
  const aAllContainer = document.getElementById('qla-all-actions-container');
  if (aAllContainer) aAllContainer.style.display = 'none';
  const aListDept = document.getElementById('qla-actions-list-dept');
  if (aListDept) aListDept.innerHTML = '';
  const aListClass = document.getElementById('qla-actions-list-class');
  if (aListClass) aListClass.innerHTML = '';
  const aListStudents = document.getElementById('qla-actions-list-students');
  if (aListStudents) aListStudents.innerHTML = '';
  const aCountBadge = document.getElementById('qla-actions-count-badge');
  if (aCountBadge) aCountBadge.textContent = '0 actions';
  const aEmptyState = document.getElementById('qla-actions-empty-state');
  if (aEmptyState) aEmptyState.style.display = 'none';

  // Re-render diagnostics to remove QLA block
  if (currentDiagnostics) {
    renderDiagnostics(currentDiagnostics, currentFileName, currentSnapshotName);
  }

  if (options.notify) {
    showToast('QLA data removed.');
  }
}

/**
 * Process QLA spreadsheet file
 */
async function processQlaFile(file) {
  if (!allRecords || allRecords.length === 0) {
    showToast('Upload the snapshot first.');
    return;
  }

  const errorEl = document.getElementById('qla-upload-error');
  if (errorEl) errorEl.style.display = 'none';

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Workbook contains no sheets.');
    }

    const rawSheets = workbook.SheetNames.map(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      return {
        name: sheetName,
        rows
      };
    });

    const qlaResult = processQlaWorkbookData(
      rawSheets,
      file.name,
      allRecords,
      activeGrouping
    );

    currentQlaData = {
      rawSheets,
      fileName: file.name,
      assessmentTitle: qlaResult.assessmentTitle,
      papers: qlaResult.papers,
      diagnostics: qlaResult.diagnostics
    };
    currentQlaFile = file;

    // Default selected paper for Questions tab
    if (qlaResult.papers.length > 0) {
      qlaQuestionsState.selectedPaper = qlaResult.papers[0].sheetName;
    }

    // Update QLA Card UI to loaded state
    updateQlaCardLoaded(qlaResult);

    // Show QLA insights section
    const insightsSection = document.getElementById('section-qla-insights');
    if (insightsSection) {
      insightsSection.style.display = 'block';
    }

    // Render Papers and skills, Questions, Classes, and Students tabs
    renderQlaPapersAndSkillsTab();
    renderQlaQuestionsTab();
    renderQlaClassesTab();
    renderQlaStudentsTab();
    renderQlaActionsTab();

    // Re-render diagnostics panel to include QLA block
    if (currentDiagnostics) {
      renderDiagnostics(currentDiagnostics, currentFileName, currentSnapshotName);
    }

    showToast(`Loaded QLA: ${qlaResult.assessmentTitle} (${qlaResult.papers.length} ${qlaResult.papers.length === 1 ? 'paper' : 'papers'})`);
  } catch (err) {
    console.error('QLA processing error:', err);
    if (errorEl) {
      errorEl.textContent = `Error reading QLA: ${err.message}`;
      errorEl.style.display = 'block';
    }
  }
}

/**
 * Download QLA Template (.xlsx)
 * Builds an offline .xlsx workbook with invented example data.
 * Pure download only - never loads data into the dashboard.
 */
function downloadQlaTemplate() {
  try {
    const wb = generateQlaTemplateWorkbook();
    XLSX.writeFile(wb, 'Y10_Spanish_Assessment_QLA_Example.xlsx');
    showToast('Downloaded QLA example template.');
  } catch (err) {
    console.error('Failed to generate QLA template:', err);
    showToast('Failed to download template.');
  }
}

/**
 * Initialize QLA UI handlers and tab switching
 */
function initQlaHandlers() {
  const browseBtn = document.getElementById('btn-browse-qla');
  const downloadBtn = document.getElementById('btn-download-qla-template');
  const fileInput = document.getElementById('qla-file-input');
  const dropzone = document.getElementById('panel-qla');
  const removeBtn = document.getElementById('btn-remove-qla');

  if (browseBtn && fileInput) {
    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!allRecords || allRecords.length === 0) return;
      fileInput.click();
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadQlaTemplate();
    });
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', (e) => {
      if (e.target.closest('#btn-remove-qla')) return;
      if (e.target.closest('#btn-download-qla-template')) return;
      if (e.target.closest('#qla-format-guide')) return;
      if (!allRecords || allRecords.length === 0) return;
      if (currentQlaData) return;
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) processQlaFile(file);
    });
  }

  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!allRecords || allRecords.length === 0) return;
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (!allRecords || allRecords.length === 0) return;
      const file = e.dataTransfer?.files?.[0];
      if (file) processQlaFile(file);
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearQlaData({ notify: true });
    });
  }

  // Filter controls for Papers and skills tab
  const filterClass = document.getElementById('qla-filter-class');
  const filterTier = document.getElementById('qla-filter-tier');
  const filterSen = document.getElementById('qla-filter-sen');
  const filterDis = document.getElementById('qla-filter-disadvantaged');
  const btnReset = document.getElementById('btn-qla-reset-filters');

  const onQlaFilterChange = () => {
    qlaTabFilters = {
      className: filterClass ? filterClass.value : 'ALL',
      tier: filterTier ? filterTier.value : 'ALL',
      sen: filterSen ? filterSen.value : 'ALL',
      disadvantaged: filterDis ? filterDis.value : 'ALL'
    };
    renderQlaPapersAndSkillsTab();
  };

  if (filterClass) filterClass.addEventListener('change', onQlaFilterChange);
  if (filterTier) filterTier.addEventListener('change', onQlaFilterChange);
  if (filterSen) filterSen.addEventListener('change', onQlaFilterChange);
  if (filterDis) filterDis.addEventListener('change', onQlaFilterChange);

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      qlaTabFilters = {
        className: 'ALL',
        tier: 'ALL',
        sen: 'ALL',
        disadvantaged: 'ALL'
      };
      if (filterClass) filterClass.value = 'ALL';
      if (filterTier) filterTier.value = 'ALL';
      if (filterSen) filterSen.value = 'ALL';
      if (filterDis) filterDis.value = 'ALL';
      renderQlaPapersAndSkillsTab();
    });
  }

  // Filter controls for Questions tab
  const qPaperSelect = document.getElementById('qla-questions-paper-select');
  const qFilterClass = document.getElementById('qla-q-filter-class');
  const qFilterSen = document.getElementById('qla-q-filter-sen');
  const qFilterDis = document.getElementById('qla-q-filter-disadvantaged');
  const btnQReset = document.getElementById('btn-qla-q-reset-filters');

  if (qPaperSelect) {
    qPaperSelect.addEventListener('change', () => {
      qlaQuestionsState.selectedPaper = qPaperSelect.value;
      renderQlaQuestionsTab();
    });
  }

  const onQuestionsFilterChange = () => {
    qlaQuestionsState.filters = {
      className: qFilterClass ? qFilterClass.value : 'ALL',
      sen: qFilterSen ? qFilterSen.value : 'ALL',
      disadvantaged: qFilterDis ? qFilterDis.value : 'ALL'
    };
    renderQlaQuestionsTab();
  };

  if (qFilterClass) qFilterClass.addEventListener('change', onQuestionsFilterChange);
  if (qFilterSen) qFilterSen.addEventListener('change', onQuestionsFilterChange);
  if (qFilterDis) qFilterDis.addEventListener('change', onQuestionsFilterChange);

  if (btnQReset) {
    btnQReset.addEventListener('click', () => {
      qlaQuestionsState.filters = {
        className: 'ALL',
        sen: 'ALL',
        disadvantaged: 'ALL'
      };
      if (qFilterClass) qFilterClass.value = 'ALL';
      if (qFilterSen) qFilterSen.value = 'ALL';
      if (qFilterDis) qFilterDis.value = 'ALL';
      renderQlaQuestionsTab();
    });
  }

  // Class selector for Classes tab
  const cClassSelect = document.getElementById('qla-classes-class-select');
  if (cClassSelect) {
    cClassSelect.addEventListener('change', () => {
      qlaClassesState.selectedClass = cClassSelect.value;
      renderQlaClassesTab();
    });
  }

  // Filter controls for Students tab
  const stFilterClass = document.getElementById('qla-students-filter-class');
  const stFilterSen = document.getElementById('qla-students-filter-sen');
  const stFilterDis = document.getElementById('qla-students-filter-disadvantaged');
  const stFilterWeakest = document.getElementById('qla-students-filter-weakest');
  const btnStReset = document.getElementById('btn-qla-students-reset-filters');

  const onStudentsFilterChange = () => {
    qlaStudentsState.filters = {
      className: stFilterClass ? stFilterClass.value : 'ALL',
      sen: stFilterSen ? stFilterSen.value : 'ALL',
      disadvantaged: stFilterDis ? stFilterDis.value : 'ALL',
      weakestPaper: stFilterWeakest ? stFilterWeakest.value : 'ALL'
    };
    renderQlaStudentsTab();
  };

  if (stFilterClass) stFilterClass.addEventListener('change', onStudentsFilterChange);
  if (stFilterSen) stFilterSen.addEventListener('change', onStudentsFilterChange);
  if (stFilterDis) stFilterDis.addEventListener('change', onStudentsFilterChange);
  if (stFilterWeakest) stFilterWeakest.addEventListener('change', onStudentsFilterChange);

  if (btnStReset) {
    btnStReset.addEventListener('click', () => {
      qlaStudentsState.filters = {
        className: 'ALL',
        sen: 'ALL',
        disadvantaged: 'ALL',
        weakestPaper: 'ALL'
      };
      if (stFilterClass) stFilterClass.value = 'ALL';
      if (stFilterSen) stFilterSen.value = 'ALL';
      if (stFilterDis) stFilterDis.value = 'ALL';
      if (stFilterWeakest) stFilterWeakest.value = 'ALL';
      renderQlaStudentsTab();
    });
  }

  // Tabs switching for #section-qla-insights
  const tabBtns = document.querySelectorAll('.qla-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      const targetTab = btn.getAttribute('data-tab');
      const panes = document.querySelectorAll('.qla-tab-pane');
      panes.forEach(pane => {
        pane.style.display = 'none';
        pane.classList.remove('active');
      });

      const activePane = document.getElementById(`pane-${targetTab}`);
      if (activePane) {
        activePane.style.display = 'block';
        activePane.classList.add('active');
      }

      if (targetTab === 'papers-skills') {
        renderQlaPapersAndSkillsTab();
      }
      if (targetTab === 'questions') {
        renderQlaQuestionsTab();
      }
      if (targetTab === 'classes') {
        renderQlaClassesTab();
      }
      if (targetTab === 'students') {
        renderQlaStudentsTab();
      }
      if (targetTab === 'actions') {
        renderQlaActionsTab();
      }
    });
  });
}

/**
 * Render QLA "Papers and skills" tab
 */
function renderQlaPapersAndSkillsTab() {
  if (!currentQlaData || !currentQlaData.papers || currentQlaData.papers.length === 0) return;

  const papers = currentQlaData.papers;

  // 1. Populate Class filter dropdown with active classes
  const classSet = new Set();
  for (const p of papers) {
    for (const s of p.students || []) {
      const cls = s.activeClass || s.className || s.currentClass;
      if (cls && cls !== 'Unassigned') classSet.add(cls);
    }
  }
  const classes = Array.from(classSet).sort();
  const filterClass = document.getElementById('qla-filter-class');
  if (filterClass) {
    const currentVal = qlaTabFilters.className || 'ALL';
    filterClass.innerHTML = `<option value="ALL">All classes</option>` +
      classes.map(c => `<option value="${c}" ${c === currentVal ? 'selected' : ''}>${c}</option>`).join('');
  }

  // 2. Count distinct students matching filters across papers
  const matchingStudentKeys = new Set();
  for (const p of papers) {
    if (qlaTabFilters.tier && qlaTabFilters.tier !== 'ALL' && p.tier !== qlaTabFilters.tier) continue;
    const filtered = filterQlaStudents(p.students || [], qlaTabFilters);
    for (const s of filtered) {
      if (s.status !== 'absent') {
        matchingStudentKeys.add(s.nameKey || s.name);
      }
    }
  }
  const badge = document.getElementById('qla-filter-count-badge');
  if (badge) {
    badge.textContent = `Showing ${matchingStudentKeys.size} ${matchingStudentKeys.size === 1 ? 'student' : 'students'}`;
  }

  // 3. Render Tier Highlights: Strongest & Weakest Paper Overall (Foundation & Higher separated)
  const tierHighlightsEl = document.getElementById('qla-tier-highlights');
  if (tierHighlightsEl) {
    const highlights = calculateCohortTierHighlights(papers, qlaTabFilters);
    let html = '';

    // Foundation card (show if tier filter allows Foundation)
    if (qlaTabFilters.tier === 'ALL' || qlaTabFilters.tier === 'Foundation') {
      if (highlights.foundation.strongest) {
        const s = highlights.foundation.strongest;
        const w = highlights.foundation.weakest;
        html += `
          <div class="qla-tier-card foundation">
            <div class="qla-tier-card-header">
              <span class="qla-tier-card-title">Foundation Tier Overview</span>
              <span class="qla-tier-badge foundation">Foundation</span>
            </div>
            <div class="qla-tier-card-body">
              <div class="qla-highlight-row">
                <span class="qla-highlight-label">
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: var(--brand-green);"><polyline points="18 15 12 9 6 15"></polyline></svg>
                  Strongest Paper
                </span>
                <span class="qla-highlight-value">${s.paper} F (${s.avgPct.toFixed(1)}%)</span>
              </div>
              <div class="qla-highlight-row">
                <span class="qla-highlight-label">
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #dc2626;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  Weakest Paper
                </span>
                <span class="qla-highlight-value">${w.paper} F (${w.avgPct.toFixed(1)}%)</span>
              </div>
            </div>
          </div>
        `;
      }
    }

    // Higher card (show if tier filter allows Higher)
    if (qlaTabFilters.tier === 'ALL' || qlaTabFilters.tier === 'Higher') {
      if (highlights.higher.strongest) {
        const s = highlights.higher.strongest;
        const w = highlights.higher.weakest;
        html += `
          <div class="qla-tier-card higher">
            <div class="qla-tier-card-header">
              <span class="qla-tier-card-title">Higher Tier Overview</span>
              <span class="qla-tier-badge higher">Higher</span>
            </div>
            <div class="qla-tier-card-body">
              <div class="qla-highlight-row">
                <span class="qla-highlight-label">
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: var(--brand-green);"><polyline points="18 15 12 9 6 15"></polyline></svg>
                  Strongest Paper
                </span>
                <span class="qla-highlight-value">${s.paper} H (${s.avgPct.toFixed(1)}%)</span>
              </div>
              <div class="qla-highlight-row">
                <span class="qla-highlight-label">
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #dc2626;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  Weakest Paper
                </span>
                <span class="qla-highlight-value">${w.paper} H (${w.avgPct.toFixed(1)}%)</span>
              </div>
            </div>
          </div>
        `;
      }
    }

    tierHighlightsEl.innerHTML = html;
  }

  // 4. Render Paper Cards Grid
  const paperCardsGrid = document.getElementById('qla-paper-cards-grid');
  if (paperCardsGrid) {
    let cardsHtml = '';
    for (const paper of papers) {
      const stats = calculatePaperStats(paper, qlaTabFilters);
      if (!stats) continue; // skipped by tier filter

      const tierClass = stats.tier.toLowerCase() === 'foundation' ? 'foundation' : stats.tier.toLowerCase() === 'higher' ? 'higher' : '';

      let bodyHtml = '';
      if (stats.n === 0) {
        bodyHtml = `
          <div class="qla-range-row" style="justify-content: center; padding: 20px 0; color: var(--text-muted);">
            No students matching current filters
          </div>
        `;
      } else {
        const sectionsHtml = stats.sections && stats.sections.length > 0 ? `
          <div class="qla-sections-block">
            <div class="qla-sections-heading">Section Breakdown</div>
            <div class="qla-sections-list">
              ${stats.sections.map(sec => `
                <div class="qla-section-item">
                  <span class="qla-section-name">${sec.section} (max ${sec.maxMarks})</span>
                  <span class="qla-section-stat">${sec.avgPct.toFixed(1)}%</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : '';

        bodyHtml = `
          <div class="qla-metrics-hero">
            <div class="qla-metric-avg-group">
              <span class="qla-metric-avg-val">${stats.avgPct.toFixed(1)}%</span>
              <span class="qla-metric-avg-label">Average</span>
            </div>
            <span class="qla-metric-n-badge">${stats.n} present</span>
          </div>

          <div class="qla-metrics-subgrid">
            <div class="qla-submetric">
              <span class="qla-submetric-val">${stats.medianPct !== null ? stats.medianPct.toFixed(1) + '%' : '-'}</span>
              <span class="qla-submetric-label">Median</span>
            </div>
            <div class="qla-submetric">
              <span class="qla-submetric-val">${stats.pctAtOrAbove50 !== null ? stats.pctAtOrAbove50.toFixed(1) + '%' : '-'}</span>
              <span class="qla-submetric-label">At or above 50%</span>
            </div>
          </div>

          <div class="qla-range-row">
            <span><strong>Highest:</strong> ${stats.highestScore.marks} / ${stats.totalMax} (${stats.highestScore.pct.toFixed(1)}%)</span>
            <span><strong>Lowest:</strong> ${stats.lowestScore.marks} / ${stats.totalMax} (${stats.lowestScore.pct.toFixed(1)}%)</span>
          </div>

          ${sectionsHtml}
        `;
      }

      cardsHtml += `
        <div class="qla-paper-card">
          <div class="qla-paper-card-header">
            <span class="qla-paper-card-title">${stats.paper}</span>
            <span class="qla-tier-badge ${tierClass}">${stats.tier}</span>
          </div>
          ${bodyHtml}
        </div>
      `;
    }
    paperCardsGrid.innerHTML = cardsHtml;
  }

  // 5. Render Class by Paper Comparison Table
  const tableEl = document.querySelector('#pane-papers-skills #qla-class-paper-table');
  if (tableEl) {
    const matrix = calculateClassPaperMatrix(papers, qlaTabFilters);

    if (matrix.papers.length === 0 || matrix.classes.length === 0) {
      tableEl.innerHTML = `<tbody><tr><td colspan="10" style="text-align: center; padding: 20px; color: var(--text-muted);">No class data matching current filters</td></tr></tbody>`;
    } else {
      const headerCols = matrix.papers.map(p => {
        const tierLetter = p.tier === 'Foundation' ? 'F' : p.tier === 'Higher' ? 'H' : p.tier;
        const tierClass = p.tier.toLowerCase() === 'foundation' ? 'foundation' : p.tier.toLowerCase() === 'higher' ? 'higher' : '';
        return `<th>${p.paper} <span class="qla-tier-badge ${tierClass}">${tierLetter}</span></th>`;
      }).join('');

      const cohortCells = matrix.papers.map(p => {
        const avg = p.cohortAvg !== null ? p.cohortAvg.toFixed(1) + '%' : '-';
        return `<td><strong>${avg}</strong></td>`;
      }).join('');

      const classRows = matrix.rows.map(row => {
        const cells = matrix.papers.map(p => {
          const cell = row.cells[p.sheetName];
          if (!cell || cell.avgPct === null) {
            return `<td style="color: var(--text-muted);">-</td>`;
          }
          if (cell.tooFew) {
            return `<td class="qla-cell-too-few" title="${cell.tooltip}">${cell.avgPct.toFixed(1)}%<span class="qla-cell-n">(n=${cell.n})</span></td>`;
          }
          return `<td class="qla-cell-${cell.band}">${cell.avgPct.toFixed(1)}%<span class="qla-cell-n">(n=${cell.n})</span></td>`;
        }).join('');

        return `<tr><td><strong>${row.className}</strong></td>${cells}</tr>`;
      }).join('');

      tableEl.innerHTML = `
        <thead>
          <tr>
            <th>Class</th>
            ${headerCols}
          </tr>
        </thead>
        <tbody>
          <tr style="background: var(--bg-body); border-bottom: 2px solid var(--border-color);">
            <td><strong>Cohort Average</strong></td>
            ${cohortCells}
          </tr>
          ${classRows}
        </tbody>
      `;
    }
  }

  // 6. Render Class Strongest / Weakest Highlights List
  const highlightsListEl = document.getElementById('qla-class-highlights-list');
  if (highlightsListEl) {
    const classHighlights = calculateClassPaperHighlights(papers, qlaTabFilters);
    if (classHighlights.length === 0) {
      highlightsListEl.innerHTML = `<div class="qla-class-highlight-item too-few">No classes found matching filters.</div>`;
    } else {
      highlightsListEl.innerHTML = classHighlights.map(item => `
        <div class="qla-class-highlight-item ${item.hasEnoughData ? '' : 'too-few'}">
          ${item.summaryText}
        </div>
      `).join('');
    }
  }
}

/**
 * Render QLA "Questions" tab
 */
function renderQlaQuestionsTab() {
  if (!currentQlaData || !currentQlaData.papers || currentQlaData.papers.length === 0) return;

  const papers = currentQlaData.papers;

  // 1. Ensure selectedPaper is valid
  if (!qlaQuestionsState.selectedPaper || !papers.some(p => p.sheetName === qlaQuestionsState.selectedPaper)) {
    qlaQuestionsState.selectedPaper = papers[0].sheetName;
  }

  const paper = papers.find(p => p.sheetName === qlaQuestionsState.selectedPaper) || papers[0];

  // 2. Populate Paper & Tier selector
  const paperSelect = document.getElementById('qla-questions-paper-select');
  if (paperSelect) {
    paperSelect.innerHTML = papers.map(p => {
      const tierLabel = p.tier ? ` (${p.tier})` : '';
      const isSelected = p.sheetName === paper.sheetName;
      return `<option value="${escapeHtml(p.sheetName)}" ${isSelected ? 'selected' : ''}>${escapeHtml(p.sheetName)}${tierLabel}</option>`;
    }).join('');
  }

  // 3. Populate Class dropdown with active classes from this paper
  const classSet = new Set();
  for (const s of paper.students || []) {
    const cls = s.activeClass || s.className || s.currentClass;
    if (cls && cls !== 'Unassigned') classSet.add(cls);
  }
  const classes = Array.from(classSet).sort();
  const filterClass = document.getElementById('qla-q-filter-class');
  if (filterClass) {
    const currentVal = qlaQuestionsState.filters.className || 'ALL';
    filterClass.innerHTML = `<option value="ALL">All classes</option>` +
      classes.map(c => `<option value="${escapeHtml(c)}" ${c === currentVal ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  }

  // 4. Update count badge for students matching filters (non-absent)
  const filteredStudents = filterQlaStudents(paper.students || [], qlaQuestionsState.filters);
  const presentStudents = filteredStudents.filter(s => s.status !== 'absent');
  const countBadge = document.getElementById('qla-q-filter-count-badge');
  if (countBadge) {
    countBadge.textContent = `Showing ${presentStudents.length} ${presentStudents.length === 1 ? 'student' : 'students'}`;
  }

  // 5. Calculate question stats with custom thresholds
  const qStats = calculateQuestionStats(paper, qlaQuestionsState.filters, qlaQuestionsState.thresholds);

  // 6. Quality Flags Alerts Banner
  const qualityFlagsEl = document.getElementById('qla-questions-quality-flags');
  if (qualityFlagsEl) {
    const flaggedQuestions = qStats.questions.filter(q => q.qualityFlags && q.qualityFlags.length > 0);
    if (flaggedQuestions.length === 0) {
      qualityFlagsEl.innerHTML = `
        <div class="qla-flag-card good">
          <div class="qla-flag-title">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: var(--brand-green);"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Question Quality: No Issues Detected
          </div>
          <div class="qla-flag-desc">All questions demonstrate healthy discrimination (≥ 10) and normal zero rates (&lt; 30%).</div>
        </div>
      `;
    } else {
      qualityFlagsEl.innerHTML = `
        <div class="qla-flag-card warn">
          <div class="qla-flag-title">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: #ea580c;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            Quality Alerts (${flaggedQuestions.length} ${flaggedQuestions.length === 1 ? 'question' : 'questions'})
          </div>
          <div class="qla-flag-items">
            ${flaggedQuestions.map(q => `
              <div class="qla-flag-item">
                <strong>${escapeHtml(q.label)}:</strong> ${q.qualityFlags.map(escapeHtml).join(' · ')}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  // 7. Dictation & Translation Skills Card
  const dictationCardEl = document.getElementById('qla-dictation-translation-card');
  if (dictationCardEl) {
    const specialInfo = getDictationAndTranslationQuestions(paper, qlaQuestionsState.filters, qlaQuestionsState.thresholds);
    if (!specialInfo.hasSpecialQuestions) {
      dictationCardEl.innerHTML = `
        <div class="qla-skills-card">
          <div class="qla-skills-card-title">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            Dictation &amp; Translation Skills
          </div>
          <div class="qla-skills-empty">No dictation or translation questions in this paper.</div>
        </div>
      `;
    } else {
      dictationCardEl.innerHTML = `
        <div class="qla-skills-card">
          <div class="qla-skills-card-title">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: var(--brand-green);"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            Dictation &amp; Translation Skills
          </div>
          <div class="qla-skills-list">
            ${specialInfo.questions.map(q => `
              <div class="qla-skill-row">
                <div class="qla-skill-name">
                  <strong>${escapeHtml(q.label)}</strong>
                  <span class="qla-skill-sub">${escapeHtml(q.topic || 'General')} · Max ${q.maxMarks}</span>
                </div>
                <div class="qla-skill-metrics">
                  <span class="qla-fac-badge ${q.facilityBand}">${q.facility !== null ? q.facility.toFixed(1) + '%' : '-'}</span>
                  <span class="qla-skill-metric-pill" title="Zero rate">0%: ${q.zeroRate !== null ? q.zeroRate.toFixed(1) + '%' : '-'}</span>
                  <span class="qla-skill-metric-pill" title="Discrimination">Disc: ${q.discrimination !== null ? q.discrimination.toFixed(1) : 'n/a'}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  // 8. Best 3 & Worst 3 Questions
  const bestWorstEl = document.getElementById('qla-best-worst-container');
  if (bestWorstEl) {
    const bwData = calculateBestAndWorstQuestions(paper, qlaQuestionsState.filters, 3);
    bestWorstEl.innerHTML = `
      <div class="table-header-bar">
        <div class="table-header-title">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: var(--brand-green);"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
          Best &amp; Worst Questions by Facility
        </div>
      </div>
      <div style="padding: 16px;">
        <div class="qla-best-worst-grid">
          <div class="qla-best-col">
            <div class="qla-bw-header best">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="18 15 12 9 6 15"></polyline></svg>
              Cohort Best 3 Questions
            </div>
            <div class="qla-bw-list">
              ${bwData.cohortBest.length > 0 ? bwData.cohortBest.map((q, i) => `
                <div class="qla-bw-item">
                  <span class="qla-bw-rank">#${i + 1}</span>
                  <div class="qla-bw-info">
                    <strong>${escapeHtml(q.label)}</strong>
                    <span class="qla-bw-topic">${escapeHtml(q.topic)} (${escapeHtml(q.section || 'Sec')})</span>
                  </div>
                  <span class="qla-fac-badge strong">${q.facility.toFixed(1)}%</span>
                </div>
              `).join('') : '<div class="qla-empty-text">No data</div>'}
            </div>
          </div>

          <div class="qla-worst-col">
            <div class="qla-bw-header worst">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="6 9 12 15 18 9"></polyline></svg>
              Cohort Worst 3 Questions
            </div>
            <div class="qla-bw-list">
              ${bwData.cohortWorst.length > 0 ? bwData.cohortWorst.map((q, i) => `
                <div class="qla-bw-item">
                  <span class="qla-bw-rank">#${i + 1}</span>
                  <div class="qla-bw-info">
                    <strong>${escapeHtml(q.label)}</strong>
                    <span class="qla-bw-topic">${escapeHtml(q.topic)} (${escapeHtml(q.section || 'Sec')})</span>
                  </div>
                  <span class="qla-fac-badge weak">${q.facility.toFixed(1)}%</span>
                </div>
              `).join('') : '<div class="qla-empty-text">No data</div>'}
            </div>
          </div>
        </div>

        ${bwData.classBreakdowns && bwData.classBreakdowns.length > 0 ? `
          <div class="qla-class-bw-section" style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 16px;">
            <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px;">Class Level Best &amp; Worst (Classes with ≥ 5 students)</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
              ${bwData.classBreakdowns.map(c => `
                <div class="qla-class-bw-card">
                  <div class="qla-class-bw-name">${escapeHtml(c.className)} <span style="font-weight: normal; font-size: 12px; color: var(--text-muted);">(n=${c.n})</span></div>
                  <div class="qla-class-bw-row"><span class="qla-bw-mini-tag best">Best:</span> ${c.best.map(q => `${escapeHtml(q.label)} (${q.facility.toFixed(0)}%)`).join(', ') || '-'}</div>
                  <div class="qla-class-bw-row"><span class="qla-bw-mini-tag worst">Worst:</span> ${c.worst.map(q => `${escapeHtml(q.label)} (${q.facility.toFixed(0)}%)`).join(', ') || '-'}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // 9. Sortable Question Table
  const questionTableEl = document.getElementById('qla-question-table');
  if (questionTableEl) {
    const rawQuestions = [...qStats.questions];
    const key = qlaQuestionsState.sortKey || 'key';
    const dir = qlaQuestionsState.sortDir === 'desc' ? -1 : 1;

    rawQuestions.sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      if (key === 'key') {
        const idxA = paper.questions.findIndex(q => q.key === a.key);
        const idxB = paper.questions.findIndex(q => q.key === b.key);
        return (idxA - idxB) * dir;
      }

      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'string') {
        return valA.localeCompare(valB) * dir;
      }
      return (valA - valB) * dir;
    });

    const getSortIndicator = (colKey) => {
      if (qlaQuestionsState.sortKey !== colKey) {
        return `<span class="sort-indicator inactive">↕</span>`;
      }
      return `<span class="sort-indicator active">${qlaQuestionsState.sortDir === 'desc' ? '▼' : '▲'}</span>`;
    };

    questionTableEl.innerHTML = `
      <thead>
        <tr>
          <th data-q-sort="key" class="sortable">Label ${getSortIndicator('key')}</th>
          <th data-q-sort="section" class="sortable">Section ${getSortIndicator('section')}</th>
          <th data-q-sort="topic" class="sortable">Topic ${getSortIndicator('topic')}</th>
          <th data-q-sort="ao" class="sortable">AO ${getSortIndicator('ao')}</th>
          <th data-q-sort="maxMarks" class="sortable" style="text-align: right;">Max ${getSortIndicator('maxMarks')}</th>
          <th data-q-sort="facility" class="sortable" style="text-align: right;">Facility % ${getSortIndicator('facility')}</th>
          <th data-q-sort="zeroRate" class="sortable" style="text-align: right;">Zero Rate % ${getSortIndicator('zeroRate')}</th>
          <th data-q-sort="discrimination" class="sortable" style="text-align: right;">Discrimination ${getSortIndicator('discrimination')}</th>
          <th>Quality Notes</th>
        </tr>
      </thead>
      <tbody>
        ${rawQuestions.map(q => `
          <tr>
            <td><strong>${escapeHtml(q.label)}</strong></td>
            <td>${escapeHtml(q.section || '-')}</td>
            <td>${escapeHtml(q.topic || '-')}</td>
            <td>${escapeHtml(q.ao || '-')}</td>
            <td style="text-align: right;">${q.maxMarks}</td>
            <td style="text-align: right;">
              <span class="qla-fac-badge ${q.facilityBand}">
                ${q.facility !== null ? q.facility.toFixed(1) + '%' : '-'}
              </span>
            </td>
            <td style="text-align: right;">${q.zeroRate !== null ? q.zeroRate.toFixed(1) + '%' : '-'}</td>
            <td style="text-align: right;">${q.discrimination !== null ? (q.discrimination > 0 ? '+' : '') + q.discrimination.toFixed(1) : 'n/a'}</td>
            <td>
              ${q.qualityFlags && q.qualityFlags.length > 0 ?
                `<span class="qla-table-flag-pill" title="${escapeHtml(q.qualityFlags.join(' · '))}">⚠️ ${escapeHtml(q.qualityFlags[0])}</span>` :
                `<span style="color: var(--text-muted); font-size: 12px;">✓ Ok</span>`
              }
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;

    // Attach click events on header elements for sorting
    const ths = questionTableEl.querySelectorAll('th[data-q-sort]');
    ths.forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const sortField = th.getAttribute('data-q-sort');
        if (qlaQuestionsState.sortKey === sortField) {
          qlaQuestionsState.sortDir = qlaQuestionsState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          qlaQuestionsState.sortKey = sortField;
          // For metric columns, default to desc; for labels default to asc
          if (['facility', 'zeroRate', 'discrimination', 'maxMarks'].includes(sortField)) {
            qlaQuestionsState.sortDir = 'desc';
          } else {
            qlaQuestionsState.sortDir = 'asc';
          }
        }
        renderQlaQuestionsTab();
      });
    });
  }

  // 10. Class Facility Heatmap
  const heatmapTableEl = document.getElementById('qla-question-heatmap-table');
  if (heatmapTableEl) {
    const heatmap = calculateQuestionHeatmap(paper, qlaQuestionsState.filters);
    const classHeaders = heatmap.classes.map(c => `
      <th style="text-align: right; min-width: 80px;">
        ${escapeHtml(c.className)}
        <div style="font-size: 11px; font-weight: normal; color: var(--text-muted);">(n=${c.n})</div>
      </th>
    `).join('');

    const rowsHtml = heatmap.rows.map(r => {
      const classCells = heatmap.classes.map(c => {
        const cell = r.cells[c.className];
        if (!cell || cell.tooFew) {
          return `<td class="qla-heatmap-cell qla-heatmap-too-few" style="text-align: right;" title="Fewer than 5 students in this class">-</td>`;
        }
        if (cell.flagged) {
          return `
            <td class="qla-heatmap-cell qla-heatmap-flagged" style="text-align: right;" title="${cell.diff} pts below cohort (${cell.cohortFacility?.toFixed(1)}%)">
              <strong>${cell.facility.toFixed(1)}%</strong>
              <div style="font-size: 10.5px; opacity: 0.85;">(-${cell.diff})</div>
            </td>
          `;
        }
        return `
          <td class="qla-heatmap-cell" style="text-align: right;">
            ${cell.facility !== null ? cell.facility.toFixed(1) + '%' : '-'}
          </td>
        `;
      }).join('');

      return `
        <tr>
          <td>
            <strong>${escapeHtml(r.label)}</strong>
            <span style="font-size: 11.5px; color: var(--text-muted); margin-left: 4px;">(${escapeHtml(r.topic || 'General')})</span>
          </td>
          <td style="text-align: right; background: var(--bg-body); border-right: 2px solid var(--border-color);">
            <strong>${r.cohortFacility !== null ? r.cohortFacility.toFixed(1) + '%' : '-'}</strong>
          </td>
          ${classCells}
        </tr>
      `;
    }).join('');

    heatmapTableEl.innerHTML = `
      <thead>
        <tr>
          <th style="min-width: 140px;">Question</th>
          <th style="text-align: right; min-width: 90px; border-right: 2px solid var(--border-color);">Cohort Average</th>
          ${classHeaders}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    `;
  }

  // 11. Topic and AO Summaries
  const summariesEl = document.getElementById('qla-topic-ao-container');
  if (summariesEl) {
    const summaries = calculateTopicAndAOSummaries(paper, qlaQuestionsState.filters);
    const strongThresh = qlaQuestionsState.thresholds.strong;
    const weakThresh = qlaQuestionsState.thresholds.weak;

    const topicCardHtml = `
      <div class="qla-summary-card">
        <div class="qla-summary-card-header">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: var(--brand-green);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          Topic Facility Summary
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th style="text-align: right;">Questions</th>
                <th style="text-align: right;">Total Marks</th>
                <th style="text-align: right;">Average Facility %</th>
              </tr>
            </thead>
            <tbody>
              ${summaries.topics.map(t => {
                let band = 'secure';
                if (t.avgFacility >= strongThresh) band = 'strong';
                else if (t.avgFacility < weakThresh) band = 'weak';
                return `
                  <tr>
                    <td><strong>${escapeHtml(t.topic)}</strong></td>
                    <td style="text-align: right;">${t.questionCount}</td>
                    <td style="text-align: right;">${t.maxMarks}</td>
                    <td style="text-align: right;"><span class="qla-fac-badge ${band}">${t.avgFacility.toFixed(1)}%</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    let aoCardHtml = '';
    if (summaries.hasAOs) {
      aoCardHtml = `
        <div class="qla-summary-card">
          <div class="qla-summary-card-header">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: var(--brand-green);"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
            Assessment Objective (AO) Summary
          </div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>AO</th>
                  <th style="text-align: right;">Questions</th>
                  <th style="text-align: right;">Total Marks</th>
                  <th style="text-align: right;">Average Facility %</th>
                </tr>
              </thead>
              <tbody>
                ${summaries.aos.map(a => {
                  let band = 'secure';
                  if (a.avgFacility >= strongThresh) band = 'strong';
                  else if (a.avgFacility < weakThresh) band = 'weak';
                  return `
                    <tr>
                      <td><strong>${escapeHtml(a.ao)}</strong></td>
                      <td style="text-align: right;">${a.questionCount}</td>
                      <td style="text-align: right;">${a.maxMarks}</td>
                      <td style="text-align: right;"><span class="qla-fac-badge ${band}">${a.avgFacility.toFixed(1)}%</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    summariesEl.innerHTML = topicCardHtml + aoCardHtml;
  }
}

/**
 * Render QLA "Classes" tab
 */
function renderQlaClassesTab() {
  if (!currentQlaData || !currentQlaData.papers || currentQlaData.papers.length === 0) return;

  const papers = currentQlaData.papers;

  // 1. Collect distinct active classes across all papers
  const classSet = new Set();
  for (const p of papers) {
    for (const s of p.students || []) {
      const cls = s.activeClass || s.className || s.currentClass;
      if (cls && cls !== 'Unassigned') classSet.add(cls);
    }
  }
  const classes = Array.from(classSet).sort();
  if (classes.length === 0) return;

  // 2. Select class: default to first if not selected or invalid
  if (!qlaClassesState.selectedClass || !classes.includes(qlaClassesState.selectedClass)) {
    qlaClassesState.selectedClass = classes[0];
  }
  const selectedClass = qlaClassesState.selectedClass;

  // 3. Populate Class selector dropdown
  const classSelect = document.getElementById('qla-classes-class-select');
  if (classSelect) {
    classSelect.innerHTML = classes.map(c => `
      <option value="${escapeHtml(c)}" ${c === selectedClass ? 'selected' : ''}>Class ${escapeHtml(c)}</option>
    `).join('');
  }

  // 4. Calculate report using pure function
  const report = calculateClassReport(papers, selectedClass, qlaQuestionsState.thresholds);

  // 5. Render Header Line Stats
  const headerStatsEl = document.getElementById('qla-class-header-stats');
  if (headerStatsEl) {
    const absencesText = report.absencesPerPaper.length > 0 ?
      report.absencesPerPaper.map(p => {
        const tierLabel = p.tier === 'Foundation' ? ' F' : p.tier === 'Higher' ? ' H' : '';
        return `${escapeHtml(p.paper)}${tierLabel}: ${p.absentCount} absent`;
      }).join(' · ') :
      'None';

    headerStatsEl.innerHTML = `
      <div class="qla-class-header-title">
        <span>Class <strong>${escapeHtml(report.className)}</strong> Report</span>
      </div>
      <div class="qla-class-header-metrics">
        <span class="qla-class-metric-pill">
          <strong>${report.totalStudents}</strong> ${report.totalStudents === 1 ? 'student' : 'students'} in class
        </span>
        <span class="qla-class-metric-pill">
          <strong>${report.satAtLeastOneCount}</strong> sat at least one paper
        </span>
        <span class="qla-class-metric-pill" style="color: var(--text-muted);">
          Absences: ${absencesText}
        </span>
      </div>
    `;
  }

  // 6. Render Paper Summary Table
  const paperTableEl = document.querySelector('#pane-classes #qla-class-paper-table');
  if (paperTableEl) {
    paperTableEl.innerHTML = `
      <thead>
        <tr>
          <th>Paper &amp; Tier</th>
          <th style="text-align: right;">Class Students (Present)</th>
          <th style="text-align: right;">Class Average %</th>
          <th style="text-align: right;">Cohort Average %</th>
          <th style="text-align: right;">Difference vs Cohort</th>
        </tr>
      </thead>
      <tbody>
        ${report.paperSummaries.map(p => {
          const tierBadge = p.tier ? `<span class="qla-tier-badge ${p.tier.toLowerCase()}" style="margin-left: 6px;">${p.tier}</span>` : '';
          if (p.tooFew) {
            return `
              <tr style="opacity: 0.65; background: var(--bg-body);">
                <td><strong>${escapeHtml(p.paper)}</strong> ${tierBadge}</td>
                <td style="text-align: right;">${p.n}</td>
                <td style="text-align: right;"><em style="color: var(--text-muted); font-size: 12px;">too few to compare</em></td>
                <td style="text-align: right;">${p.cohortAvgPct !== null ? p.cohortAvgPct.toFixed(1) + '%' : '-'}</td>
                <td style="text-align: right; color: var(--text-muted);">-</td>
              </tr>
            `;
          }
          const diffSign = p.diff > 0 ? '+' : '';
          return `
            <tr>
              <td><strong>${escapeHtml(p.paper)}</strong> ${tierBadge}</td>
              <td style="text-align: right;">${p.n}</td>
              <td style="text-align: right;"><strong class="qla-cell-${p.band}" style="padding: 2px 6px; border-radius: 4px;">${p.classAvgPct.toFixed(1)}%</strong></td>
              <td style="text-align: right;">${p.cohortAvgPct !== null ? p.cohortAvgPct.toFixed(1) + '%' : '-'}</td>
              <td style="text-align: right;">
                <span class="qla-cell-${p.band}" style="font-weight: 700; padding: 2px 6px; border-radius: 4px;">${diffSign}${p.diff.toFixed(1)} pts</span>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;
  }

  // 7. Render Strongest and Weakest Paper for this Class strictly per tier
  const highlightsEl = document.getElementById('qla-class-paper-highlights');
  if (highlightsEl) {
    const validTiers = Object.entries(report.tierHighlights?.byTier || {}).filter(([_, tData]) => tData.hasEnough);
    if (validTiers.length === 0) {
      highlightsEl.innerHTML = `
        <div class="qla-class-highlight-item too-few" style="padding: 12px 16px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 13px; color: var(--text-muted); width: 100%;">
          Too few students across papers to compare strongest and weakest papers.
        </div>
      `;
    } else {
      const cardsHtml = validTiers.map(([tierName, tData]) => {
        const s = tData.strongest;
        const w = tData.weakest;
        const sTierLabel = s.tier === 'Foundation' ? 'F' : s.tier === 'Higher' ? 'H' : '';
        const wTierLabel = w.tier === 'Foundation' ? 'F' : w.tier === 'Higher' ? 'H' : '';

        return `
          <div class="qla-tier-card" style="border-left: 4px solid var(--brand-green);">
            <div class="qla-tier-card-header">
              <span class="qla-tier-card-title">Strongest Paper (${tierName})</span>
              <span class="qla-tier-badge ${tierName.toLowerCase()}">${tierName}</span>
            </div>
            <div class="qla-tier-card-body">
              <div class="qla-highlight-row">
                <span class="qla-highlight-label">
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: var(--brand-green);"><polyline points="18 15 12 9 6 15"></polyline></svg>
                  ${escapeHtml(s.paper)} ${sTierLabel}
                </span>
                <span class="qla-highlight-value">${s.avgPct.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div class="qla-tier-card" style="border-left: 4px solid #dc2626;">
            <div class="qla-tier-card-header">
              <span class="qla-tier-card-title">Weakest Paper (${tierName})</span>
              <span class="qla-tier-badge ${tierName.toLowerCase()}">${tierName}</span>
            </div>
            <div class="qla-tier-card-body">
              <div class="qla-highlight-row">
                <span class="qla-highlight-label">
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: #dc2626;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  ${escapeHtml(w.paper)} ${wTierLabel}
                </span>
                <span class="qla-highlight-value">${w.avgPct.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      highlightsEl.innerHTML = cardsHtml;
    }
  }

  // 8. Render Best/Worst 3, Furthest Below, Beating Cohort
  const bwCard = document.getElementById('qla-class-best-worst-card');
  if (bwCard) {
    if (!report.hasEnoughQuestionData) {
      bwCard.innerHTML = `
        <div class="qla-class-card-header">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: var(--brand-green);"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
          Best &amp; Worst Questions
        </div>
        <div style="font-size: 13px; color: var(--text-muted); padding: 12px 0;">Too few students (fewer than 5) to compare questions.</div>
      `;
    } else {
      bwCard.innerHTML = `
        <div class="qla-class-card-header">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: var(--brand-green);"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
          Best &amp; Worst Questions
        </div>
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div>
            <div style="font-size: 12px; font-weight: 700; color: #15803d; text-transform: uppercase; margin-bottom: 6px;">Best 3 Questions</div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${report.bestQuestions.map(q => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--bg-body); border-radius: var(--radius-sm); font-size: 12.5px;">
                  <div>
                    <strong>${escapeHtml(q.label)}</strong>
                    <span style="color: var(--text-muted); font-size: 11px; margin-left: 4px;">(${escapeHtml(q.topic)})</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="qla-fac-badge strong">${q.classFacility.toFixed(1)}%</span>
                    <span style="font-size: 11px; color: var(--text-muted);">(Cohort: ${q.cohortFacility.toFixed(1)}%)</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div>
            <div style="font-size: 12px; font-weight: 700; color: #b91c1c; text-transform: uppercase; margin-bottom: 6px;">Worst 3 Questions</div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${report.worstQuestions.map(q => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--bg-body); border-radius: var(--radius-sm); font-size: 12.5px;">
                  <div>
                    <strong>${escapeHtml(q.label)}</strong>
                    <span style="color: var(--text-muted); font-size: 11px; margin-left: 4px;">(${escapeHtml(q.topic)})</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="qla-fac-badge weak">${q.classFacility.toFixed(1)}%</span>
                    <span style="font-size: 11px; color: var(--text-muted);">(Cohort: ${q.cohortFacility.toFixed(1)}%)</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }
  }

  const fbCard = document.getElementById('qla-class-furthest-below-card');
  if (fbCard) {
    if (!report.hasEnoughQuestionData) {
      fbCard.innerHTML = `
        <div class="qla-class-card-header">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: #dc2626;"><polyline points="6 9 12 15 18 9"></polyline></svg>
          Furthest Below Cohort
        </div>
        <div style="font-size: 13px; color: var(--text-muted); padding: 12px 0;">Too few students to compare.</div>
      `;
    } else if (report.furthestBelowCohort.length === 0) {
      fbCard.innerHTML = `
        <div class="qla-class-card-header">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: #dc2626;"><polyline points="6 9 12 15 18 9"></polyline></svg>
          Furthest Below Cohort
        </div>
        <div style="font-size: 13px; color: var(--text-muted); padding: 12px 0;">✓ No questions below the cohort average.</div>
      `;
    } else {
      fbCard.innerHTML = `
        <div class="qla-class-card-header">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: #dc2626;"><polyline points="6 9 12 15 18 9"></polyline></svg>
          Furthest Below Cohort (Largest Negative Gap)
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${report.furthestBelowCohort.map(q => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--bg-body); border-radius: var(--radius-sm); font-size: 12.5px;">
              <div>
                <strong>${escapeHtml(q.label)}</strong>
                <span style="color: var(--text-muted); font-size: 11px; margin-left: 4px;">(${escapeHtml(q.topic)})</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="qla-gap-badge qla-gap-neg">${q.gap.toFixed(1)} pts</span>
                <span style="font-size: 11px; color: var(--text-muted);">${q.classFacility.toFixed(1)}% vs ${q.cohortFacility.toFixed(1)}%</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  const bcCard = document.getElementById('qla-class-beating-cohort-card');
  if (bcCard) {
    if (!report.hasEnoughQuestionData) {
      bcCard.innerHTML = `
        <div class="qla-class-card-header">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: var(--brand-green);"><polyline points="18 15 12 9 6 15"></polyline></svg>
          Approaches worth sharing
        </div>
        <div style="font-size: 13px; color: var(--text-muted); padding: 12px 0;">Too few students to compare.</div>
      `;
    } else if (report.beatingCohort.length === 0) {
      bcCard.innerHTML = `
        <div class="qla-class-card-header">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: var(--brand-green);"><polyline points="18 15 12 9 6 15"></polyline></svg>
          Approaches worth sharing
        </div>
        <div style="font-size: 13px; color: var(--text-muted); padding: 12px 0;">No questions above the cohort average.</div>
      `;
    } else {
      bcCard.innerHTML = `
        <div class="qla-class-card-header" style="color: #15803d;">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: var(--brand-green);"><polyline points="18 15 12 9 6 15"></polyline></svg>
          Approaches worth sharing (Beating Cohort)
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${report.beatingCohort.map(q => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--bg-body); border-radius: var(--radius-sm); font-size: 12.5px;">
              <div>
                <strong>${escapeHtml(q.label)}</strong>
                <span style="color: var(--text-muted); font-size: 11px; margin-left: 4px;">(${escapeHtml(q.topic)})</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="qla-gap-badge qla-gap-pos">+${q.gap.toFixed(1)} pts</span>
                <span style="font-size: 11px; color: var(--text-muted);">${q.classFacility.toFixed(1)}% vs ${q.cohortFacility.toFixed(1)}%</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  // 9. Render Sortable Student List Table
  const studentTableEl = document.getElementById('qla-class-student-table');
  if (studentTableEl) {
    const rawStudents = [...report.students];
    const key = qlaClassesState.sortKey || 'name';
    const dir = qlaClassesState.sortDir === 'desc' ? -1 : 1;

    // Attach displayName to each student using getDisplayStudentName (Condition 3)
    rawStudents.forEach((st, idx) => {
      st._displayName = getDisplayStudentName(st, isNameHidden, idx + 1);
    });

    rawStudents.sort((a, b) => {
      if (key === 'name') {
        return a._displayName.localeCompare(b._displayName) * dir;
      }
      if (key === 'tier') {
        return a.tier.localeCompare(b.tier) * dir;
      }
      if (key === 'weakestPaper') {
        return a.weakestPaper.localeCompare(b.weakestPaper) * dir;
      }
      if (key === 'result') {
        const resA = a.result !== null ? a.result : -1;
        const resB = b.result !== null ? b.result : -1;
        return (resA - resB) * dir;
      }
      if (key.startsWith('paper_')) {
        const sheetName = key.replace('paper_', '');
        const valA = a.paperPercentages[sheetName];
        const valB = b.paperPercentages[sheetName];
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        return (valA - valB) * dir;
      }
      return 0;
    });

    const getSortIndicator = (colKey) => {
      if (qlaClassesState.sortKey !== colKey) {
        return `<span class="sort-indicator inactive">↕</span>`;
      }
      return `<span class="sort-indicator active">${qlaClassesState.sortDir === 'desc' ? '▼' : '▲'}</span>`;
    };

    const paperHeaders = report.paperSummaries.map(p => {
      const colKey = `paper_${p.sheetName}`;
      const tierShort = p.tier === 'Foundation' ? ' F' : p.tier === 'Higher' ? ' H' : '';
      return `
        <th data-c-sort="${escapeHtml(colKey)}" class="sortable" style="text-align: right;">
          ${escapeHtml(p.paper)}${tierShort} % ${getSortIndicator(colKey)}
        </th>
      `;
    }).join('');

    const rowsHtml = rawStudents.map(st => {
      const paperCells = report.paperSummaries.map(p => {
        const status = st.paperStatuses[p.sheetName];
        const pct = st.paperPercentages[p.sheetName];
        if (status === 'absent') {
          return `<td style="text-align: right; color: #dc2626; font-style: italic;">Absent</td>`;
        }
        if (pct !== null && pct !== undefined) {
          return `<td style="text-align: right;"><strong>${pct.toFixed(1)}%</strong></td>`;
        }
        return `<td style="text-align: right; color: var(--text-muted);">-</td>`;
      }).join('');

      return `
        <tr>
          <td><strong>${escapeHtml(st._displayName)}</strong></td>
          <td>${escapeHtml(st.tier)}</td>
          ${paperCells}
          <td>${escapeHtml(st.weakestPaper)}</td>
          <td>${renderGradeBadge(st.displayResult)}</td>
        </tr>
      `;
    }).join('');

    studentTableEl.innerHTML = `
      <thead>
        <tr>
          <th data-c-sort="name" class="sortable">Name ${getSortIndicator('name')}</th>
          <th data-c-sort="tier" class="sortable">Tier ${getSortIndicator('tier')}</th>
          ${paperHeaders}
          <th data-c-sort="weakestPaper" class="sortable">Weakest Paper ${getSortIndicator('weakestPaper')}</th>
          <th data-c-sort="result" class="sortable">Mock Result ${getSortIndicator('result')}</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    `;

    // Attach click events on header elements for sorting
    const ths = studentTableEl.querySelectorAll('th[data-c-sort]');
    ths.forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const sortField = th.getAttribute('data-c-sort');
        if (qlaClassesState.sortKey === sortField) {
          qlaClassesState.sortDir = qlaClassesState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          qlaClassesState.sortKey = sortField;
          if (sortField.startsWith('paper_') || sortField === 'result') {
            qlaClassesState.sortDir = 'desc';
          } else {
            qlaClassesState.sortDir = 'asc';
          }
        }
        renderQlaClassesTab();
      });
    });
  }
}

/**
 * Render QLA "Students" tab
 */
function renderQlaStudentsTab() {
  if (!currentQlaData || !currentQlaData.papers || currentQlaData.papers.length === 0) return;

  const papers = currentQlaData.papers;
  const filters = qlaStudentsState.filters;
  const isClassListsLoaded = classListsData !== null;

  // 1. Calculate students report using pure function
  const report = calculateStudentsReport(
    papers,
    filters,
    qlaQuestionsState.thresholds,
    { isClassListsLoaded }
  );

  // 2. Populate filters
  // A. Class dropdown:
  const classFilterSelect = document.getElementById('qla-students-filter-class');
  if (classFilterSelect) {
    const classSet = new Set();
    for (const s of report.allStudents) {
      if (s.activeClass && s.activeClass !== 'Unassigned') classSet.add(s.activeClass);
    }
    const sortedClasses = Array.from(classSet).sort();
    const currentSelected = filters.className || 'ALL';

    classFilterSelect.innerHTML = `
      <option value="ALL" ${currentSelected === 'ALL' ? 'selected' : ''}>All classes</option>
      ${sortedClasses.map(c => `
        <option value="${escapeHtml(c)}" ${c === currentSelected ? 'selected' : ''}>Class ${escapeHtml(c)}</option>
      `).join('')}
    `;
  }

  // B. Weakest Paper dropdown:
  const weakestFilterSelect = document.getElementById('qla-students-filter-weakest');
  if (weakestFilterSelect) {
    const currentSelected = filters.weakestPaper || 'ALL';
    weakestFilterSelect.innerHTML = `
      <option value="ALL" ${currentSelected === 'ALL' ? 'selected' : ''}>All weakest papers</option>
      ${report.allWeakestPapers.map(wp => `
        <option value="${escapeHtml(wp)}" ${wp === currentSelected ? 'selected' : ''}>${escapeHtml(wp)}</option>
      `).join('')}
    `;
  }

  // C. Badges / Count summary
  const badgeEl = document.getElementById('qla-students-filter-count-badge');
  if (badgeEl) {
    badgeEl.textContent = `${report.students.length} of ${report.allStudents.length} students`;
  }

  const countSummaryEl = document.getElementById('qla-students-count-summary');
  if (countSummaryEl) {
    countSummaryEl.textContent = `Showing ${report.students.length} of ${report.allStudents.length} students`;
  }

  // 3. Render Skill Profile Table
  const tableEl = document.getElementById('qla-students-profile-table');
  const emptyStateEl = document.getElementById('qla-students-empty-state');

  if (tableEl) {
    if (report.students.length === 0) {
      tableEl.innerHTML = '';
      if (emptyStateEl) emptyStateEl.style.display = 'block';
    } else {
      if (emptyStateEl) emptyStateEl.style.display = 'none';

      // Sort students based on sortKey and sortDir
      const rawStudents = [...report.students];
      const dir = qlaStudentsState.sortDir === 'desc' ? -1 : 1;

      // Attach display name for each student using getDisplayStudentName
      rawStudents.forEach((st, idx) => {
        st._displayName = getDisplayStudentName(st, isNameHidden, idx + 1);
      });

      rawStudents.sort((a, b) => {
        const key = qlaStudentsState.sortKey;
        if (key === 'name') {
          return dir * a._displayName.localeCompare(b._displayName);
        }
        if (key === 'class') {
          return dir * (a.activeClass || '').localeCompare(b.activeClass || '');
        }
        if (key === 'tier') {
          return dir * (a.tier || '').localeCompare(b.tier || '');
        }
        if (key.startsWith('paper_')) {
          const sheetName = key.replace('paper_', '');
          const valA = a.paperPercentages[sheetName] ?? -999;
          const valB = b.paperPercentages[sheetName] ?? -999;
          return dir * (valA - valB);
        }
        if (key === 'strongestPaper') {
          return dir * (a.strongestPaper || '').localeCompare(b.strongestPaper || '');
        }
        if (key === 'weakestPaper') {
          return dir * (a.weakestPaper || '').localeCompare(b.weakestPaper || '');
        }
        if (key === 'mockResult') {
          const ptsA = a.points ?? -1;
          const ptsB = b.points ?? -1;
          return dir * (ptsA - ptsB);
        }
        if (key === 'gap') {
          const gapA = a.gapValue ?? 999;
          const gapB = b.gapValue ?? 999;
          return dir * (gapA - gapB);
        }
        return 0;
      });

      const getSortIndicator = (colKey) => {
        if (qlaStudentsState.sortKey !== colKey) {
          return `<span class="sort-indicator inactive">↕</span>`;
        }
        return `<span class="sort-indicator active">${qlaStudentsState.sortDir === 'desc' ? '▼' : '▲'}</span>`;
      };

      const paperHeaders = report.papers.map(p => {
        const colKey = `paper_${p.sheetName}`;
        const tierShort = p.tier === 'Foundation' ? ' F' : p.tier === 'Higher' ? ' H' : '';
        return `
          <th data-st-sort="${escapeHtml(colKey)}" class="sortable" style="text-align: right;">
            ${escapeHtml(p.paper)}${tierShort} % ${getSortIndicator(colKey)}
          </th>
        `;
      }).join('');

      const rowsHtml = rawStudents.map(st => {
        const paperCells = report.papers.map(p => {
          const status = st.paperStatuses[p.sheetName];
          const pct = st.paperPercentages[p.sheetName];
          if (status === 'absent') {
            return `<td style="text-align: right; color: #dc2626; font-style: italic;">Absent</td>`;
          }
          if (pct !== null && pct !== undefined) {
            return `<td style="text-align: right;"><strong>${pct.toFixed(1)}%</strong></td>`;
          }
          return `<td style="text-align: right; color: var(--text-muted);">-</td>`;
        }).join('');

        let mockResultHtml = `<span style="color: var(--text-muted); font-style: italic;">no mock data</span>`;
        if (st.snapshotMatched && st.mockResult && st.mockResult !== 'no mock data') {
          mockResultHtml = renderGradeBadge(st.mockResult);
        }

        let gapHtml = `<span style="color: var(--text-muted); font-style: italic;">no mock data</span>`;
        if (st.snapshotMatched && st.gapValue !== null) {
          if (st.gapValue === 0) {
            gapHtml = `<span class="dist-band-pill band-at-above-5" style="padding: 2px 8px; font-size: 12px;">0</span>`;
          } else if (st.gapValue === 1) {
            gapHtml = `<span class="dist-band-pill band-one-away" style="padding: 2px 8px; font-size: 12px;">1</span>`;
          } else if (st.gapValue === 2) {
            gapHtml = `<span class="dist-band-pill band-two-away" style="padding: 2px 8px; font-size: 12px;">2</span>`;
          } else {
            gapHtml = `<span class="dist-band-pill band-three-plus-away" style="padding: 2px 8px; font-size: 12px;">${st.gapValue}</span>`;
          }
        }

        return `
          <tr>
            <td><strong>${escapeHtml(st._displayName)}</strong></td>
            <td>${escapeHtml(st.activeClass)}</td>
            <td>${escapeHtml(st.tier)}</td>
            ${paperCells}
            <td>${escapeHtml(st.strongestPaper)}</td>
            <td>${escapeHtml(st.weakestPaper)}</td>
            <td>${mockResultHtml}</td>
            <td>${gapHtml}</td>
          </tr>
        `;
      }).join('');

      tableEl.innerHTML = `
        <thead>
          <tr>
            <th data-st-sort="name" class="sortable">Name ${getSortIndicator('name')}</th>
            <th data-st-sort="class" class="sortable">Class ${getSortIndicator('class')}</th>
            <th data-st-sort="tier" class="sortable">Tier ${getSortIndicator('tier')}</th>
            ${paperHeaders}
            <th data-st-sort="strongestPaper" class="sortable">Strongest Paper ${getSortIndicator('strongestPaper')}</th>
            <th data-st-sort="weakestPaper" class="sortable">Weakest Paper ${getSortIndicator('weakestPaper')}</th>
            <th data-st-sort="mockResult" class="sortable">Mock Result ${getSortIndicator('mockResult')}</th>
            <th data-st-sort="gap" class="sortable">Gap to Grade 5 ${getSortIndicator('gap')}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      `;

      // Header click listeners for sorting
      const ths = tableEl.querySelectorAll('th[data-st-sort]');
      ths.forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
          const sortField = th.getAttribute('data-st-sort');
          if (qlaStudentsState.sortKey === sortField) {
            qlaStudentsState.sortDir = qlaStudentsState.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            qlaStudentsState.sortKey = sortField;
            if (sortField.startsWith('paper_') || sortField === 'mockResult') {
              qlaStudentsState.sortDir = 'desc';
            } else {
              qlaStudentsState.sortDir = 'asc';
            }
          }
          renderQlaStudentsTab();
        });
      });
    }
  }

  // 4. Section 2: "Grade 4s by weakest paper" strictly separated by tier
  const grade4Container = document.getElementById('qla-grade4-groups-container');
  if (grade4Container) {
    const fGroups = report.grade4sByWeakest?.foundation || [];
    const hGroups = report.grade4sByWeakest?.higher || [];
    const totalCount = fGroups.reduce((acc, g) => acc + g.count, 0) + hGroups.reduce((acc, g) => acc + g.count, 0);

    if (totalCount === 0) {
      grade4Container.innerHTML = `
        <div style="padding: 16px; color: var(--text-muted); font-size: 13px; text-align: center;">
          No students with Grade 4 found.
        </div>
      `;
    } else {
      const renderTierBlock = (tierName, groups) => {
        const tierCount = groups.reduce((acc, g) => acc + g.count, 0);
        const tierBadge = `<span class="qla-tier-badge ${tierName.toLowerCase()}">${tierCount} ${tierCount === 1 ? 'student' : 'students'}</span>`;

        let bodyHtml = '';
        if (groups.length === 0) {
          bodyHtml = `<div style="font-size: 12.5px; color: var(--text-muted); font-style: italic; padding: 6px 0 10px;">None in ${tierName.toLowerCase()} tier.</div>`;
        } else {
          bodyHtml = groups.map(group => {
            const toggleKey = `g4-${tierName}-${group.weakestPaper}`;
            const isExpanded = qlaStudentsState.expandedGrade4.has(toggleKey) || qlaStudentsState.expandedGrade4.has(group.weakestPaper);
            const studentRows = group.students.map((st, sIdx) => {
              const displayName = getDisplayStudentName(st, isNameHidden, sIdx + 1);
              return `
                <tr>
                  <td><strong>${escapeHtml(displayName)}</strong></td>
                  <td>${escapeHtml(st.activeClass)}</td>
                  <td>${renderGradeBadge(st.displayResult)}</td>
                  <td style="color: var(--text-muted);">${escapeHtml(group.weakestPaper)}</td>
                </tr>
              `;
            }).join('');

            return `
              <div class="qla-group-item ${isExpanded ? 'is-expanded' : ''}" data-g4-key="${escapeHtml(toggleKey)}">
                <div class="qla-group-header" data-toggle-g4="${escapeHtml(toggleKey)}">
                  <div class="qla-group-title">
                    <strong>${escapeHtml(group.weakestPaper)}</strong>
                    <span class="qla-group-badge highlight">${group.count} ${group.count === 1 ? 'student' : 'students'}</span>
                  </div>
                  <span class="qla-group-toggle-icon">▼</span>
                </div>
                ${isExpanded ? `
                  <div class="qla-group-content">
                    <table class="qla-sub-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Class</th>
                          <th>Mock Result</th>
                          <th>Weakest Paper</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${studentRows}
                      </tbody>
                    </table>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('');
        }

        return `
          <div style="margin-bottom: 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 6px; border-bottom: 1px solid var(--border-color); margin-bottom: 10px;">
              <span style="font-weight: 700; font-size: 13px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
                ${tierName} Tier
              </span>
              ${tierBadge}
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${bodyHtml}
            </div>
          </div>
        `;
      };

      grade4Container.innerHTML = renderTierBlock('Foundation', fGroups) + renderTierBlock('Higher', hGroups);

      grade4Container.querySelectorAll('[data-toggle-g4]').forEach(hdr => {
        hdr.addEventListener('click', () => {
          const key = hdr.getAttribute('data-toggle-g4');
          if (qlaStudentsState.expandedGrade4.has(key)) {
            qlaStudentsState.expandedGrade4.delete(key);
          } else {
            qlaStudentsState.expandedGrade4.add(key);
          }
          renderQlaStudentsTab();
        });
      });
    }
  }

  // 5. Section 3: "Farthest from grade 5 by weakest paper" strictly separated by tier
  const farthest5Container = document.getElementById('qla-farthest5-groups-container');
  if (farthest5Container) {
    const fGroups = report.farthestFrom5ByWeakest?.foundation || [];
    const hGroups = report.farthestFrom5ByWeakest?.higher || [];
    const totalCount = fGroups.reduce((acc, g) => acc + g.count, 0) + hGroups.reduce((acc, g) => acc + g.count, 0);

    if (totalCount === 0) {
      farthest5Container.innerHTML = `
        <div style="padding: 16px; color: var(--text-muted); font-size: 13px; text-align: center;">
          No students with gap ≥ 3 from grade 5 found.
        </div>
      `;
    } else {
      const renderTierBlock = (tierName, groups) => {
        const tierCount = groups.reduce((acc, g) => acc + g.count, 0);
        const tierBadge = `<span class="qla-tier-badge ${tierName.toLowerCase()}">${tierCount} ${tierCount === 1 ? 'student' : 'students'}</span>`;

        let bodyHtml = '';
        if (groups.length === 0) {
          bodyHtml = `<div style="font-size: 12.5px; color: var(--text-muted); font-style: italic; padding: 6px 0 10px;">None in ${tierName.toLowerCase()} tier.</div>`;
        } else {
          bodyHtml = groups.map(group => {
            const toggleKey = `f5-${tierName}-${group.weakestPaper}`;
            const isExpanded = qlaStudentsState.expandedFarthest5.has(toggleKey) || qlaStudentsState.expandedFarthest5.has(group.weakestPaper);
            const studentRows = group.students.map((st, sIdx) => {
              const displayName = getDisplayStudentName(st, isNameHidden, sIdx + 1);
              return `
                <tr>
                  <td><strong>${escapeHtml(displayName)}</strong></td>
                  <td>${escapeHtml(st.activeClass)}</td>
                  <td>${renderGradeBadge(st.displayResult)}</td>
                  <td><span class="dist-band-pill band-three-plus-away" style="padding: 1px 6px; font-size: 11px;">Gap ${st.gapValue}</span></td>
                  <td style="color: var(--text-muted);">${escapeHtml(group.weakestPaper)}</td>
                </tr>
              `;
            }).join('');

            return `
              <div class="qla-group-item ${isExpanded ? 'is-expanded' : ''}" data-f5-key="${escapeHtml(toggleKey)}">
                <div class="qla-group-header" data-toggle-f5="${escapeHtml(toggleKey)}">
                  <div class="qla-group-title">
                    <strong>${escapeHtml(group.weakestPaper)}</strong>
                    <span class="qla-group-badge highlight">${group.count} ${group.count === 1 ? 'student' : 'students'}</span>
                  </div>
                  <span class="qla-group-toggle-icon">▼</span>
                </div>
                ${isExpanded ? `
                  <div class="qla-group-content">
                    <table class="qla-sub-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Class</th>
                          <th>Mock Result</th>
                          <th>Gap</th>
                          <th>Weakest Paper</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${studentRows}
                      </tbody>
                    </table>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('');
        }

        return `
          <div style="margin-bottom: 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 6px; border-bottom: 1px solid var(--border-color); margin-bottom: 10px;">
              <span style="font-weight: 700; font-size: 13px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
                ${tierName} Tier
              </span>
              ${tierBadge}
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${bodyHtml}
            </div>
          </div>
        `;
      };

      farthest5Container.innerHTML = renderTierBlock('Foundation', fGroups) + renderTierBlock('Higher', hGroups);

      farthest5Container.querySelectorAll('[data-toggle-f5]').forEach(hdr => {
        hdr.addEventListener('click', () => {
          const key = hdr.getAttribute('data-toggle-f5');
          if (qlaStudentsState.expandedFarthest5.has(key)) {
            qlaStudentsState.expandedFarthest5.delete(key);
          } else {
            qlaStudentsState.expandedFarthest5.add(key);
          }
          renderQlaStudentsTab();
        });
      });
    }
  }

  // 6. Section 4: "Weak on the same questions"
  const weakQuestionsContainer = document.getElementById('qla-weak-questions-list-container');
  if (weakQuestionsContainer) {
    if (report.weakQuestions.length === 0) {
      weakQuestionsContainer.innerHTML = `
        <div style="padding: 16px; color: var(--text-muted); font-size: 13px; text-align: center;">
          No questions below the weak threshold (${qlaQuestionsState.thresholds.weak}%).
        </div>
      `;
    } else {
      weakQuestionsContainer.innerHTML = report.weakQuestions.map(q => {
        const itemKey = `${q.sheetName}__${q.key}`;
        const isExpanded = qlaStudentsState.expandedWeakQuestions.has(itemKey);
        const tierShort = q.tier === 'Foundation' ? ' F' : q.tier === 'Higher' ? ' H' : '';

        const studentRows = q.students.map((st, sIdx) => {
          const displayName = getDisplayStudentName(st, isNameHidden, sIdx + 1);
          return `
            <tr>
              <td><strong>${escapeHtml(displayName)}</strong></td>
              <td>${escapeHtml(st.activeClass)}</td>
              <td>${st.mark} / ${st.maxMarks}</td>
              <td><strong>${st.pct}%</strong></td>
            </tr>
          `;
        }).join('');

        return `
          <div class="qla-group-item ${isExpanded ? 'is-expanded' : ''}">
            <div class="qla-group-header" data-toggle-wq="${escapeHtml(itemKey)}">
              <div class="qla-group-title">
                <span class="qla-fac-badge weak">${q.facility.toFixed(1)}%</span>
                <span><strong>${escapeHtml(q.paper)}${tierShort}</strong>: ${escapeHtml(q.label)} ${q.topic ? `(${escapeHtml(q.topic)})` : ''}</span>
                <span class="qla-group-badge">${q.weakStudentCount} ${q.weakStudentCount === 1 ? 'student' : 'students'} &lt; 50%</span>
              </div>
              <span class="qla-group-toggle-icon">▼</span>
            </div>
            ${isExpanded ? `
              <div class="qla-group-content">
                <table class="qla-sub-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Mark</th>
                      <th>Score %</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${studentRows.length > 0 ? studentRows : `<tr><td colspan="4" style="color: var(--text-muted); text-align: center;">No students scored under 50% on this question.</td></tr>`}
                  </tbody>
                </table>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

      weakQuestionsContainer.querySelectorAll('[data-toggle-wq]').forEach(hdr => {
        hdr.addEventListener('click', () => {
          const key = hdr.getAttribute('data-toggle-wq');
          if (qlaStudentsState.expandedWeakQuestions.has(key)) {
            qlaStudentsState.expandedWeakQuestions.delete(key);
          } else {
            qlaStudentsState.expandedWeakQuestions.add(key);
          }
          renderQlaStudentsTab();
        });
      });
    }
  }

  // 7. Section 5: Group Gaps Table
  const groupGapsTableEl = document.getElementById('qla-group-gaps-table');
  if (groupGapsTableEl) {
    const rowsHtml = [];

    report.groupGaps.forEach(pGap => {
      const tierShort = pGap.tier === 'Foundation' ? ' F' : pGap.tier === 'Higher' ? ' H' : '';
      const paperName = `${pGap.paper}${tierShort}`;

      pGap.comparisons.forEach(comp => {
        let gapDisplay = '-';
        if (comp.tooFew) {
          gapDisplay = `<span class="qla-too-few-dimmed" title="too few to compare">too few (&lt; 5)</span>`;
        } else if (comp.gap !== null) {
          const gapClass = comp.gap > 0 ? 'qla-gap-pos' : comp.gap < 0 ? 'qla-gap-neg' : '';
          const sign = comp.gap > 0 ? '+' : '';
          gapDisplay = `<span class="qla-gap-badge ${gapClass}">${sign}${comp.gap.toFixed(1)} pp</span>`;
        }

        const avgADisplay = comp.avgA !== null ? `${comp.avgA.toFixed(1)}% (n=${comp.nA})` : 'n/a';
        const avgBDisplay = comp.avgB !== null ? `${comp.avgB.toFixed(1)}% (n=${comp.nB})` : 'n/a';

        rowsHtml.push(`
          <tr class="${comp.tooFew ? 'qla-too-few-dimmed' : ''}">
            <td><strong>${escapeHtml(paperName)}</strong></td>
            <td>${escapeHtml(comp.title)}</td>
            <td style="text-align: right;">${escapeHtml(avgADisplay)}</td>
            <td style="text-align: right;">${escapeHtml(avgBDisplay)}</td>
            <td style="text-align: right;">${gapDisplay}</td>
          </tr>
        `);
      });
    });

    groupGapsTableEl.innerHTML = `
      <thead>
        <tr>
          <th>Paper &amp; Tier</th>
          <th>Comparison</th>
          <th style="text-align: right;">Group A Average</th>
          <th style="text-align: right;">Group B Average</th>
          <th style="text-align: right;">Points Gap</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml.length > 0 ? rowsHtml.join('') : '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No paper data available.</td></tr>'}
      </tbody>
    `;
  }

  // 8. Section 6: Missed Papers Table
  const missedPapersTableEl = document.getElementById('qla-missed-papers-table');
  if (missedPapersTableEl) {
    if (report.missedPapersStudents.length === 0) {
      missedPapersTableEl.innerHTML = `
        <tbody>
          <tr>
            <td style="text-align: center; color: var(--text-muted); padding: 18px;">
              No students missed any papers.
            </td>
          </tr>
        </tbody>
      `;
    } else {
      const rowsHtml = report.missedPapersStudents.map((st, idx) => {
        const displayName = getDisplayStudentName(st, isNameHidden, idx + 1);
        const tagsHtml = st.missedPapers.map(p => `
          <span style="display: inline-block; background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 600; margin-right: 6px; margin-bottom: 2px;">
            ${escapeHtml(p)}
          </span>
        `).join('');

        return `
          <tr>
            <td><strong>${escapeHtml(displayName)}</strong></td>
            <td>${escapeHtml(st.activeClass)}</td>
            <td style="text-align: center;"><span class="badge" style="background:#fef3c7; color:#92400e; font-weight:700;">${st.missedCount}</span></td>
            <td>${tagsHtml}</td>
          </tr>
        `;
      }).join('');

      missedPapersTableEl.innerHTML = `
        <thead>
          <tr>
            <th>Student Name</th>
            <th>Class</th>
            <th style="text-align: center;">Missed Papers Count</th>
            <th>Papers Missed</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      `;
    }
  }
}

/**
 * Safely copy text to clipboard with textarea fallback
 */
async function copyToClipboard(text) {
  if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * Render QLA "QLA actions" tab
 */
/**
 * Render QLA "QLA actions" tab
 */
function renderQlaActionsTab() {
  if (!currentQlaData || !currentQlaData.papers || currentQlaData.papers.length === 0) return;

  const actionData = generateQlaActions(currentQlaData.papers, {
    thresholds: qlaActionsState.thresholds,
    isClassListsLoaded: classListsData !== null
  });

  const countBadge = document.getElementById('qla-actions-count-badge');
  if (countBadge) {
    countBadge.textContent = `${actionData.totalActions} action${actionData.totalActions === 1 ? '' : 's'}`;
  }

  const emptyState = document.getElementById('qla-actions-empty-state');
  const cardTopPriorities = document.getElementById('qla-actions-card-top-priorities');
  const toggleAllContainer = document.getElementById('qla-toggle-all-actions-container');
  const allActionsContainer = document.getElementById('qla-all-actions-container');

  if (actionData.totalActions === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (cardTopPriorities) cardTopPriorities.style.display = 'none';
    if (toggleAllContainer) toggleAllContainer.style.display = 'none';
    if (allActionsContainer) allActionsContainer.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (cardTopPriorities) cardTopPriorities.style.display = 'block';
  if (toggleAllContainer) toggleAllContainer.style.display = 'block';

  // Helper to render drawer for an action
  const renderDrawerHtml = (action) => {
    const isExpanded = qlaActionsState.expandedActions.has(action.id);
    if (!isExpanded) return '';

    if (!action.students || action.students.length === 0) {
      return `
        <div class="qla-action-students-drawer" id="drawer-${action.id}">
          <div style="font-size: 12.5px; color: var(--text-muted); font-style: italic;">
            Department-wide action — no individual student list attached.
          </div>
        </div>
      `;
    }

    const hasMarks = action.students.some(s => s.mark !== undefined);
    const hasPct = action.students.some(s => s.pct !== undefined);
    const hasDetail = action.students.some(s => s.detail || s.mockResult || s.weakestPaper);

    const studentRows = action.students.map((st, idx) => {
      let stObj = st;
      if ((!st.surname || !st.firstName) && st.name && st.name.includes(',')) {
        const parts = st.name.split(',');
        stObj = { ...st, surname: parts[0].trim(), firstName: parts.slice(1).join(',').trim() };
      }
      const displayName = getDisplayStudentName(stObj, isNameHidden, idx + 1);
      const classDisplay = st.activeClass || st.className || '—';
      const markDisplay = st.mark !== undefined ? `${st.mark} / ${st.maxMarks}` : '—';
      const pctDisplay = st.pct !== undefined ? `${st.pct}%` : '—';
      const detailDisplay = st.detail || (st.mockResult ? `Grade: ${st.mockResult}` : '') || '';

      return `
        <tr>
          <td><strong>${escapeHtml(displayName)}</strong></td>
          <td>${escapeHtml(classDisplay)}</td>
          ${hasMarks ? `<td style="text-align: right;">${escapeHtml(markDisplay)}</td>` : ''}
          ${hasPct ? `<td style="text-align: right;">${escapeHtml(pctDisplay)}</td>` : ''}
          ${hasDetail ? `<td>${escapeHtml(detailDisplay)}</td>` : ''}
        </tr>
      `;
    }).join('');

    return `
      <div class="qla-action-students-drawer" id="drawer-${action.id}">
        <div style="margin-bottom: 8px; font-size: 12px; font-weight: 600; color: var(--text-secondary);">
          Students affected (${action.students.length}):
        </div>
        <div class="table-responsive" style="margin: 0; max-height: 240px; overflow-y: auto;">
          <table class="data-table" style="font-size: 12px; margin-bottom: 0;">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Class</th>
                ${hasMarks ? '<th style="text-align: right;">Mark</th>' : ''}
                ${hasPct ? '<th style="text-align: right;">Score %</th>' : ''}
                ${hasDetail ? '<th>Detail</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${studentRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  // 1. Render Top Priorities
  const topTitle = document.getElementById('qla-top-priorities-title');
  if (topTitle) {
    topTitle.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" style="color: var(--brand-dark);"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
      Top ${actionData.topPriorities.length} priorities
    `;
  }

  const topPrioritiesList = document.getElementById('qla-top-priorities-list');
  if (topPrioritiesList) {
    if (actionData.topPriorities.length === 0) {
      topPrioritiesList.innerHTML = `<div style="padding: 16px; color: var(--text-muted); font-size: 13px; font-style: italic;">No priorities currently identified.</div>`;
    } else {
      topPrioritiesList.innerHTML = actionData.topPriorities.map((action, idx) => {
        const priorityNum = idx + 1;
        const isExpanded = qlaActionsState.expandedActions.has(action.id);
        const tierBadgeClass = action.tier === 'Foundation' ? 'foundation' : action.tier === 'Higher' ? 'higher' : 'cohort';
        const numStudents = action.studentsAffected || 0;
        const drawerHtml = renderDrawerHtml(action);

        return `
          <div class="qla-action-card priority-item" id="top-priority-${priorityNum}">
            <div class="qla-action-main">
              <div style="display: flex; align-items: flex-start; gap: 12px; flex: 1; min-width: 260px;">
                <div class="priority-rank-num" title="Priority ${priorityNum}">
                  ${priorityNum}
                </div>
                <div class="qla-action-title-area">
                  <div class="qla-action-badges-row">
                    <span class="qla-tier-badge ${tierBadgeClass}">${escapeHtml(action.paperAndTier || action.paper || '')}</span>
                    ${action.question ? `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:600; font-size:11px;">${escapeHtml(action.question)}</span>` : ''}
                    ${action.targetGroup ? `<span class="badge" style="background:#fef3c7; color:#92400e; font-weight:600; font-size:11px;">${escapeHtml(action.targetGroup)}</span>` : ''}
                  </div>
                  <div class="qla-action-title">${escapeHtml(action.title)}</div>
                  ${action.why ? `<div class="qla-action-why">${escapeHtml(action.why)}</div>` : ''}
                </div>
              </div>
              <div class="qla-action-metrics-area">
                <span class="qla-action-affected-pill">
                  <strong>${numStudents}</strong> student${numStudents === 1 ? '' : 's'}
                </span>
                <button type="button" class="qla-action-btn-show" data-action-toggle="${action.id}" aria-expanded="${isExpanded}">
                  ${isExpanded ? 'Hide students' : 'Show students'}
                </button>
              </div>
            </div>
            ${drawerHtml}
          </div>
        `;
      }).join('');
    }
  }

  // 2. Render Full List Toggle Button & Container
  const btnToggleAll = document.getElementById('btn-toggle-all-actions');
  const toggleIcon = document.getElementById('toggle-all-actions-icon');
  const toggleText = document.getElementById('toggle-all-actions-text');

  if (btnToggleAll && toggleText && toggleIcon && allActionsContainer) {
    btnToggleAll.setAttribute('aria-expanded', qlaActionsState.showAllActions ? 'true' : 'false');
    toggleIcon.textContent = qlaActionsState.showAllActions ? '▼' : '▶';
    toggleText.textContent = qlaActionsState.showAllActions
      ? `Hide full action list (${actionData.totalActions})`
      : `Show all actions (${actionData.totalActions})`;
    allActionsContainer.style.display = qlaActionsState.showAllActions ? 'block' : 'none';

    btnToggleAll.onclick = () => {
      qlaActionsState.showAllActions = !qlaActionsState.showAllActions;
      renderQlaActionsTab();
    };
  }

  // 3. Render Full List Categories
  const deptActions = actionData.byCategory['Whole department'] || [];
  const classActions = actionData.byCategory['Class level'] || [];
  const studentActions = actionData.byCategory['Students'] || [];

  const badgeDept = document.getElementById('qla-actions-badge-dept');
  if (badgeDept) badgeDept.textContent = `${deptActions.length} action${deptActions.length === 1 ? '' : 's'}`;

  const badgeClass = document.getElementById('qla-actions-badge-class');
  if (badgeClass) badgeClass.textContent = `${classActions.length} action${classActions.length === 1 ? '' : 's'}`;

  const badgeStudents = document.getElementById('qla-actions-badge-students');
  if (badgeStudents) badgeStudents.textContent = `${studentActions.length} action${studentActions.length === 1 ? '' : 's'}`;

  const renderActionList = (actionsList, categoryClass) => {
    if (actionsList.length === 0) {
      return `<div style="padding: 16px; color: var(--text-muted); font-size: 13px; font-style: italic;">No actions currently required in this category.</div>`;
    }

    return actionsList.map(action => {
      const isExpanded = qlaActionsState.expandedActions.has(action.id);
      const tierBadgeClass = action.tier === 'Foundation' ? 'foundation' : action.tier === 'Higher' ? 'higher' : 'cohort';
      const numStudents = action.studentsAffected || 0;
      const drawerHtml = renderDrawerHtml(action);

      return `
        <div class="qla-action-card ${categoryClass}" id="${action.id}">
          <div class="qla-action-main">
            <div class="qla-action-title-area">
              <div class="qla-action-badges-row">
                <span class="qla-tier-badge ${tierBadgeClass}">${escapeHtml(action.paperAndTier || action.paper || '')}</span>
                ${action.question ? `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:600; font-size:11px;">${escapeHtml(action.question)}</span>` : ''}
                ${action.targetGroup ? `<span class="badge" style="background:#fef3c7; color:#92400e; font-weight:600; font-size:11px;">${escapeHtml(action.targetGroup)}</span>` : ''}
              </div>
              <div class="qla-action-title">${escapeHtml(action.title)}</div>
              ${action.why ? `<div class="qla-action-why">${escapeHtml(action.why)}</div>` : ''}
            </div>
            <div class="qla-action-metrics-area">
              <span class="qla-action-affected-pill">
                <strong>${numStudents}</strong> student${numStudents === 1 ? '' : 's'} affected
              </span>
              <button type="button" class="qla-action-btn-show" data-action-toggle="${action.id}" aria-expanded="${isExpanded}">
                ${isExpanded ? 'Hide students' : 'Show students'}
              </button>
            </div>
          </div>
          ${drawerHtml}
        </div>
      `;
    }).join('');
  };

  const listDept = document.getElementById('qla-actions-list-dept');
  if (listDept) listDept.innerHTML = renderActionList(deptActions, 'dept');

  const listClass = document.getElementById('qla-actions-list-class');
  if (listClass) listClass.innerHTML = renderActionList(classActions, 'class-level');

  const listStudents = document.getElementById('qla-actions-list-students');
  if (listStudents) listStudents.innerHTML = renderActionList(studentActions, 'students');

  // Attach click listeners for all "Show students" buttons (Top priorities + Full list)
  const container = document.getElementById('pane-actions');
  if (container) {
    container.querySelectorAll('[data-action-toggle]').forEach(btn => {
      btn.onclick = () => {
        const actionId = btn.getAttribute('data-action-toggle');
        if (qlaActionsState.expandedActions.has(actionId)) {
          qlaActionsState.expandedActions.delete(actionId);
        } else {
          qlaActionsState.expandedActions.add(actionId);
        }
        renderQlaActionsTab();
      };
    });
  }
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
    // Clearing snapshot also clears class lists and QLA
    clearClassLists();
    clearQlaData();

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

    // Render Movement and Class Balance if class lists loaded
    renderMovementAndBalanceSection();

    // Enable QLA Card now that snapshot is loaded
    enableQlaCard();

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

  const coverPeriod = document.getElementById('print-cover-period');
  if (coverPeriod) {
    const groupLabel = activeGrouping === 'new' ? 'New classes (Year 11)' : 'Current classes (Year 10)';
    coverPeriod.textContent = `Snapshot: ${currentSnapshotName || currentFileName || 'Mock Snapshot'} · Grouping: ${groupLabel}`;
  }

  const coverFilters = document.getElementById('print-cover-filters');
  if (coverFilters) coverFilters.textContent = livePdfFilterSummary(distFilters, selectedTopPerformersClass);

  const coverQla = document.getElementById('print-cover-qla-title');
  if (coverQla) {
    coverQla.textContent = currentQlaData?.assessmentTitle || '';
    coverQla.parentElement.style.display = currentQlaData?.papers?.length ? '' : 'none';
  }

  const coverDate = document.getElementById('print-cover-date');
  if (coverDate) coverDate.textContent = ukDateToday;

  const coverPrivacy = document.getElementById('print-cover-privacy');
  if (coverPrivacy) {
    coverPrivacy.textContent = (pdfExportOptions.hideNames || isNameHidden)
      ? 'Student initials and class'
      : 'Standard class identifiers';
  }

  const runningPeriod = document.getElementById('print-running-period');
  if (runningPeriod) runningPeriod.textContent = currentFileName || 'Mock Snapshot';

  // Update contents list
  const contentsList = document.getElementById('print-contents-list');
  if (contentsList) {
    contentsList.innerHTML = '';
    selectedPdfSections(pdfExportOptions, !!classListsData, !!currentQlaData?.papers?.length).forEach(section => {
      const li = document.createElement('li');
      li.textContent = section.label;
      contentsList.appendChild(li);
    });
  }
}

function renderPrintSuggestedActions() {
  const top = document.getElementById('print-suggested-top');
  const full = document.getElementById('print-suggested-full');
  if (!top || !full) return;
  top.replaceChildren();
  full.replaceChildren();

  const filteredRecords = filterDistanceRecords(getActiveRecords(), distFilters);
  const result = generateSuggestedActions(filteredRecords, {
    classListsData,
    qlaPapers: currentQlaData?.papers || null,
    rawSnapshotRecords: allRecords
  });
  const addAction = (parent, action) => {
    const item = document.createElement('div');
    item.className = 'print-action-item';
    const title = document.createElement('strong');
    title.textContent = `[${action.source}] ${action.title}`;
    item.appendChild(title);
    if (action.why) {
      const why = document.createElement('p');
      why.textContent = action.why;
      item.appendChild(why);
    }
    parent.appendChild(item);
  };

  const topHeading = document.createElement('h3');
  topHeading.textContent = 'Top 5 priorities';
  top.appendChild(topHeading);
  if (result.topPriorities.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No suggested actions at the current thresholds.';
    top.appendChild(empty);
  }
  result.topPriorities.forEach(action => addAction(top, action));

  if (pdfExportOptions.suggestedFull) {
    const fullHeading = document.createElement('h3');
    fullHeading.textContent = 'Full action list';
    full.appendChild(fullHeading);
    result.actions.forEach(action => addAction(full, action));
  }
}

function preparePrintMovementMatrix() {
  const container = document.getElementById('movement-matrix-container');
  const table = container?.querySelector('.movement-matrix-table');
  const columnCount = table?.tHead?.rows[0]?.cells.length || 0;
  if (!table || columnCount <= 10) return () => {};

  const wrapper = document.createElement('div');
  wrapper.className = 'print-only';
  const newClassCount = columnCount - 3;
  for (const indices of matrixPrintColumns(columnCount)) {
    const start = indices[1];
    const end = indices[indices.length - 3];
    const chunk = document.createElement('div');
    chunk.className = 'print-matrix-chunk';
    const heading = document.createElement('h4');
    heading.textContent = `Movement matrix: new classes ${start}–${end} of ${newClassCount}`;
    chunk.appendChild(heading);
    const chunkTable = table.cloneNode(false);
    for (const section of [table.tHead, table.tBodies[0]]) {
      const copySection = section.cloneNode(false);
      for (const row of section.rows) {
        const copyRow = row.cloneNode(false);
        indices.forEach(index => copyRow.appendChild(row.cells[index].cloneNode(true)));
        copySection.appendChild(copyRow);
      }
      chunkTable.appendChild(copySection);
    }
    chunk.appendChild(chunkTable);
    wrapper.appendChild(chunk);
  }
  container.classList.add('pdf-matrix-split');
  container.appendChild(wrapper);
  return () => {
    wrapper.remove();
    container.classList.remove('pdf-matrix-split');
  };
}

function maskPrintStudentNames(sections) {
  const records = [
    ...allRecords,
    ...(classListsData?.allNewClassStudents || []),
    ...(classListsData?.inNewClassesNoMockResult || []),
    ...(classListsData?.inSnapshotNotInNewClass || []),
    ...(currentQlaData?.diagnostics?.unmatchedStudents || []),
    ...(currentQlaData?.papers || []).flatMap(paper => paper.students || [])
  ];
  const redact = createStudentNameRedactor(records, currentPseudonymMaps?.studentMap);
  const changed = [];
  for (const section of sections) {
    const root = document.getElementById(section.id);
    if (!root) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const masked = redact(node.nodeValue);
      if (masked !== node.nodeValue) {
        changed.push([node, node.nodeValue]);
        node.nodeValue = masked;
      }
    }
  }
  return () => changed.forEach(([node, original]) => { node.nodeValue = original; });
}

function cloneQlaPrintContent(node) {
  const copy = node.cloneNode(true);
  copy.style.display = 'block';
  copy.removeAttribute('id');
  copy.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'));
  return copy;
}

function splitPrintHeatmap(pane) {
  const wrapper = pane.querySelector('.qla-heatmap-scroll-container');
  const table = wrapper?.querySelector('table');
  const count = table?.tHead?.rows[0]?.cells.length || 0;
  if (!wrapper || count <= 8) return;
  const chunks = heatmapPrintColumns(count);
  const replacement = document.createElement('div');
  chunks.forEach((indices, index) => {
    const part = document.createElement('div');
    part.className = 'print-heatmap-chunk';
    if (index > 0) {
      const label = document.createElement('h4');
      label.textContent = `Heatmap, classes ${index * 6 + 1}–${Math.min((index + 1) * 6, count - 2)}`;
      part.appendChild(label);
    }
    const chunkTable = table.cloneNode(false);
    for (const section of [table.tHead, table.tBodies[0]]) {
      const copySection = section.cloneNode(false);
      for (const row of section.rows) {
        const copyRow = row.cloneNode(false);
        indices.forEach(column => copyRow.appendChild(row.cells[column].cloneNode(true)));
        copySection.appendChild(copyRow);
      }
      chunkTable.appendChild(copySection);
    }
    part.appendChild(chunkTable);
    replacement.appendChild(part);
  });
  wrapper.replaceWith(replacement);
}

function preparePrintQlaSections() {
  const papers = currentQlaData?.papers || [];
  if (!papers.length) return;
  const tiers = qlaPrintTiers(papers);
  const selected = key => !!pdfExportOptions[key];
  const targets = {
    qlaTop: document.getElementById('print-qla-top'),
    qlaPapers: document.getElementById('print-qla-papers'),
    qlaQuestions: document.getElementById('print-qla-questions'),
    qlaClasses: document.getElementById('print-qla-classes'),
    qlaStudents: document.getElementById('print-qla-students'),
    qlaActions: document.getElementById('print-qla-actions')
  };
  Object.values(targets).forEach(target => target?.replaceChildren());
  const previous = {
    paper: qlaQuestionsState.selectedPaper,
    className: qlaClassesState.selectedClass,
    tier: qlaTabFilters.tier,
    hideNames: isNameHidden
  };
  const heading = (parent, label, level = 2) => {
    const element = document.createElement(`h${level}`);
    element.textContent = label;
    parent.appendChild(element);
  };
  const appendRendered = (parent, node) => {
    if (node) parent.appendChild(cloneQlaPrintContent(node));
  };
  try {
    // Render full source names into the temporary blocks so the print redactor can
    // replace every name with initials and class, including students outside the snapshot.
    isNameHidden = false;
    for (const [key, label] of [
      ['qlaTop', 'QLA: Top 5 priorities'],
      ['qlaPapers', 'QLA: Papers and skills'],
      ['qlaQuestions', 'QLA: Questions'],
      ['qlaClasses', 'QLA: Classes'],
      ['qlaStudents', 'QLA: Students'],
      ['qlaActions', 'QLA: All actions']
    ]) {
      if (selected(key)) heading(targets[key], label);
    }
    if (selected('qlaClasses')) {
      const choice = document.getElementById('pdf-qla-class-picker')?.value || 'ALL';
      for (const className of qlaPrintClasses(papers, choice)) {
        const classPage = document.createElement('div');
        classPage.className = 'print-qla-class-page';
        heading(classPage, `Class ${className}`, 3);
        for (const tier of tiers) {
          currentQlaData.papers = papers.filter(paper => paper.tier === tier);
          if (!qlaPrintClasses(currentQlaData.papers).includes(className)) continue;
          qlaClassesState.selectedClass = className;
          renderQlaClassesTab();
          heading(classPage, tier, 4);
          appendRendered(classPage, document.getElementById('pane-classes'));
        }
        targets.qlaClasses.appendChild(classPage);
      }
    }
    for (const tier of tiers) {
      currentQlaData.papers = papers.filter(paper => paper.tier === tier);
      qlaTabFilters.tier = 'ALL';
      if (selected('qlaTop') || selected('qlaActions')) {
        renderQlaActionsTab();
        const noActions = document.getElementById('qla-actions-card-top-priorities')?.style.display === 'none';
        if (selected('qlaTop')) {
          heading(targets.qlaTop, tier, 3);
          if (noActions) heading(targets.qlaTop, 'No priorities currently identified.', 4);
          else appendRendered(targets.qlaTop, document.getElementById('qla-actions-card-top-priorities'));
        }
        if (selected('qlaActions')) {
          heading(targets.qlaActions, tier, 3);
          if (noActions) heading(targets.qlaActions, 'No actions currently required.', 4);
          else appendRendered(targets.qlaActions, document.getElementById('qla-all-actions-container'));
        }
      }
      if (selected('qlaPapers')) {
        renderQlaPapersAndSkillsTab();
        heading(targets.qlaPapers, tier, 3);
        appendRendered(targets.qlaPapers, document.getElementById('pane-papers-skills'));
      }
      if (selected('qlaStudents')) {
        renderQlaStudentsTab();
        heading(targets.qlaStudents, tier, 3);
        appendRendered(targets.qlaStudents, document.getElementById('pane-students'));
      }
      if (selected('qlaQuestions')) {
        for (const paper of currentQlaData.papers) {
          qlaQuestionsState.selectedPaper = paper.sheetName;
          renderQlaQuestionsTab();
          const page = document.createElement('div');
          page.className = 'print-qla-paper-page';
          heading(page, `${paper.paper} (${tier})`, 3);
          const pane = cloneQlaPrintContent(document.getElementById('pane-questions'));
          splitPrintHeatmap(pane);
          page.appendChild(pane);
          targets.qlaQuestions.appendChild(page);
        }
      }
    }
  } finally {
    currentQlaData.papers = papers;
    qlaQuestionsState.selectedPaper = previous.paper;
    qlaClassesState.selectedClass = previous.className;
    qlaTabFilters.tier = previous.tier;
    isNameHidden = previous.hideNames;
    renderQlaPapersAndSkillsTab();
    renderQlaQuestionsTab();
    renderQlaClassesTab();
    renderQlaStudentsTab();
    renderQlaActionsTab();
  }
}

function triggerPdfExport() {
  const modal = document.getElementById('export-pdf-modal');
  if (!allRecords.length) {
    const error = document.getElementById('export-pdf-error-msg');
    if (error) {
      error.textContent = 'Upload a snapshot before exporting.';
      error.style.display = 'block';
    }
    return;
  }
  if (modal) modal.style.display = 'none';

  PDF_SECTIONS.forEach(section => {
    pdfExportOptions[section.key] = !!document.getElementById(`pdf-opt-${section.key}`)?.checked;
  });
  pdfExportOptions.suggestedFull = !!document.getElementById('pdf-opt-suggested-full')?.checked;
  pdfExportOptions.hideNames = !!document.getElementById('pdf-opt-hide-names')?.checked;

  const isLandscape = document.getElementById('pdf-orient-landscape')?.checked;
  pdfExportOptions.orientation = (isLandscape || (pdfExportOptions.movement && classListsData) || (pdfExportOptions.qlaQuestions && currentQlaData?.papers?.length)) ? 'landscape' : 'portrait';

  const { selected, restore: restoreSections } = setPdfSectionVisibility(document, pdfExportOptions, !!classListsData, !!currentQlaData?.papers?.length);

  const diagnostics = document.getElementById('diagnostics-panel');
  const main = document.getElementById('dashboard-content');
  const diagnosticsMarker = document.createComment('diagnostics print position');
  if (diagnostics && main && pdfExportOptions.diagnostics) {
    diagnostics.parentNode.insertBefore(diagnosticsMarker, diagnostics);
    main.appendChild(diagnostics);
  }

  if (pdfExportOptions.suggested) renderPrintSuggestedActions();
  const farthestNote = document.getElementById('print-farthest-note');
  if (farthestNote) {
    const total = getFarthestFromGrade5(filterDistanceRecords(getActiveRecords(), distFilters)).length;
    farthestNote.textContent = `Showing the top ${Math.min(20, total)} of ${total} students farthest from grade 5.`;
  }
  const restoreMatrix = pdfExportOptions.movement && classListsData ? preparePrintMovementMatrix() : () => {};
  if (currentQlaData?.papers?.length) preparePrintQlaSections();

  let pageStyle = document.getElementById('print-page-style');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'print-page-style';
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = `@page { size: A4 ${pdfExportOptions.orientation}; margin: 14mm 12mm 18mm 12mm; }`;

  updatePrintCoverAndContents();

  const restoreNames = (pdfExportOptions.hideNames || isNameHidden)
    ? maskPrintStudentNames([...selected, { id: 'print-cover-page' }, { id: 'print-contents-page' }])
    : () => {};
  const cleanup = () => {
    restoreNames();
    restoreMatrix();
    PDF_SECTIONS.filter(section => section.needsQla)
      .forEach(section => document.getElementById(section.id)?.replaceChildren());
    if (diagnosticsMarker.parentNode) diagnosticsMarker.replaceWith(diagnostics);
    restoreSections();
  };
  window.addEventListener('afterprint', cleanup, { once: true });

  try {
    window.print();
  } catch (error) {
    window.removeEventListener('afterprint', cleanup);
    cleanup();
    throw error;
  }
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
      const movementOption = document.getElementById('pdf-movement-option');
      if (movementOption) movementOption.style.display = classListsData ? 'flex' : 'none';
      const qlaOptions = document.getElementById('pdf-qla-options');
      if (qlaOptions) qlaOptions.style.display = currentQlaData?.papers?.length ? 'block' : 'none';
      const qlaClassPicker = document.getElementById('pdf-qla-class-picker');
      if (qlaClassPicker && currentQlaData?.papers?.length) {
        const choice = qlaClassPicker.value;
        qlaClassPicker.replaceChildren(new Option('All classes', 'ALL'));
        qlaPrintClasses(currentQlaData.papers).forEach(name => qlaClassPicker.add(new Option(name, name)));
        qlaClassPicker.value = qlaPrintClasses(currentQlaData.papers, choice).length ? choice : 'ALL';
      }
      if (classListsData && document.getElementById('pdf-opt-movement')?.checked) {
        document.getElementById('pdf-orient-landscape').checked = true;
      }
      const error = document.getElementById('export-pdf-error-msg');
      if (error) error.style.display = 'none';
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
      const cbs = exportPdfModal?.querySelectorAll('.pdf-sections-checkbox-grid input[type="checkbox"]');
      cbs?.forEach(cb => { cb.checked = true; });
    });
  }

  if (btnPdfSelectNone) {
    btnPdfSelectNone.addEventListener('click', () => {
      const cbs = exportPdfModal?.querySelectorAll('.pdf-sections-checkbox-grid input[type="checkbox"]');
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
  const settingQlaStrong = document.getElementById('setting-qla-facility-strong');
  const settingQlaWeak = document.getElementById('setting-qla-facility-weak');

  if (btnOpenSettings && settingsModal) {
    btnOpenSettings.addEventListener('click', () => {
      if (settingHideNames) settingHideNames.checked = isNameHidden;
      if (settingQlaStrong) settingQlaStrong.value = qlaQuestionsState.thresholds.strong;
      if (settingQlaWeak) settingQlaWeak.value = qlaQuestionsState.thresholds.weak;
      const settingActionClassGap = document.getElementById('setting-qla-action-class-gap');
      const settingActionZeroRate = document.getElementById('setting-qla-action-zero-rate');
      const settingActionDemoGap = document.getElementById('setting-qla-action-demo-gap');
      const settingActionAbsenceRate = document.getElementById('setting-qla-action-absence-rate');
      const settingActionTopPriorities = document.getElementById('setting-qla-action-top-priorities');
      if (settingActionClassGap) settingActionClassGap.value = qlaActionsState.thresholds.classGap;
      if (settingActionZeroRate) settingActionZeroRate.value = qlaActionsState.thresholds.zeroRate;
      if (settingActionDemoGap) settingActionDemoGap.value = qlaActionsState.thresholds.demoGap;
      if (settingActionAbsenceRate) settingActionAbsenceRate.value = qlaActionsState.thresholds.absenceRate;
      if (settingActionTopPriorities) settingActionTopPriorities.value = qlaActionsState.thresholds.topPrioritiesCount;

      const settingMovementGradeGap = document.getElementById('setting-movement-grade-gap');
      const settingMovementThreeAway = document.getElementById('setting-movement-three-away');
      const settingMovementSenGap = document.getElementById('setting-movement-sen-gap');
      const settingMovementDisadvGap = document.getElementById('setting-movement-disadv-gap');
      const settingMovementNoMockRate = document.getElementById('setting-movement-no-mock-rate');
      if (settingMovementGradeGap) settingMovementGradeGap.value = movementState.thresholds.gradeGap;
      if (settingMovementThreeAway) settingMovementThreeAway.value = movementState.thresholds.threeOrMoreConcentration;
      if (settingMovementSenGap) settingMovementSenGap.value = movementState.thresholds.senGap;
      if (settingMovementDisadvGap) settingMovementDisadvGap.value = movementState.thresholds.disadvantagedGap;
      if (settingMovementNoMockRate) settingMovementNoMockRate.value = movementState.thresholds.noMockRate;
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
      const strongVal = parseFloat(settingQlaStrong?.value);
      const weakVal = parseFloat(settingQlaWeak?.value);
      if (!isNaN(strongVal)) qlaQuestionsState.thresholds.strong = strongVal;
      if (!isNaN(weakVal)) {
        qlaQuestionsState.thresholds.weak = weakVal;
        qlaActionsState.thresholds.weakFacility = weakVal;
      }

      const classGapVal = parseFloat(document.getElementById('setting-qla-action-class-gap')?.value);
      const zeroRateVal = parseFloat(document.getElementById('setting-qla-action-zero-rate')?.value);
      const demoGapVal = parseFloat(document.getElementById('setting-qla-action-demo-gap')?.value);
      const absenceRateVal = parseFloat(document.getElementById('setting-qla-action-absence-rate')?.value);
      const topPrioritiesVal = parseInt(document.getElementById('setting-qla-action-top-priorities')?.value, 10);

      if (!isNaN(classGapVal) && classGapVal > 0) qlaActionsState.thresholds.classGap = classGapVal;
      if (!isNaN(zeroRateVal) && zeroRateVal >= 0) qlaActionsState.thresholds.zeroRate = zeroRateVal;
      if (!isNaN(demoGapVal) && demoGapVal > 0) qlaActionsState.thresholds.demoGap = demoGapVal;
      if (!isNaN(absenceRateVal) && absenceRateVal >= 0) qlaActionsState.thresholds.absenceRate = absenceRateVal;
      if (!isNaN(topPrioritiesVal) && topPrioritiesVal > 0) qlaActionsState.thresholds.topPrioritiesCount = topPrioritiesVal;

      const movGradeGapVal = parseFloat(document.getElementById('setting-movement-grade-gap')?.value);
      const movThreeAwayVal = parseFloat(document.getElementById('setting-movement-three-away')?.value);
      const movSenGapVal = parseFloat(document.getElementById('setting-movement-sen-gap')?.value);
      const movDisadvGapVal = parseFloat(document.getElementById('setting-movement-disadv-gap')?.value);
      const movNoMockRateVal = parseFloat(document.getElementById('setting-movement-no-mock-rate')?.value);

      if (!isNaN(movGradeGapVal) && movGradeGapVal > 0) movementState.thresholds.gradeGap = movGradeGapVal;
      if (!isNaN(movThreeAwayVal) && movThreeAwayVal > 0) movementState.thresholds.threeOrMoreConcentration = movThreeAwayVal;
      if (!isNaN(movSenGapVal) && movSenGapVal >= 0) movementState.thresholds.senGap = movSenGapVal;
      if (!isNaN(movDisadvGapVal) && movDisadvGapVal >= 0) movementState.thresholds.disadvantagedGap = movDisadvGapVal;
      if (!isNaN(movNoMockRateVal) && movNoMockRateVal >= 0) movementState.thresholds.noMockRate = movNoMockRateVal;

      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
          hideNames: isNameHidden,
          qlaFacilityStrong: qlaQuestionsState.thresholds.strong,
          qlaFacilityWeak: qlaQuestionsState.thresholds.weak,
          qlaActionClassGap: qlaActionsState.thresholds.classGap,
          qlaActionZeroRate: qlaActionsState.thresholds.zeroRate,
          qlaActionDemoGap: qlaActionsState.thresholds.demoGap,
          qlaActionAbsenceRate: qlaActionsState.thresholds.absenceRate,
          qlaActionTopPriorities: qlaActionsState.thresholds.topPrioritiesCount,
          movementGradeGap: movementState.thresholds.gradeGap,
          movementThreeAway: movementState.thresholds.threeOrMoreConcentration,
          movementSenGap: movementState.thresholds.senGap,
          movementDisadvGap: movementState.thresholds.disadvantagedGap,
          movementNoMockRate: movementState.thresholds.noMockRate
        }));
      } catch (e) {
        console.warn('Could not save settings to localStorage:', e);
      }
      updateHideNamesButtons();
      renderOverviewSection();
      renderDistanceSection(false);
      renderStudentGroupsSection(false);
      renderMovementAndBalanceSection();
      renderClassMismatchLists();
      renderQlaQuestionsTab();
      renderQlaClassesTab();
      renderQlaStudentsTab();
      renderQlaActionsTab();
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
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...saved, hideNames: isNameHidden }));
      } catch (e) {
        console.warn('Could not save settings to localStorage:', e);
      }
      updateHideNamesButtons();
      renderOverviewSection();
      renderDistanceSection(false);
      renderStudentGroupsSection(false);
      renderMovementAndBalanceSection();
      renderClassMismatchLists();
      renderQlaClassesTab();
      renderQlaStudentsTab();
      renderQlaActionsTab();
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

  // 11. QLA Upload & Tabs Controls
  initQlaHandlers();

  // 12. QLA Actions Controls
  const btnCopyActionsEmail = document.getElementById('btn-copy-qla-actions-email');
  if (btnCopyActionsEmail) {
    btnCopyActionsEmail.addEventListener('click', async () => {
      if (!currentQlaData || !currentQlaData.papers || currentQlaData.papers.length === 0) {
        showToast('No QLA data loaded to copy actions.');
        return;
      }
      const actionData = generateQlaActions(currentQlaData.papers, {
        thresholds: qlaActionsState.thresholds,
        isClassListsLoaded: classListsData !== null
      });
      const emailText = formatActionsAsEmailText(actionData, {
        dateStr: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        schoolName: 'Dixons Unity Academy',
        isNameHidden: isNameHidden
      });
      try {
        await copyToClipboard(emailText);
        showToast('Actions copied to clipboard as email text.');
      } catch (err) {
        console.warn('Clipboard write failed:', err);
        showToast('Failed to copy to clipboard.');
      }
    });
  }

  // Load saved settings
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.hideNames !== undefined) {
        isNameHidden = !!parsed.hideNames;
      }
      if (parsed.qlaFacilityStrong !== undefined && !isNaN(Number(parsed.qlaFacilityStrong))) {
        qlaQuestionsState.thresholds.strong = Number(parsed.qlaFacilityStrong);
      }
      if (parsed.qlaFacilityWeak !== undefined && !isNaN(Number(parsed.qlaFacilityWeak))) {
        qlaQuestionsState.thresholds.weak = Number(parsed.qlaFacilityWeak);
        qlaActionsState.thresholds.weakFacility = Number(parsed.qlaFacilityWeak);
      }
      if (parsed.qlaActionClassGap !== undefined && !isNaN(Number(parsed.qlaActionClassGap))) {
        qlaActionsState.thresholds.classGap = Number(parsed.qlaActionClassGap);
      }
      if (parsed.qlaActionZeroRate !== undefined && !isNaN(Number(parsed.qlaActionZeroRate))) {
        qlaActionsState.thresholds.zeroRate = Number(parsed.qlaActionZeroRate);
      }
      if (parsed.qlaActionDemoGap !== undefined && !isNaN(Number(parsed.qlaActionDemoGap))) {
        qlaActionsState.thresholds.demoGap = Number(parsed.qlaActionDemoGap);
      }
      if (parsed.qlaActionAbsenceRate !== undefined && !isNaN(Number(parsed.qlaActionAbsenceRate))) {
        qlaActionsState.thresholds.absenceRate = Number(parsed.qlaActionAbsenceRate);
      }
      if (parsed.qlaActionTopPriorities !== undefined && !isNaN(Number(parsed.qlaActionTopPriorities))) {
        qlaActionsState.thresholds.topPrioritiesCount = Number(parsed.qlaActionTopPriorities);
      }
      if (parsed.movementGradeGap !== undefined && !isNaN(Number(parsed.movementGradeGap))) {
        movementState.thresholds.gradeGap = Number(parsed.movementGradeGap);
      }
      if (parsed.movementThreeAway !== undefined && !isNaN(Number(parsed.movementThreeAway))) {
        movementState.thresholds.threeOrMoreConcentration = Number(parsed.movementThreeAway);
      }
      if (parsed.movementSenGap !== undefined && !isNaN(Number(parsed.movementSenGap))) {
        movementState.thresholds.senGap = Number(parsed.movementSenGap);
      }
      if (parsed.movementDisadvGap !== undefined && !isNaN(Number(parsed.movementDisadvGap))) {
        movementState.thresholds.disadvantagedGap = Number(parsed.movementDisadvGap);
      }
      if (parsed.movementNoMockRate !== undefined && !isNaN(Number(parsed.movementNoMockRate))) {
        movementState.thresholds.noMockRate = Number(parsed.movementNoMockRate);
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
  renderMovementAndBalanceSection,
  movementState,
  initNewClassesHandlers,
  clearClassLists,
  setActiveGrouping,
  getActiveRecords,
  processFile,
  initQlaHandlers,
  processQlaFile,
  clearQlaData,
  enableQlaCard,
  disableQlaCard,
  downloadQlaTemplate,
  renderQlaPapersAndSkillsTab,
  renderQlaQuestionsTab,
  renderQlaClassesTab,
  renderQlaStudentsTab,
  renderQlaActionsTab,
  qlaTabFilters,
  qlaQuestionsState,
  qlaClassesState,
  qlaStudentsState,
  qlaActionsState,
  getDisplayStudentName
};
