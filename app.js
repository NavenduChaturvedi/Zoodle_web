// ============================================================
//  app.js — Zoodle Mobile | Render Engine + Events
// ============================================================

// ── State ─────────────────────────────────────────────────
let tasks = loadTasks();
let labels = loadLabels();
let currentDay = todayISO();
let formSubtasks = [];
let selectedPriority = 'none';
let selectedLabelName = '';
let currentSchedule = 'none';  // 'none' | 'allday' | 'time'
let pendingDeleteId = null;
let newLabelColor = DEFAULT_LABEL_COLORS[0];
let touchStartX = 0, touchStartY = 0;

// Hours displayed in timeline: 6 AM through 11 PM
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6..23

// ── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    populateTimeSelects();
    setupSwipe();
    render();

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeAllSheets();
    });

    document.getElementById('task-title-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTask(); }
    });
});

// ── Populate time selects ─────────────────────────────────
function populateTimeSelects() {
    const starts = document.getElementById('task-start-time');
    const ends = document.getElementById('task-end-time');
    HOURS.forEach(h => {
        starts.appendChild(makeOpt(h, hourLabel(h)));
        ends.appendChild(makeOpt(h, hourLabel(h)));
    });
    // Default: start=9 end=10
    starts.value = 9;
    ends.value = 10;
}

function makeOpt(value, text) {
    const o = document.createElement('option');
    o.value = value; o.textContent = text;
    return o;
}

// When start changes, ensure end is >= start+1
function syncEndTime() {
    const start = Number(document.getElementById('task-start-time').value);
    const endEl = document.getElementById('task-end-time');
    if (Number(endEl.value) <= start) {
        endEl.value = Math.min(start + 1, 23);
    }
}

// ── Main render ───────────────────────────────────────────
function render() {
    renderDayHeader();
    renderTimeline();
    lucide.createIcons();
}

// ── Day header ────────────────────────────────────────────
function renderDayHeader() {
    const today = todayISO();
    const d = new Date(currentDay + 'T00:00:00');
    const diff = Math.round((new Date(currentDay + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);

    let label;
    if (diff === 0) label = 'Today';
    else if (diff === 1) label = 'Tomorrow';
    else if (diff === -1) label = 'Yesterday';
    else label = d.toLocaleDateString('en-US', { weekday: 'long' });

    document.getElementById('day-label').textContent = label;
    document.getElementById('day-date').textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Day navigation ────────────────────────────────────────
function shiftDay(direction) {
    const slideEl = document.getElementById('day-slide');
    const outClass = direction > 0 ? 'slide-out-left' : 'slide-out-right';
    const inClass = direction > 0 ? 'slide-in-left' : 'slide-in-right';

    slideEl.classList.add(outClass);
    setTimeout(() => {
        slideEl.classList.remove(outClass);
        currentDay = shiftISO(currentDay, direction);
        render();
        slideEl.classList.add(inClass);
        setTimeout(() => slideEl.classList.remove(inClass), 220);
    }, 185);
}

// ── Swipe navigation ──────────────────────────────────────
function setupSwipe() {
    const wrapper = document.getElementById('day-view-wrapper');
    wrapper.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });
    wrapper.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
        if (Math.abs(dx) > 50 && dy < 80) shiftDay(dx < 0 ? 1 : -1);
    }, { passive: true });
}

