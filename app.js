(() => {
  'use strict';

  const STORAGE_KEY = 'd402-duty-config-v1';
  const DAY = 24 * 60 * 60 * 1000;
  const WEEK = 7 * DAY;
  const WEEK_LABELS = ['第一周', '第二周', '第三周', '第四周', '第五周'];
  const PLACEHOLDER = '\\';

  const DEFAULT_CONFIG = {
    title: '表1 机械与动力工程学院实验室卫生值日表(请贴于门后)',
    people: [
      '值班人员1',
      '值班人员2',
      '值班人员3',
      '值班人员4',
      '值班人员5',
      '值班人员6',
      '值班人员7',
      '值班人员8',
      '值班人员9',
    ],
    start: '2026-11-01',
    end: '2027-06-30',
    anchorDate: '2026-10-26',
    anchorPerson: '值班人员1',
  };

  const $ = (selector) => document.querySelector(selector);

  const form = {
    title: $('#title'),
    people: $('#people'),
    start: $('#start'),
    end: $('#end'),
    anchorDate: $('#anchorDate'),
    anchorPerson: $('#anchorPerson'),
    hint: $('#rotationHint'),
    shiftList: $('#shiftList'),
    shiftCount: $('#shiftCount'),
    preview: $('#preview'),
    status: $('#status'),
  };

  let renderTimer = null;

  /* ---------- DOM helpers ---------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- date helpers (UTC, immune to DST) ---------- */

  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return date;
  }

  function isoDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addDays(date, amount) {
    return new Date(date.getTime() + amount * DAY);
  }

  function weekStart(date) {
    const offset = (date.getUTCDay() + 6) % 7; // Monday = 0
    return addDays(date, -offset);
  }

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function formatCn(date) {
    return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
  }

  function formatRange(start, end) {
    if (start.getTime() === end.getTime()) {
      return `${start.getUTCMonth() + 1}月${start.getUTCDate()}日`;
    }

    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const left = sameYear
      ? `${start.getUTCMonth() + 1}月${start.getUTCDate()}日`
      : `${start.getUTCFullYear()}年${start.getUTCMonth() + 1}月${start.getUTCDate()}日`;
    const right = sameYear
      ? `${end.getUTCMonth() + 1}月${end.getUTCDate()}日`
      : `${end.getUTCFullYear()}年${end.getUTCMonth() + 1}月${end.getUTCDate()}日`;
    return `${left} – ${right}`;
  }

  /* ---------- config ---------- */

  function parsePeople(text) {
    return text
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function normalizeConfig(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const people = Array.isArray(source.people)
      ? source.people.map((name) => String(name).trim()).filter(Boolean)
      : DEFAULT_CONFIG.people.slice();

    const config = {
      title: String(source.title || DEFAULT_CONFIG.title).trim() || DEFAULT_CONFIG.title,
      people,
      start: String(source.start || ''),
      end: String(source.end || ''),
      anchorDate: String(source.anchorDate || ''),
      anchorPerson: String(source.anchorPerson || ''),
    };

    const anchor = parseDate(config.anchorDate);
    const start = parseDate(config.start);
    if (anchor) {
      config.anchorDate = isoDate(weekStart(anchor));
    } else if (start) {
      config.anchorDate = isoDate(weekStart(start));
    } else {
      config.anchorDate = DEFAULT_CONFIG.anchorDate;
    }

    if (!people.includes(config.anchorPerson)) {
      config.anchorPerson = people[0] || '';
    }

    return config;
  }

  function readForm() {
    return normalizeConfig({
      title: form.title.value,
      people: parsePeople(form.people.value),
      start: form.start.value,
      end: form.end.value,
      anchorDate: form.anchorDate.value,
      anchorPerson: form.anchorPerson.value,
    });
  }

  function saveConfig(config) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      /* storage can be unavailable in private mode — ignore */
    }
  }

  function loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return normalizeConfig(DEFAULT_CONFIG);
      return normalizeConfig(JSON.parse(saved));
    } catch (error) {
      return normalizeConfig(DEFAULT_CONFIG);
    }
  }

  /* ---------- rotation ---------- */

  function personForWeek(ws, config) {
    const anchor = weekStart(parseDate(config.anchorDate));
    const base = config.people.indexOf(config.anchorPerson);
    const count = config.people.length;
    const offset = Math.round((ws.getTime() - anchor.getTime()) / WEEK);
    return config.people[(((base + offset) % count) + count) % count];
  }

  function buildMonth(year, month, start, end, config) {
    const total = daysInMonth(year, month);
    const days = [];

    for (let day = 1; day <= 31; day += 1) {
      if (day > total) {
        days.push(PLACEHOLDER);
        continue;
      }
      const date = new Date(Date.UTC(year, month - 1, day));
      const inRange = date >= start && date <= end;
      days.push(inRange ? personForWeek(weekStart(date), config) : PLACEHOLDER);
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month - 1, total));
    const rangeStart = monthStart > start ? monthStart : start;
    const rangeEnd = monthEnd < end ? monthEnd : end;

    const weeks = [];
    if (rangeStart <= rangeEnd) {
      let ws = weekStart(rangeStart);
      while (ws <= rangeEnd && weeks.length < 5) {
        weeks.push({ start: ws, end: addDays(ws, 6), person: personForWeek(ws, config) });
        ws = addDays(ws, 7);
      }
    }

    return { year, month, days, weeks };
  }

  function buildPages(config) {
    const start = parseDate(config.start);
    const end = parseDate(config.end);
    const pages = [];

    let year = start.getUTCFullYear();
    let month = start.getUTCMonth() + 1;
    const endYear = end.getUTCFullYear();
    const endMonth = end.getUTCMonth() + 1;

    while (year < endYear || (year === endYear && month <= endMonth)) {
      pages.push(buildMonth(year, month, start, end, config));
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    return pages;
  }

  function buildShifts(config) {
    const start = parseDate(config.start);
    const end = parseDate(config.end);
    const shifts = [];
    let ws = weekStart(start);

    while (ws <= end) {
      const from = new Date(Math.max(ws.getTime(), start.getTime()));
      const to = new Date(Math.min(addDays(ws, 6).getTime(), end.getTime()));
      if (from <= to) {
        shifts.push({ start: from, end: to, person: personForWeek(ws, config) });
      }
      ws = addDays(ws, 7);
    }

    return shifts;
  }

  /* ---------- rendering: A4 sheet ---------- */

  function buildHeaderRows(year, month) {
    const row0 = el('tr', 'hdr');
    const diagonal = el('td', 'diag');
    diagonal.rowSpan = 2;
    diagonal.append(el('span', 'diag-top', '内容'), el('span', 'diag-bottom', '时间'));
    row0.append(diagonal);

    const period = el('td', 'ym');
    period.colSpan = 2;
    period.append(
      el('span', 'ym-year', `年：${year}`),
      el('span', 'ym-month', `月：${month}`)
    );
    row0.append(period);

    const row1 = el('tr', 'hdr');
    row1.append(el('td', '', '姓名'), el('td', '', '签名'));

    return [row0, row1];
  }

  function buildDailyTable(page) {
    const table = el('table', 'sheet daily');
    const colgroup = el('colgroup');
    ['c-date', 'c-name', 'c-sign'].forEach((name) => colgroup.append(el('col', name)));
    table.append(colgroup);

    buildHeaderRows(page.year, page.month).forEach((row) => table.append(row));

    page.days.forEach((person, index) => {
      const row = el('tr', 'day-row');
      row.append(el('td', '', `${index + 1}日`), el('td', '', person), el('td', ''));
      table.append(row);
    });

    return table;
  }

  function buildWeeklyTable(page) {
    const table = el('table', 'sheet weekly');
    const colgroup = el('colgroup');
    ['c-week', 'c-name', 'c-sign'].forEach((name) => colgroup.append(el('col', name)));
    table.append(colgroup);

    buildHeaderRows(page.year, page.month).forEach((row) => table.append(row));

    for (let index = 0; index < 5; index += 1) {
      const week = page.weeks[index];
      const row = el('tr', 'week-row');
      row.append(
        el('td', '', WEEK_LABELS[index]),
        el('td', '', week ? week.person : PLACEHOLDER),
        el('td', '')
      );
      table.append(row);
    }

    return table;
  }

  function renderPage(page, config) {
    const section = el('section', 'page');
    section.append(el('h1', '', config.title));

    const tables = el('div', 'tables');
    tables.append(buildDailyTable(page), buildWeeklyTable(page));
    section.append(tables);

    return section;
  }

  /* ---------- rendering: side panel ---------- */

  function renderShiftList(shifts) {
    form.shiftCount.textContent = `共 ${shifts.length} 班`;

    if (!shifts.length) {
      form.shiftList.replaceChildren(el('li', 'empty', '暂无排班'));
      return;
    }

    const fragment = document.createDocumentFragment();
    shifts.forEach((shift) => {
      const item = el('li');
      item.append(
        el('span', 'dates', formatRange(shift.start, shift.end)),
        el('span', 'person', shift.person)
      );
      fragment.append(item);
    });
    form.shiftList.replaceChildren(fragment);
  }

  function renderRotationHint(config) {
    const anchor = parseDate(config.anchorDate);
    if (!anchor || !config.anchorPerson) {
      form.hint.textContent = '填写人员和日期后即可自动排班。';
      return;
    }

    const hint = document.createDocumentFragment();
    hint.append(document.createTextNode('每周一换人：'));
    hint.append(el('strong', '', config.anchorPerson));
    hint.append(document.createTextNode(` 值 ${formatCn(anchor)} – ${formatCn(addDays(anchor, 6))}，之后按上方顺序循环。`));
    form.hint.replaceChildren(hint);
  }

  function setStatus(message, isError) {
    form.status.textContent = message;
    form.status.classList.toggle('ok', Boolean(message) && !isError);
  }

  /* ---------- validation ---------- */

  function validate(config) {
    const errors = [];

    if (!config.people.length) errors.push('请至少填写一位值班人员。');
    if (!config.title.trim()) errors.push('请填写表格标题。');

    const start = parseDate(config.start);
    const end = parseDate(config.end);

    if (!start) errors.push('请填写有效的开始日期。');
    if (!end) errors.push('请填写有效的结束日期。');

    if (start && end) {
      if (end < start) {
        errors.push('结束日期不能早于开始日期。');
      } else {
        const months =
          (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
          (end.getUTCMonth() - start.getUTCMonth()) +
          1;
        if (months > 36) errors.push('时间范围过长（最多 36 个月）。');
      }
    }

    if (!parseDate(config.anchorDate)) errors.push('排班起点日期无效。');
    if (config.people.length && !config.people.includes(config.anchorPerson)) {
      errors.push('请选择排班起点所在周的值日人。');
    }

    return errors;
  }

  /* ---------- main render ---------- */

  function render() {
    const config = readForm();
    renderRotationHint(config);

    const errors = validate(config);
    if (errors.length) {
      setStatus(errors.join(' '), true);
      form.preview.replaceChildren(el('div', 'preview-empty', '请根据左侧提示修正配置。'));
      form.shiftList.replaceChildren(el('li', 'empty', '暂无排班'));
      form.shiftCount.textContent = '';
      return;
    }

    setStatus('');
    const pages = buildPages(config);
    form.preview.replaceChildren(...pages.map((page) => renderPage(page, config)));
    renderShiftList(buildShifts(config));
    saveConfig(config);
  }

  function scheduleRender() {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(render, 120);
  }

  /* ---------- form wiring ---------- */

  function syncAnchorOptions(people, selected) {
    const options = people.map((name) => {
      const option = el('option', '', name);
      option.value = name;
      return option;
    });
    form.anchorPerson.replaceChildren(...options);

    if (people.includes(selected)) {
      form.anchorPerson.value = selected;
    } else if (people.length) {
      form.anchorPerson.value = people[0];
    }
  }

  function autoSizePeople() {
    form.people.style.height = 'auto';
    const height = Math.min(Math.max(form.people.scrollHeight, 112), 280);
    form.people.style.height = `${height}px`;
  }

  function applyConfig(config) {
    form.title.value = config.title;
    form.people.value = config.people.join('\n');
    form.start.value = config.start;
    form.end.value = config.end;
    form.anchorDate.value = config.anchorDate;
    syncAnchorOptions(config.people, config.anchorPerson);
    autoSizePeople();
  }

  function bindEvents() {
    form.title.addEventListener('input', scheduleRender);

    form.people.addEventListener('input', () => {
      autoSizePeople();
      syncAnchorOptions(parsePeople(form.people.value), form.anchorPerson.value);
      scheduleRender();
    });

    form.start.addEventListener('change', () => {
      if (!parseDate(form.anchorDate.value)) {
        const start = parseDate(form.start.value);
        if (start) form.anchorDate.value = isoDate(weekStart(start));
      }
      render();
    });

    form.end.addEventListener('change', render);
    form.anchorPerson.addEventListener('change', render);

    form.anchorDate.addEventListener('change', () => {
      const anchor = parseDate(form.anchorDate.value);
      form.anchorDate.value = anchor ? isoDate(weekStart(anchor)) : '';
      render();
    });

    $('#printBtn').addEventListener('click', () => window.print());
    $('#exportBtn').addEventListener('click', exportConfig);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', importConfig);
    $('#resetBtn').addEventListener('click', () => {
      applyConfig(normalizeConfig(DEFAULT_CONFIG));
      render();
      setStatus('已恢复默认配置。', false);
    });
  }

  /* ---------- config import / export ---------- */

  function exportConfig() {
    const config = readForm();
    const errors = validate(config);
    if (errors.length) {
      setStatus(errors.join(' '), true);
      return;
    }

    const blob = new Blob([JSON.stringify(config, null, 2) + '\n'], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `值日表配置_${config.start}_${config.end}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus('配置已导出。', false);
  }

  async function importConfig(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.people)) {
        throw new Error('文件缺少 people 列表。');
      }
      const config = normalizeConfig(parsed);
      applyConfig(config);
      render();
      setStatus('配置已导入。', false);
    } catch (error) {
      setStatus(`导入失败：${error.message}`, true);
    }
  }

  /* ---------- boot ---------- */

  applyConfig(loadConfig());
  bindEvents();
  render();
})();