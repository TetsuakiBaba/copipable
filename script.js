// state
let notes = [];
const storageKey = 'copipableNotes';

const workspace = document.getElementById('workspace');
const saveButton = document.getElementById('save-button');
const clearAllButton = document.getElementById('clear-all-button');
const noteInput = document.getElementById('note-input');
const gridToggle = document.getElementById('grid-toggle');
// load grid snap state from localStorage
const savedGridSnap = localStorage.getItem('gridSnapEnabled');
let isGridSnap = savedGridSnap === 'true';
// ボタン表示更新関数
function updateGridToggleButton() {
    gridToggle.innerHTML = `<i class="bi bi-grid-3x3-gap"></i> Grid: ${isGridSnap ? 'ON' : 'OFF'}`;
}
// initialize button state
updateGridToggleButton();

gridToggle.addEventListener('click', () => {
    isGridSnap = !isGridSnap;
    // save to localStorage
    localStorage.setItem('gridSnapEnabled', isGridSnap);
    updateGridToggleButton();
});
function snap(val) {
    return isGridSnap ? Math.round(val / 25) * 25 : val;
}

// カラーオプション
const COLORS = [
    { name: 'yellow', hex: '#fffb85' },
    { name: 'blue', hex: '#d0e7ff' },
    { name: 'green', hex: '#d1ffd1' },
    { name: 'red', hex: '#ffd1d1' },
    { name: 'gray', hex: '#e0e0e0' },
    { name: 'pink', hex: '#ffd1e5' }
];
// デフォルトカラー読み込み
let defaultNoteColor = localStorage.getItem('defaultNoteColor') || 'yellow';
// 入力エリア用カラーパネル
const inputColorPanel = document.getElementById('input-color-panel');
function renderInputColorPanel() {
    inputColorPanel.innerHTML = '';
    COLORS.forEach(c => {
        const sw = document.createElement('div');
        sw.className = 'color-swatch';
        sw.style.backgroundColor = c.hex;
        sw.dataset.color = c.name;
        if (c.name === defaultNoteColor) sw.classList.add('selected');
        sw.addEventListener('click', () => {
            defaultNoteColor = c.name;
            localStorage.setItem('defaultNoteColor', defaultNoteColor);
            renderInputColorPanel();
        });
        inputColorPanel.appendChild(sw);
    });
}
renderInputColorPanel();

// IndexedDB 初期化
const dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('copipable-db', 1);
    req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
});