// ── Timeline render ───────────────────────────────────────
function renderTimeline() {
    const dayTasks = getTasksForDay(tasks, currentDay);
    const allDayTasks = dayTasks.filter(t => t.schedule === 'allday');
    const unscheduled = dayTasks.filter(t => t.schedule === 'none');
    const scheduled = dayTasks.filter(t => t.schedule === 'time' && t.startTime !== null);

    // ── All Day section ──
    const alldayList = document.getElementById('allday-list');
    const alldayEmpty = document.getElementById('allday-empty');
    const alldayCount = document.getElementById('allday-count');
    alldayCount.textContent = allDayTasks.length;
    if (allDayTasks.length === 0) {
        alldayList.innerHTML = '';
        alldayEmpty.style.display = '';
    } else {
        alldayEmpty.style.display = 'none';
        alldayList.innerHTML = allDayTasks.map(t => buildTaskCard(t)).join('');
    }

    // ── Unscheduled section ──
    const uList = document.getElementById('unscheduled-list');
    const uEmpty = document.getElementById('unscheduled-empty');
    const uCount = document.getElementById('unscheduled-count');
    uCount.textContent = unscheduled.length;
    if (unscheduled.length === 0) {
        uList.innerHTML = '';
        uEmpty.style.display = '';
    } else {
        uEmpty.style.display = 'none';
        uList.innerHTML = unscheduled.map(t => buildTaskCard(t)).join('');
    }

    // ── Hourly timeline ──
    // Build a map: hour → tasks that START at that hour
    const byStartHour = {};
    HOURS.forEach(h => { byStartHour[h] = []; });
    scheduled.forEach(t => {
        if (byStartHour[t.startTime] !== undefined) {
            byStartHour[t.startTime].push(t);
        } else {
            // Task starts before timeline: show it at first visible hour
            const clamp = Math.max(HOURS[0], t.startTime);
            if (byStartHour[clamp]) byStartHour[clamp].push(t);
        }
    });

    const isToday = currentDay === todayISO();
    const nowHour = new Date().getHours();

    document.getElementById('timeline').innerHTML = HOURS.map(h => {
        const isCurrent = isToday && h === nowHour;
        const tasksHtml = byStartHour[h].map(t => buildTaskCard(t, true)).join('');

        return `
      <div class="hour-row ${isCurrent ? 'current-hour' : ''}" id="hour-${h}">
        <span class="hour-label">${hourLabel(h)}</span>
        <div class="hour-tasks">
          ${tasksHtml}
          <div class="hour-tap-zone" onclick="openAddTaskAtHour(${h})"></div>
        </div>
      </div>`;
    }).join('');

    // Auto-scroll to current hour
    if (isToday) {
        setTimeout(() => {
            const el = document.getElementById('hour-' + nowHour);
            const wrapper = document.getElementById('day-view-wrapper');
            if (el && wrapper) wrapper.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' });
        }, 100);
    }
}

