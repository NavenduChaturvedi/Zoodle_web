// ============================================================
//  data.js — Zoodle Mobile | Data layer
// ============================================================

const TASKS_KEY = 'zoodle_tasks_v3';
const LABELS_KEY = 'zoodle_labels_v2';

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function toISO(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayISO() { return toISO(new Date()); }

function shiftISO(iso, days) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return toISO(d);
}

// ── Label colors ──────────────────────────────────────────
const DEFAULT_LABEL_COLORS = [
    '#5b52d4', '#c93a3a', '#c97b1a', '#2c9e5e',
    '#2a88c7', '#b94fa8', '#7c5ad4', '#2dab8f',
];

function getDefaultLabels() {
    return [
        { id: uid(), name: 'Work', color: '#5b52d4' },
        { id: uid(), name: 'Personal', color: '#2c9e5e' },
        { id: uid(), name: 'Health', color: '#c93a3a' },
    ];
}

// ── Labels CRUD ───────────────────────────────────────────
function loadLabels() {
    try {
        const raw = localStorage.getItem(LABELS_KEY);
        return raw ? JSON.parse(raw) : getDefaultLabels();
    } catch { return getDefaultLabels(); }
}

function saveLabels(labels) {
    localStorage.setItem(LABELS_KEY, JSON.stringify(labels));
}

function createLabel(labels, name, color) {
    const trimmed = name.trim();
    if (!trimmed || labels.find(l => l.name.toLowerCase() === trimmed.toLowerCase())) return labels;
    return [...labels, { id: uid(), name: trimmed, color }];
}

function removeLabelById(labels, id) {
    return labels.filter(l => l.id !== id);
}

// ── Tasks CRUD ────────────────────────────────────────────
function loadTasks() {
    try {
        const raw = localStorage.getItem(TASKS_KEY);
        return raw ? JSON.parse(raw) : getSampleTasks();
    } catch { return getSampleTasks(); }
}

function saveTasks(tasks) {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

/*
  Task shape:
  {
    id, title, date,
    schedule: 'none' | 'allday' | 'time',
    startTime: number | null,  // hour 0-23
    endTime:   number | null,  // hour 0-23, exclusive (9=9AM, so 9-10 = 1 hour block)
    priority: 'none'|'low'|'medium'|'high',
    label: string,
    done: boolean,
    createdAt: number,
    subtasks: [{id,title,done}]
  }
*/

function getSampleTasks() {
    const today = todayISO();
    return [
        {
            id: uid(), title: 'Morning standup',
            date: today, schedule: 'time', startTime: 9, endTime: 10,
            priority: 'high', label: 'Work', done: false, createdAt: Date.now(),
            subtasks: [
                { id: uid(), title: 'Check Slack', done: true },
                { id: uid(), title: 'Update status', done: false },
            ],
        },
        {
            id: uid(), title: 'Gym session',
            date: today, schedule: 'time', startTime: 7, endTime: 9,
            priority: 'medium', label: 'Health', done: false, createdAt: Date.now(),
            subtasks: [
                { id: uid(), title: 'Warm up', done: true },
                { id: uid(), title: 'Weights', done: true },
                { id: uid(), title: 'Run 20 min', done: false },
            ],
        },
        {
            id: uid(), title: 'Read a chapter',
            date: today, schedule: 'none', startTime: null, endTime: null,
            priority: 'low', label: 'Personal', done: true, createdAt: Date.now(), subtasks: [],
        },
        {
            id: uid(), title: 'Project review meeting',
            date: today, schedule: 'time', startTime: 14, endTime: 16,
            priority: 'high', label: 'Work', done: false, createdAt: Date.now(),
            subtasks: [
                { id: uid(), title: 'Prepare slides', done: false },
                { id: uid(), title: 'Review metrics', done: false },
            ],
        },
        {
            id: uid(), title: 'Team offsite planning',
            date: today, schedule: 'allday', startTime: null, endTime: null,
            priority: 'medium', label: 'Work', done: false, createdAt: Date.now(), subtasks: [],
        },
    ];
}

function createTask({ title, date, schedule, startTime, endTime, priority, label, subtasks }) {
    return {
        id: uid(),
        title: title.trim(),
        date: date || todayISO(),
        schedule: schedule || 'none',
        startTime: (schedule === 'time' && startTime !== '' && startTime !== null) ? Number(startTime) : null,
        endTime: (schedule === 'time' && endTime !== '' && endTime !== null) ? Number(endTime) : null,
        priority: priority || 'none',
        label: label || '',
        done: false,
        createdAt: Date.now(),
        subtasks: (subtasks || []).map(s => ({ id: uid(), title: s.title.trim(), done: false })),
    };
}

function addTask(tasks, data) { return [createTask(data), ...tasks]; }
function deleteTask(tasks, id) { return tasks.filter(t => t.id !== id); }

function updateTask(tasks, id, patch) {
    return tasks.map(t => t.id === id ? { ...t, ...patch } : t);
}

function toggleTask(tasks, id) {
    return tasks.map(t => {
        if (t.id !== id) return t;
        const done = !t.done;
        const subtasks = done ? t.subtasks.map(s => ({ ...s, done: true })) : t.subtasks;
        return { ...t, done, subtasks };
    });
}

// ── Subtask CRUD ──────────────────────────────────────────
function addSubtask(tasks, taskId, title) {
    return tasks.map(t => {
        if (t.id !== taskId) return t;
        return { ...t, subtasks: [...t.subtasks, { id: uid(), title: title.trim(), done: false }] };
    });
}

function toggleSubtask(tasks, taskId, subId) {
    return tasks.map(t => {
        if (t.id !== taskId) return t;
        const subtasks = t.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s);
        const allDone = subtasks.length > 0 && subtasks.every(s => s.done);
        return { ...t, subtasks, done: allDone };
    });
}

function deleteSubtask(tasks, taskId, subId) {
    return tasks.map(t => t.id !== taskId ? t : {
        ...t, subtasks: t.subtasks.filter(s => s.id !== subId),
    });
}

// ── Progress ──────────────────────────────────────────────
function calcProgress(task) {
    if (!task.subtasks || task.subtasks.length === 0) return task.done ? 100 : 0;
    return Math.round(task.subtasks.filter(s => s.done).length / task.subtasks.length * 100);
}

// ── Filters ───────────────────────────────────────────────
function getTasksForDay(tasks, iso) {
    return tasks.filter(t => t.date === iso);
}

// ── Hour label ────────────────────────────────────────────
function hourLabel(h) {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
}