async function getAllNotesDB() {
    const db = await dbPromise;
    const tx = db.transaction('notes', 'readonly');
    const store = tx.objectStore('notes');
    return new Promise((res, rej) => {
        const r = store.getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}
async function addNoteDB(note) {
    const db = await dbPromise;
    const tx = db.transaction('notes', 'readwrite');
    tx.objectStore('notes').add(note);
    return tx.complete;
}
async function updateNoteDB(note) {
    const db = await dbPromise;
    const tx = db.transaction('notes', 'readwrite');
    tx.objectStore('notes').put(note);
    return tx.complete;
}
async function deleteNoteDB(id) {
    const db = await dbPromise;
    const tx = db.transaction('notes', 'readwrite');
    tx.objectStore('notes').delete(id);
    return tx.complete;
}
async function clearAllNotesDB() {
    const db = await dbPromise;
    const tx = db.transaction('notes', 'readwrite');
    tx.objectStore('notes').clear();
    return tx.complete;
}

// 数値をキーIDに変換
function numToKeyId(num) {
    if (num <= 9) return String(num);
    const code = 'a'.charCodeAt(0) + (num - 10);
    return String.fromCharCode(code);
}

// 各メモにキーIDを割り当て、DBとDOMを更新
async function assignNoteIds() {
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const keyId = numToKeyId(i + 1);
        note.keyId = keyId;
        await updateNoteDB(note);
        const noteEl = workspace.querySelector(`[data-id='${note.id}']`);
        if (noteEl) {
            const idEl = noteEl.querySelector('.note-id');
            if (idEl) idEl.textContent = `${keyId}`;
        }
    }
}

// load notes from IndexedDB
async function loadNotes() {
    notes = await getAllNotesDB();
    notes.forEach(renderNote);
    updateNoteCount();
    await assignNoteIds();
}

// update note count display
function updateNoteCount() {
    const counter = document.getElementById('number_of_memo');
    if (counter) counter.textContent = notes.length;
}

// generate unique id
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// コピー時のフィードバック表示
function showCopyFeedback() {
    const feedback = document.createElement('div');
    feedback.className = 'copy-feedback';
    feedback.textContent = 'Copied!';
    document.body.appendChild(feedback);
    // CSSトランジション適用
    setTimeout(() => feedback.classList.add('visible'), 10);
    // 一定時間後にフェードアウトして削除
    setTimeout(() => {
        feedback.classList.remove('visible');
        setTimeout(() => document.body.removeChild(feedback), 300);
    }, 1000);
}

// ノートをコピーする共通関数
async function handleCopy(note) {
    if (note.type === 'text') {
        await navigator.clipboard.writeText(note.content);
    } else if (note.type === 'image') {
        try {
            const res = await fetch(note.content);
            const blob = await res.blob();
            const item = new ClipboardItem({ [blob.type]: blob });
            await navigator.clipboard.write([item]);
        } catch (err) {
            console.error('画像のコピーに失敗しました', err);
        }
    }
    showCopyFeedback();
}

// create and append note element
function renderNote(note) {
    // ノートにcolorがなければdefaultNoteColorを設定
    if (!note.color) note.color = defaultNoteColor;
    // DB更新（マイグレーション対応）
    if (!note.color || !note.width || !note.height) updateNoteDB(note);
    // 既存ノートに幅・高さがない場合はデフォルトを設定
    if (!note.width || !note.height) {
        note.width = note.width || 200;
        note.height = note.height || 200;
        updateNoteDB(note);
    }
    if (!note.color) {
        note.color = defaultNoteColor;
        updateNoteDB(note);
    }
    const noteEl = document.createElement('div');
    noteEl.classList.add('note');
    noteEl.style.left = note.x + 'px';
    noteEl.style.top = note.y + 'px';
    noteEl.style.width = note.width + 'px';
    noteEl.style.height = note.height + 'px';
    noteEl.dataset.id = note.id;
    // 背景色設定
    noteEl.style.backgroundColor = COLORS.find(c => c.name === note.color).hex;

    // header
    const header = document.createElement('div');
    header.className = 'note-header';
    // キーIDラベル
    const idLabel = document.createElement('div');
    idLabel.className = 'note-id badge position-absolute top-0 small start-0 translate-start bg-secondary rounded-pill';
    idLabel.textContent = note.keyId || '';
    if (!window.electronAPI) idLabel.classList.add('invisible');

    // copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-sm btn-light';
    copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
    copyBtn.title = 'コピー';
    // delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-sm btn-light text-danger';
    deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
    deleteBtn.title = '削除';
    // ボタンをグループ化
    const btnGroup = document.createElement('div');
    btnGroup.className = 'btn-group-custom';
    // ボタンを横並びにする行を作成
    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';
    btnRow.appendChild(copyBtn);
    btnRow.appendChild(deleteBtn);
    btnGroup.appendChild(btnRow);
    // カラーパネル（メモ上部）
    const noteColorPanel = document.createElement('div');
    noteColorPanel.className = 'color-panel';
    COLORS.forEach(c => {
        const sw = document.createElement('div');
        sw.className = 'color-swatch';
        sw.style.backgroundColor = c.hex;
        sw.dataset.color = c.name;
        if (c.name === note.color) sw.classList.add('selected');
        sw.addEventListener('click', async () => {
            note.color = c.name;
            await updateNoteDB(note);
            noteEl.style.backgroundColor = c.hex;
            noteColorPanel.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('selected'));
            sw.classList.add('selected');
        });
        noteColorPanel.appendChild(sw);
    });
    noteEl.appendChild(idLabel);
    btnGroup.appendChild(noteColorPanel);
    header.appendChild(btnGroup);
    noteEl.appendChild(header);

    // content
    const content = document.createElement('div');
    content.className = 'note-content';
    if (note.type === 'text') {
        content.textContent = note.content;
    } else if (note.type === 'image') {
        const img = document.createElement('img');
        img.src = note.content;
        content.appendChild(img);
    }
    noteEl.appendChild(content);

    // size indicator
    const sizeEl = document.createElement('span');
    sizeEl.className = 'note-size';
    sizeEl.textContent = `${new Blob([note.content]).size} bytes`;
    noteEl.appendChild(sizeEl);

    workspace.appendChild(noteEl);

    // events
    // drag
    let isDragging = false;
    let offsetX, offsetY;
    header.addEventListener('mousedown', e => {
        isDragging = true;
        offsetX = e.clientX - noteEl.offsetLeft;
        offsetY = e.clientY - noteEl.offsetTop;
    });
    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const rawX = e.clientX - offsetX;
        const rawY = e.clientY - offsetY;
        noteEl.style.left = snap(rawX) + 'px';
        noteEl.style.top = snap(rawY) + 'px';
    });
    document.addEventListener('mouseup', async e => {
        if (isDragging) {
            isDragging = false;
            // update position
            const id = noteEl.dataset.id;
            const idx = notes.findIndex(n => n.id === id);
            if (idx > -1) {
                notes[idx].x = noteEl.offsetLeft;
                notes[idx].y = noteEl.offsetTop;
                await updateNoteDB(notes[idx]);
            }
        }
    });

    // リサイズ処理: ResizeObserver でリサイズ後をDBに保存
    // 初回コールをスキップするフラグ
    let isInitialResize = true;
    const resizeObserver = new ResizeObserver(entries => {
        if (isInitialResize) {
            // 初期描画時のNotifyを無視
            isInitialResize = false;
            return;
        }
        for (const entry of entries) {
            // 外側の幅・高さを取得（padding/borderを含む）
            const rect = noteEl.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            const id = noteEl.dataset.id;
            const idx = notes.findIndex(n => n.id === id);
            if (idx > -1) {
                notes[idx].width = width;
                notes[idx].height = height;
                updateNoteDB(notes[idx]);
            }
        }
    });
    resizeObserver.observe(noteEl);

    // copy
    copyBtn.addEventListener('click', async () => {
        await handleCopy(note);
    });

    // delete
    deleteBtn.addEventListener('click', async () => {
        workspace.removeChild(noteEl);
        notes = notes.filter(n => n.id !== note.id);
        await deleteNoteDB(note.id);
        updateNoteCount();
        await assignNoteIds();
    });

    // edit on double-click
    content.addEventListener('dblclick', () => {
        if (note.type === 'text') {
            const textarea = document.createElement('textarea');
            textarea.className = 'form-control';
            textarea.value = note.content;
            // 現在の改行数に合わせて縦幅を設定
            const lines = (note.content.match(/\r?\n/g) || []).length + 1;
            textarea.rows = lines;
            noteEl.replaceChild(textarea, content);
            textarea.focus();
            textarea.addEventListener('blur', async () => {
                note.content = textarea.value;
                await updateNoteDB(note);
                // update size display
                const sizeEl = noteEl.querySelector('.note-size');
                sizeEl.textContent = `${new Blob([note.content]).size} bytes`;
                content.textContent = note.content;
                noteEl.replaceChild(content, textarea);
            });
        } else if (note.type === 'image') {
            // 画像をモーダルで拡大表示
            const modalImage = document.getElementById('modalImage');
            modalImage.src = note.content;
            const imgModal = new bootstrap.Modal(document.getElementById('imageModal'));
            imgModal.show();
        }
    });
}