// ── Task card ─────────────────────────────────────────────
function buildTaskCard(task, inTimeline = false) {
    const progress = calcProgress(task);
    const hasSubs = task.subtasks && task.subtasks.length > 0;
    const lbl = labels.find(l => l.name === task.label);
    const labelColor = lbl ? lbl.color : '#999';

    const priHtml = task.priority && task.priority !== 'none'
        ? `<span class="priority-pill ${task.priority}">${task.priority}</span>` : '';

    const lblHtml = task.label
        ? `<span class="label-pill" style="background:${labelColor}22;color:${labelColor}">${escHtml(task.label)}</span>` : '';

    // Time range pill
    let timeHtml = '';
    if (task.schedule === 'time' && task.startTime !== null) {
        const endPart = task.endTime !== null ? ` – ${hourLabel(task.endTime)}` : '';
        timeHtml = `<span class="time-range-pill"><i data-lucide="clock"></i>${hourLabel(task.startTime)}${endPart}</span>`;
    } else if (task.schedule === 'allday') {
        timeHtml = `<span class="time-range-pill"><i data-lucide="sun"></i>All Day</span>`;
    }

    // Min height for time-range tasks (span visually)
    let spanStyle = '';
    if (inTimeline && task.schedule === 'time' && task.startTime !== null && task.endTime !== null) {
        const span = Math.max(1, task.endTime - task.startTime);
        // Each hour-row = 72px, minus gaps/padding
        spanStyle = `style="min-height:${span * 68 - 4}px"`;
    }

    // Priority border class
    const priClass = task.priority && task.priority !== 'none' ? `pri-${task.priority}` : '';

    const subItems = hasSubs ? task.subtasks.map(s => `
    <li class="sub-item ${s.done ? 'sub-done' : ''}">
      <div class="sub-cb ${s.done ? 'checked' : ''}"
           onclick="onToggleSub('${task.id}','${s.id}');event.stopPropagation()">
        <i data-lucide="check"></i>
      </div>
      <span class="sub-title">${escHtml(s.title)}</span>
      <button class="sub-del" onclick="onDeleteSub('${task.id}','${s.id}');event.stopPropagation()">
        <i data-lucide="x"></i>
      </button>
    </li>`).join('') : '';

    const progressHtml = hasSubs ? `
    <div class="card-progress">
      <div class="progress-info">
        <span>${task.subtasks.filter(s => s.done).length}/${task.subtasks.length} done</span>
        <span>${progress}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill ${progress === 100 ? 'full' : ''}" style="width:${progress}%"></div>
      </div>
    </div>` : '';

    const subSection = hasSubs ? `
    <button class="subtask-toggle" id="stoggle-${task.id}"
            onclick="toggleSubDrawer('${task.id}');event.stopPropagation()">
      <i data-lucide="chevron-right" class="chev"></i>
      ${task.subtasks.length} subtask${task.subtasks.length !== 1 ? 's' : ''}
    </button>
    <div class="subtask-drawer" id="sdrawer-${task.id}">
      <ul class="subtask-list-inner">${subItems}</ul>
      <div class="sub-adder">
        <input type="text" id="sinput-${task.id}" placeholder="Add subtask…"
               onkeydown="if(event.key==='Enter'){onAddInlineSub('${task.id}');event.preventDefault();}" />
        <button class="sub-adder-btn" onclick="onAddInlineSub('${task.id}')">Add</button>
      </div>
    </div>` : `
    <div class="sub-adder">
      <input type="text" id="sinput-${task.id}" placeholder="Add subtask…"
             onkeydown="if(event.key==='Enter'){onAddInlineSub('${task.id}');event.preventDefault();}" />
      <button class="sub-adder-btn" onclick="onAddInlineSub('${task.id}')">Add</button>
    </div>`;

    return `
    <div class="task-card ${task.done ? 'done' : ''} ${priClass}" id="card-${task.id}" ${spanStyle}>
      <div class="task-card-main">
        <div class="task-cb ${task.done ? 'checked' : ''}"
             onclick="onToggleTask('${task.id}');event.stopPropagation()">
          <i data-lucide="check"></i>
        </div>
        <div class="task-info">
          <div class="task-title">${escHtml(task.title)}</div>
          <div class="task-chips">${timeHtml}${priHtml}${lblHtml}</div>
        </div>
        <div class="card-actions">
          <button class="card-btn" onclick="openEditTask('${task.id}');event.stopPropagation()" title="Edit">
            <i data-lucide="pencil"></i>
          </button>
          <button class="card-btn del" onclick="confirmDelete('${task.id}');event.stopPropagation()" title="Delete">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
      ${progressHtml}
      ${subSection}
    </div>`;
}

// ── Subtask drawer ────────────────────────────────────────
function toggleSubDrawer(taskId) {
    const drawer = document.getElementById('sdrawer-' + taskId);
    const toggle = document.getElementById('stoggle-' + taskId);
    if (!drawer) return;
    drawer.classList.toggle('open');
    toggle?.classList.toggle('open');
    lucide.createIcons();
}

// ── Task handlers ─────────────────────────────────────────
function onToggleTask(id) { tasks = toggleTask(tasks, id); saveTasks(tasks); render(); }
function onToggleSub(tid, sid) { tasks = toggleSubtask(tasks, tid, sid); saveTasks(tasks); render(); }
function onDeleteSub(tid, sid) { tasks = deleteSubtask(tasks, tid, sid); saveTasks(tasks); render(); }
function onAddInlineSub(taskId) {
    const input = document.getElementById('sinput-' + taskId);
    if (!input || !input.value.trim()) return;
    tasks = addSubtask(tasks, taskId, input.value.trim());
    saveTasks(tasks); render();
}