// add new text note
saveButton.addEventListener('click', async () => {
    const text = noteInput.value.trim();
    if (!text) return;
    const note = { id: generateId(), type: 'text', content: text, x: snap(10), y: snap(10), width: 200, height: 200, color: defaultNoteColor };
    await addNoteDB(note);
    notes.push(note);
    renderNote(note);
    updateNoteCount();
    await assignNoteIds();
    noteInput.value = '';
});

// Save shortcut: Mac uses Cmd+Enter, Windows uses Ctrl+Enter
noteInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && ((navigator.platform.includes('Mac') && e.metaKey) || (!navigator.platform.includes('Mac') && e.ctrlKey))) {
        e.preventDefault();
        saveButton.click();
    }
});

// paste で画像対応
noteInput.addEventListener('paste', async e => {
    const items = Array.from(e.clipboardData.items);
    for (const item of items) {
        if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = async () => {
                    const dataUrl = reader.result;
                    const note = { id: generateId(), type: 'image', content: dataUrl, x: snap(10), y: snap(10), width: 200, height: 200, color: defaultNoteColor };
                    await addNoteDB(note);
                    notes.push(note);
                    renderNote(note);
                    updateNoteCount();
                    await assignNoteIds();
                };
                reader.readAsDataURL(file);
                e.preventDefault();
            }
        }
    }
});

// enable image drag-and-drop on textarea
// highlight drop zone on drag
noteInput.addEventListener('dragenter', e => {
    e.preventDefault();
    noteInput.classList.add('drag-over');
});
noteInput.addEventListener('dragleave', e => {
    noteInput.classList.remove('drag-over');
});

noteInput.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    noteInput.classList.add('drag-over');
});
noteInput.addEventListener('drop', async e => {
    e.preventDefault();
    noteInput.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files || []);
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = async () => {
                const dataUrl = reader.result;
                const note = { id: generateId(), type: 'image', content: dataUrl, x: snap(10), y: snap(10), width: 200, height: 200, color: defaultNoteColor };
                await addNoteDB(note);
                notes.push(note);
                renderNote(note);
                updateNoteCount();
                await assignNoteIds();
            };
            reader.readAsDataURL(file);
        }
    }
});

// 全画面ドロップゾーン作成
const globalDropZone = document.createElement('div');
globalDropZone.id = 'global-drop-zone';
globalDropZone.textContent = 'ここに画像をドロップ';
document.body.appendChild(globalDropZone);

// 全画面ドラッグ＆ドロップイベント
// 画像ファイルドラッグ時にオーバーレイ表示
document.addEventListener('dragenter', e => {
    const items = e.dataTransfer.items;
    if (items && Array.from(items).some(item => item.kind === 'file' && item.type.startsWith('image/'))) {
        e.preventDefault();
        globalDropZone.classList.add('active');
    }
});
// オーバーレイ上でドラムオーバー
document.addEventListener('dragover', e => {
    const items = e.dataTransfer.items;
    if (items && Array.from(items).some(item => item.kind === 'file' && item.type.startsWith('image/'))) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }
});
// ドラッグ終了時にオーバーレイ非表示
document.addEventListener('dragend', () => {
    globalDropZone.classList.remove('active');
});
// オーバーレイから離れたとき
globalDropZone.addEventListener('dragleave', () => {
    globalDropZone.classList.remove('active');
});
// ドロップ処理
globalDropZone.addEventListener('drop', async e => {
    e.preventDefault();
    globalDropZone.classList.remove('active');
    const files = Array.from(e.dataTransfer.files || []);
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = async () => {
                const dataUrl = reader.result;
                // 画面中央に配置
                const baseX = (window.innerWidth - 200) / 2;
                const baseY = (window.innerHeight - 200) / 2;
                const note = { id: generateId(), type: 'image', content: dataUrl, x: snap(baseX), y: snap(baseY), width: 200, height: 200, color: defaultNoteColor };
                await addNoteDB(note);
                notes.push(note);
                renderNote(note);
                updateNoteCount();
                await assignNoteIds();
            };
            reader.readAsDataURL(file);
        }
    }
});

// clear all
clearAllButton.addEventListener('click', async () => {
    if (confirm('Are you sure you want to delete all notes?')) {
        await clearAllNotesDB();
        notes = [];
        workspace.innerHTML = '';
        updateNoteCount();
    }
});

// Dark/Light mode toggle via data-bs-theme
const themeToggle = document.getElementById('themeToggle');
// 初期状態設定
const htmlEl = document.documentElement;
themeToggle.checked = htmlEl.getAttribute('data-bs-theme') === 'dark';
themeToggle.addEventListener('change', () => {
    const mode = themeToggle.checked ? 'dark' : 'light';
    htmlEl.setAttribute('data-bs-theme', mode);
});

// display app version from manifest.json
fetch('manifest.json')
    .then(res => res.json())
    .then(data => {
        const verEl = document.getElementById('appVersion');
        if (verEl && data.version) verEl.textContent = `v${data.version}`;
    })
    .catch(err => console.error('Failed to load manifest version', err));

// Electron グローバルショートカット経由でペースト
if (window.electronAPI && window.electronAPI.onPasteNote) {
    window.electronAPI.onPasteNote(async (key) => {
        const note = notes.find(n => n.keyId === key);
        if (!note) return;
        if (note.type === 'text') {
            await navigator.clipboard.writeText(note.content);
        } else if (note.type === 'image') {
            try {
                const res = await fetch(note.content);
                const blob = await res.blob();
                const item = new ClipboardItem({ [blob.type]: blob });
                await navigator.clipboard.write([item]);
            } catch (err) {
                console.error('画像のコピーに失敗しました', err);
            }
        }
        // フォーカス中の要素に直接貼り付け
        const active = document.activeElement;
        if (note.type === 'text' && active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /text|search|url|tel|password/.test(active.type)))) {
            const start = active.selectionStart;
            const end = active.selectionEnd;
            const val = active.value;
            active.value = val.slice(0, start) + note.content + val.slice(end);
            active.selectionStart = active.selectionEnd = start + note.content.length;
            active.focus();
        } else {
            document.execCommand('paste');
        }
    });
}

// Electron グローバルショートカット経由でリクエストを受け取り、メモ内容を送信
if (window.electronAPI && window.electronAPI.onRequestNote) {
    window.electronAPI.onRequestNote((key) => {
        const note = notes.find(n => n.keyId === key);
        if (!note) return;
        window.electronAPI.sendDeliverNote(key, note.type, note.content);
    });
}

// Electron グローバルショートカット copy-note イベントでコピー
if (window.electronAPI && window.electronAPI.onCopyNote) {
    window.electronAPI.onCopyNote(async (key) => {
        const note = notes.find(n => n.keyId === key);
        if (!note) return;
        await handleCopy(note);
    });
}

// ※ ウィンドウ内keydownショートカットは廃止しました。

// init
loadNotes().then(() => {
    // レンダラー側のメモ配列をメインプロセスから参照可能に
    window.getNotes = () => notes;
});