// ── ADD TASK SHEET ────────────────────────────────────────
function openAddTask(prefillHour) {
    formSubtasks = []; selectedPriority = 'none'; selectedLabelName = '';
    document.getElementById('add-task-sheet-title').textContent = 'New Task';
    document.getElementById('sheet-submit-btn').textContent = 'Add Task';
    document.getElementById('task-title-input').value = '';
    document.getElementById('editing-task-id').value = '';
    document.getElementById('form-subtask-list').innerHTML = '';

    setSchedule(prefillHour !== undefined ? 'time' : 'none');
    if (prefillHour !== undefined) {
        document.getElementById('task-start-time').value = prefillHour;
        document.getElementById('task-end-time').value = Math.min(prefillHour + 1, 23);
    }

    setPriorityUI('none');
    renderLabelChips();
    openSheet('add-task-overlay');
    setTimeout(() => document.getElementById('task-title-input').focus(), 120);
}

function openAddTaskAtHour(hour) { openAddTask(hour); }

function openEditTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    formSubtasks = task.subtasks.map(s => ({ ...s }));
    selectedPriority = task.priority || 'none';
    selectedLabelName = task.label || '';

    document.getElementById('add-task-sheet-title').textContent = 'Edit Task';
    document.getElementById('sheet-submit-btn').textContent = 'Save Changes';
    document.getElementById('task-title-input').value = task.title;
    document.getElementById('editing-task-id').value = id;

    setSchedule(task.schedule || 'none');
    if (task.schedule === 'time') {
        document.getElementById('task-start-time').value = task.startTime ?? 9;
        document.getElementById('task-end-time').value = task.endTime ?? 10;
    }

    setPriorityUI(selectedPriority);
    renderLabelChips();
    renderFormSubtasks();
    openSheet('add-task-overlay');
    setTimeout(() => document.getElementById('task-title-input').focus(), 120);
}

function closeAddTask() { closeSheet('add-task-overlay'); formSubtasks = []; }
function closeAddTaskOutside(e) { if (e.target.id === 'add-task-overlay') closeAddTask(); }

function submitTask() {
    const title = document.getElementById('task-title-input').value.trim();
    const editId = document.getElementById('editing-task-id').value;
    if (!title) { document.getElementById('task-title-input').focus(); return; }

    let startTime = null, endTime = null;
    if (currentSchedule === 'time') {
        startTime = Number(document.getElementById('task-start-time').value);
        endTime = Number(document.getElementById('task-end-time').value);
        if (endTime <= startTime) endTime = startTime + 1;
    }

    const patch = {
        title,
        schedule: currentSchedule,
        startTime, endTime,
        priority: selectedPriority,
        label: selectedLabelName,
        subtasks: formSubtasks,
    };

    if (editId) {
        tasks = updateTask(tasks, editId, patch);
    } else {
        tasks = addTask(tasks, { ...patch, date: currentDay });
    }

    saveTasks(tasks);
    closeAddTask();
    render();
}

// ── Schedule tabs ─────────────────────────────────────────
function setSchedule(type) {
    currentSchedule = type;
    ['none', 'allday', 'time'].forEach(t => {
        document.getElementById('sched-' + t)?.classList.toggle('active', t === type);
    });
    document.getElementById('time-range-row').style.display = type === 'time' ? '' : 'none';
}

// ── Priority ──────────────────────────────────────────────
function selectPriority(val) { selectedPriority = val; setPriorityUI(val); }

function setPriorityUI(val) {
    document.querySelectorAll('.pri-btn').forEach(btn => {
        btn.classList.remove('active-none', 'active-low', 'active-medium', 'active-high');
        if (btn.dataset.value === val) btn.classList.add('active-' + val);
    });
}

// ── Label chips ───────────────────────────────────────────
function renderLabelChips() {
    document.getElementById('label-chips').innerHTML = labels.map(l => `
    <span class="lchip ${selectedLabelName === l.name ? 'active' : ''}"
          style="color:${l.color}"
          onclick="selectLabel('${escHtml(l.name)}')">${escHtml(l.name)}</span>
  `).join('');
}

function selectLabel(name) {
    selectedLabelName = selectedLabelName === name ? '' : name;
    renderLabelChips();
}

// ── Form subtasks ─────────────────────────────────────────
function addFormSubtask() {
    const input = document.getElementById('subtask-new-input');
    if (!input.value.trim()) return;
    formSubtasks.push({ id: uid(), title: input.value.trim(), done: false });
    input.value = '';
    renderFormSubtasks();
    input.focus();
    lucide.createIcons();
}

function handleSubtaskKey(e) { if (e.key === 'Enter') { e.preventDefault(); addFormSubtask(); } }

function removeFormSubtask(idx) {
    formSubtasks.splice(idx, 1);
    renderFormSubtasks();
    lucide.createIcons();
}

function renderFormSubtasks() {
    document.getElementById('form-subtask-list').innerHTML = formSubtasks.map((s, i) => `
    <li class="form-sub-item">
      <span>${escHtml(s.title)}</span>
      <button type="button" onclick="removeFormSubtask(${i})"><i data-lucide="x"></i></button>
    </li>`).join('');
}

// ── LABELS SHEET ──────────────────────────────────────────
function openLabelsSheet() {
    renderLabelsSheet();
    renderLabelColorPicker();
    openSheet('labels-overlay');
}

function closeLabelsSheet() { closeSheet('labels-overlay'); }
function closeLabelsOutside(e) { if (e.target.id === 'labels-overlay') closeLabelsSheet(); }

function renderLabelsSheet() {
    const container = document.getElementById('labels-list-section');
    if (!labels.length) {
        container.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:10px 0">No labels yet.</p>';
        return;
    }
    container.innerHTML = labels.map(l => `
    <div class="label-manage-item">
      <span class="lm-dot" style="background:${l.color}"></span>
      <span class="lm-name">${escHtml(l.name)}</span>
      <button class="lm-del" onclick="removeLabel('${l.id}')"><i data-lucide="trash-2"></i></button>
    </div>`).join('');
    lucide.createIcons();
}

function renderLabelColorPicker() {
    document.getElementById('label-color-picker').innerHTML = DEFAULT_LABEL_COLORS.map(c => `
    <span class="color-swatch ${c === newLabelColor ? 'active' : ''}"
          style="background:${c}"
          onclick="pickLabelColor('${c}')"></span>
  `).join('');
}

function pickLabelColor(c) { newLabelColor = c; renderLabelColorPicker(); }

function addLabel() {
    const input = document.getElementById('new-label-input');
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    labels = createLabel(labels, name, newLabelColor);
    saveLabels(labels);
    input.value = '';
    renderLabelsSheet();
    renderLabelChips();
}

function removeLabel(id) {
    labels = removeLabelById(labels, id);
    saveLabels(labels);
    renderLabelsSheet();
    renderLabelChips();
}

// ── DELETE ────────────────────────────────────────────────
function confirmDelete(id) {
    pendingDeleteId = id;
    const task = tasks.find(t => t.id === id);
    document.getElementById('confirm-sub').textContent =
        task ? `"${task.title}" will be permanently removed.` : 'This cannot be undone.';
    document.getElementById('confirm-delete-btn').onclick = executeDelete;
    openSheet('confirm-overlay');
}

function executeDelete() {
    if (!pendingDeleteId) return;
    const card = document.getElementById('card-' + pendingDeleteId);
    const doDelete = () => { tasks = deleteTask(tasks, pendingDeleteId); saveTasks(tasks); pendingDeleteId = null; render(); };
    if (card) { card.classList.add('removing'); setTimeout(doDelete, 200); }
    else doDelete();
    closeConfirm();
}

function closeConfirm() { closeSheet('confirm-overlay'); pendingDeleteId = null; }
function closeConfirmOutside(e) { if (e.target.id === 'confirm-overlay') closeConfirm(); }

// ── Sheet helpers ─────────────────────────────────────────
function openSheet(id) { const el = document.getElementById(id); if (el) { el.style.display = 'flex'; el.classList.add('open'); } }
function closeSheet(id) { const el = document.getElementById(id); if (el) { el.style.display = 'none'; el.classList.remove('open'); } }
function closeAllSheets() {
    ['add-task-overlay', 'labels-overlay', 'confirm-overlay'].forEach(closeSheet);
}

// ── Utility ───────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
