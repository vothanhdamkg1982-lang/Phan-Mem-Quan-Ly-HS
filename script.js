/**
 * ============================================================
 * HỆ THỐNG QUẢN LÝ HỌC SINH TIỂU HỌC - JavaScript ES6
 * HỖ TRỢ NHIỀU MÔN HỌC (TIN HỌC & CÔNG NGHỆ)
 * ============================================================
 * Trường Tiểu học Trần Quốc Toản - Đặc khu Kiên Hải - An Giang
 * Giáo viên: Võ Thanh Đậm
 * Khối: 3, 4, 5
 * ============================================================
 * Chuyển đổi từ localStorage sang Supabase
 * - Database: app3_* tables
 * - Storage: app3-files bucket
 * - Auth: Supabase Auth
 * ============================================================
 */
import { supabase } from './supabase.js';
import { migrateLocalStorageToSupabase } from './migration.js';

// ============================================================
// 0. AVATAR MẶC ĐỊNH (BASE64)
// ============================================================
const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNlNWU3ZWIiIHJ4PSI1MCUiLz48Y2lyY2xlIGN4PSI1MCIgY3k9IjM4IiByPSIyNCIgZmlsbD0iIzhjOTU5YyIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNzUiIHI9IjI4IiBmaWxsPSIjOGM5NTljIi8+PC9zdmc+';

// ============================================================
// 1. STATE & DỮ LIỆU MẪU
// ============================================================
const APP_STATE = {
    currentPage: 'dashboard',
    students: [],
    classes: [],
    scores: {}, // { studentId: { 'Tin học': {giuaKy1, cuoiKy1, giuaKy2, cuoiKy2}, 'Công nghệ': {...} } }
    attendance: [],
    rewards: [],
    disciplines: [],
    files: [],
    settings: {
        schoolName: 'Trường Tiểu học Trần Quốc Toản',
        schoolYear: '2025-2026',
        theme: 'light',
        logo: '',
        teacherName: 'Võ Thanh Đậm'
    },
    selectedStudents: [],
    currentStudentId: null,
    darkMode: false,
    currentSubject: 'Tin học',
    // classMap để map tên lớp với id
    classMap: {}
};

const SUBJECTS = ['Tin học', 'Công nghệ'];

// ============================================================
// 2. FUNCTIONS TẢI DỮ LIỆU TỪ SUPABASE
// ============================================================

/**
 * Tải toàn bộ dữ liệu từ Supabase và cập nhật APP_STATE
 */
async function loadAllData() {
    showLoading();
    try {
        // 1. Tải classes
        const { data: classes, error: classErr } = await supabase
            .from('app3_classes')
            .select('*')
            .order('name');
        if (classErr) throw classErr;
        APP_STATE.classes = classes || [];
        // Xây dựng classMap
        APP_STATE.classMap = {};
        APP_STATE.classes.forEach(c => { APP_STATE.classMap[c.name] = c.id; });

        // 2. Tải students (kèm class name để hiển thị)
                // 2. Tải students (kèm class name để hiển thị)
        const { data: students, error: studentErr } = await supabase
            .from('app3_students')
            .select('*, app3_classes(name)')
            .order('full_name');
        if (studentErr) throw studentErr;
        
        // QUAN TRỌNG: Lưu UUID gốc của Supabase vào `db_uuid`
        APP_STATE.students = (students || []).map(s => ({
            ...s,
            db_uuid: s.id,
            // --- SỬA DÒNG NÀY ---
            // Nếu join app3_classes không ra, nó sẽ lấy dữ liệu từ s.class_code (dữ liệu backup lưu)
            class: s.app3_classes?.name || s.class_code || s.class || '', 
            id: s.student_code,
            fullName: s.full_name,
            dob: s.dob,
            gender: s.gender,
            address: s.address,
            phone: s.phone,
            email: s.email,
            fatherName: s.father_name,
            motherName: s.mother_name,
            parentPhone: s.parent_phone,
            competence: s.competence,
            quality: s.quality,
            enrollmentDate: s.enrollment_date,
            status: s.status,
            note: s.note,
            avatar: s.avatar_url || DEFAULT_AVATAR,
            grade: s.grade,
            class_id: s.class_id
        }));

        // 3. Tải scores (dạng flat)
        const { data: scoresData, error: scoreErr } = await supabase
            .from('app3_scores')
            .select('*');
        if (scoreErr) throw scoreErr;
        // Chuyển đổi về dạng object: { studentId: { subject: { ... } } }
        APP_STATE.scores = {};
        (scoresData || []).forEach(rec => {
            const studentUuid = rec.student_id;
            // Tìm lại Mã HS (student_code) từ UUID vừa lấy được
            const student = APP_STATE.students.find(s => s.db_uuid === studentUuid);
            if (student) {
                const studentId = student.id; // Lấy 'HS10001'
                if (!APP_STATE.scores[studentId]) APP_STATE.scores[studentId] = {};
                const subject = rec.subject;
                                APP_STATE.scores[studentId][subject] = {
                    giuaKy1: rec.giua_ky_1 || '',
                    cuoiKy1: rec.cuoi_ky_1 !== null ? rec.cuoi_ky_1 : null,
                    giuaKy2: rec.giua_ky_2 || '',
                    cuoiKy2: rec.cuoi_ky_2 !== null ? rec.cuoi_ky_2 : null,
                    competence: rec.competence || '', // Bổ sung
                    quality: rec.quality || ''        // Bổ sung
                };
            }
        });

        // 4. Tải attendance
        const { data: attendance, error: attErr } = await supabase
            .from('app3_attendance')
            .select('*');
        if (attErr) throw attErr;
        // Chuyển đổi sang cấu trúc cũ: [{ date, class, records: [{studentId, status}] }]
        APP_STATE.attendance = [];
        const attMap = {};
        (attendance || []).forEach(rec => {
            const key = `${rec.attendance_date}_${rec.class_id}`;
            if (!attMap[key]) {
                attMap[key] = {
                    date: rec.attendance_date,
                    class: APP_STATE.classes.find(c => c.id === rec.class_id)?.name || '',
                    class_id: rec.class_id,
                    records: []
                };
                APP_STATE.attendance.push(attMap[key]);
            }
            const student = APP_STATE.students.find(s => s.db_uuid === rec.student_id);
            if (student) {
                attMap[key].records.push({
                    studentId: student.id,
                    status: rec.status
                });
            }
        });

        // 5. Tải rewards
        const { data: rewards, error: rewErr } = await supabase
            .from('app3_rewards')
            .select('*')
            .order('date', { ascending: false });
        if (rewErr) throw rewErr;
        APP_STATE.rewards = (rewards || []).map(r => ({
            id: r.id,
            studentId: r.student_id, // Lưu UUID của học sinh được khen
            date: r.date,
            content: r.content,
            decisionBy: r.decision_by
        }));

        // 6. Tải disciplines
        const { data: disciplines, error: discErr } = await supabase
            .from('app3_disciplines')
            .select('*')
            .order('date', { ascending: false });
        if (discErr) throw discErr;
        APP_STATE.disciplines = (disciplines || []).map(d => ({
            id: d.id,
            studentId: d.student_id, // Lưu UUID của học sinh bị kỷ luật
            date: d.date,
            content: d.content,
            decisionBy: d.decision_by
        }));

        // 7. Tải files (metadata)
        const { data: files, error: fileErr } = await supabase
            .from('app3_files')
            .select('*')
            .order('created_at', { ascending: false });
        if (fileErr) throw fileErr;
        APP_STATE.files = (files || []).map(f => ({
            id: f.id,
            name: f.file_name,
            type: f.file_type,
            size: f.file_size,
            uploadDate: f.created_at,
            desc: f.description,
            path: f.file_path,
            url: f.file_url
        }));

        // 8. Tải settings
        const { data: settings, error: setErr } = await supabase
            .from('app3_settings')
            .select('*')
            .limit(1)
            .maybeSingle();
        if (setErr) throw setErr;
        if (settings) {
            APP_STATE.settings = {
                schoolName: settings.school_name || APP_STATE.settings.schoolName,
                schoolYear: settings.school_year || APP_STATE.settings.schoolYear,
                teacherName: settings.teacher_name || APP_STATE.settings.teacherName,
                theme: settings.theme || 'light',
                logo: settings.logo_url || ''
            };
        }

        // Cập nhật dark mode nếu có
        if (APP_STATE.settings.theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            APP_STATE.darkMode = true;
        } else {
            document.documentElement.removeAttribute('data-theme');
            APP_STATE.darkMode = false;
        }

        // Cập nhật class counts (không cần lưu xuống DB, chỉ tính để hiển thị)
        updateClassCounts();

        console.log('Đã tải dữ liệu từ Supabase thành công!');
    } catch (err) {
        console.error('Lỗi tải dữ liệu:', err);
        showToast('Không thể tải dữ liệu từ Supabase. Vui lòng kiểm tra kết nối.', 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Tính sĩ số, nam/nữ cho các lớp (chỉ để hiển thị, không lưu DB)
 */
function updateClassCounts() {
    APP_STATE.classes.forEach(cls => {
        // Cách đếm mới: Lọc học sinh dựa trên Tên lớp (cls.name) thay vì class_id
        const list = APP_STATE.students.filter(s => s.class === cls.name || s.class_code === cls.name);
        
        cls.count = list.length;
        cls.male = list.filter(s => s.gender === 'Nam').length;
        cls.female = list.filter(s => s.gender === 'Nữ').length;
    });
}

// ============================================================
// 3. UTILITY FUNCTIONS
// ============================================================
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}

function getStatusBadge(status) {
    const map = {
        'Đang học': 'badge-success',
        'Đã chuyển': 'badge-warning',
        'Đã tốt nghiệp': 'badge-info',
        'Bảo lưu': 'badge-danger'
    };
    return `<span class="badge ${map[status] || 'badge-info'}">${status}</span>`;
}

function displayText(value) {
    return value || '';
}

function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    const colors = {
        success: '#16a34a',
        error: '#dc2626',
        warning: '#f59e0b',
        info: '#2563eb'
    };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="${icons[type] || icons.info}" style="color:${colors[type] || colors.info};"></i>
        <span>${message}</span>
        <button class="toast-close"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(toast);
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));
    setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
    toast.classList.add('toast-removing');
    setTimeout(() => toast.remove(), 300);
}

let modalResolve = null;
function showModal(title, bodyHTML, confirmText = 'Xác nhận', cancelText = 'Hủy') {
    return new Promise((resolve) => {
        const container = document.getElementById('modalContainer');
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = bodyHTML;
        document.getElementById('modalConfirm').textContent = confirmText;
        document.getElementById('modalCancel').textContent = cancelText;
        container.classList.remove('hidden');
        modalResolve = resolve;
    });
}

document.getElementById('modalConfirm').addEventListener('click', () => {
    document.getElementById('modalContainer').classList.add('hidden');
    if (modalResolve) modalResolve(true);
});
document.getElementById('modalCancel').addEventListener('click', () => {
    document.getElementById('modalContainer').classList.add('hidden');
    if (modalResolve) modalResolve(false);
});
document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('modalContainer').classList.add('hidden');
    if (modalResolve) modalResolve(false);
});

function showLoading() { document.getElementById('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.add('hidden'); }

// ============================================================
// 4. RENDER PAGES (giữ nguyên, không thay đổi UI)
// ============================================================
function renderPage(page) {
    APP_STATE.currentPage = page;
    document.getElementById('pageTitle').textContent = getPageTitle(page);
    const container = document.getElementById('pageContainer');
    switch (page) {
        case 'dashboard': container.innerHTML = renderDashboard(); break;
        case 'students': container.innerHTML = renderStudents(); break;
        case 'classes': container.innerHTML = renderClasses(); break;
        case 'scores': container.innerHTML = renderScores(); break;
        case 'attendance': container.innerHTML = renderAttendance(); break;
        case 'rewards': container.innerHTML = renderRewards(); break;
        case 'disciplines': container.innerHTML = renderDisciplines(); break;
        case 'files': container.innerHTML = renderFiles(); break;
        case 'statistics': container.innerHTML = renderStatistics(); break;
        case 'search': container.innerHTML = renderSearch(); break;
        case 'settings': container.innerHTML = renderSettings(); break;
        default: container.innerHTML = '<p>Trang không tồn tại.</p>';
    }
    setTimeout(() => {
        if (page === 'dashboard') initCharts();
        if (page === 'students') initStudentTable();
        if (page === 'classes') initClassTable();
        if (page === 'scores') initScoreTable();
        if (page === 'attendance') loadAttendance();
        if (page === 'settings') initSettings();
        if (page === 'search') initSearch();
        if (page === 'statistics') initStatCharts();
    }, 50);
}

function getPageTitle(page) {
    const titles = {
        dashboard: 'Dashboard',
        students: 'Học sinh',
        classes: 'Lớp',
        scores: 'Điểm',
        attendance: 'Điểm danh',
        rewards: 'Khen thưởng',
        disciplines: 'Kỷ luật',
        files: 'File',
        statistics: 'Thống kê',
        search: 'Tìm kiếm',
        settings: 'Cài đặt'
    };
    return titles[page] || page;
}

// ============================================================
// 5. DASHBOARD & CHARTS (dùng dữ liệu từ APP_STATE)
// ============================================================
function renderDashboard() {
    const students = APP_STATE.students;
    const total = students.length;
    const male = students.filter(s => s.gender === 'Nam').length;
    const female = total - male;
    const classes = APP_STATE.classes;

    return `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-user-graduate"></i></div><div class="stat-value">${total}</div><div class="stat-label">Tổng HS</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-chalkboard"></i></div><div class="stat-value">${classes.length}</div><div class="stat-label">Số lớp</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-male" style="color:#2563eb;"></i></div><div class="stat-value">${male}</div><div class="stat-label">Nam</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-female" style="color:#ec4899;"></i></div><div class="stat-value">${female}</div><div class="stat-label">Nữ</div></div>
        </div>
        <div class="chart-grid">
            <div class="chart-box"><canvas id="chartGender"></canvas></div>
            <div class="chart-box"><canvas id="chartClass"></canvas></div>
        </div>
    `;
}

let chartInstances = {};

function initCharts() {
    const students = APP_STATE.students;
    const classes = APP_STATE.classes;

    const male = students.filter(s => s.gender === 'Nam').length;
    const female = students.length - male;
    if (chartInstances.gender) chartInstances.gender.destroy();
    chartInstances.gender = new Chart(document.getElementById('chartGender'), {
        type: 'doughnut',
        data: {
            labels: ['Nam', 'Nữ'],
            datasets: [{
                data: [male, female],
                backgroundColor: ['#2563eb', '#ec4899'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { size: 12 } } } }
        }
    });

    const classNames = classes.map(c => c.name);
    const classCounts = classes.map(c => c.count);
    if (chartInstances.class) chartInstances.class.destroy();
    chartInstances.class = new Chart(document.getElementById('chartClass'), {
        type: 'bar',
        data: {
            labels: classNames,
            datasets: [{
                label: 'Sĩ số',
                data: classCounts,
                backgroundColor: '#60a5fa',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } } }
        }
    });
}

// ============================================================
// 6. QUẢN LÝ HỌC SINH (CRUD + IMPORT/EXCEL + AVATAR)
// ============================================================
let studentPage = 1;
const STUDENT_PAGE_SIZE = 10;
let studentSort = { field: 'fullName', order: 'asc' };

function renderStudents() {
    return `
        <div class="card">
            <div class="flex-between mb-2">
                <h3 class="card-title"><i class="fas fa-user-graduate"></i> Danh sách học sinh</h3>
                <div class="flex gap-2">
                    <button class="btn btn-primary btn-sm" onclick="openAddStudent()"><i class="fas fa-plus"></i> Thêm</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSelectedStudents()"><i class="fas fa-trash"></i> Xóa nhiều</button>
                    <button class="btn btn-success btn-sm" onclick="exportExcel()"><i class="fas fa-file-excel"></i> Excel</button>
                    <button class="btn btn-secondary btn-sm" onclick="downloadSampleExcel()"><i class="fas fa-file-excel"></i> Tải mẫu</button>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('importFileInput').click()"><i class="fas fa-upload"></i> Import Excel</button>
                    <input type="file" id="importFileInput" accept=".xlsx,.xls" style="display:none" onchange="importExcel(event)">
                    <button class="btn btn-secondary btn-sm" onclick="printStudents()"><i class="fas fa-print"></i> In</button>
                </div>
            </div>
            <div class="search-bar">
                <input type="text" id="studentSearch" placeholder="Tìm theo tên, mã HS..." oninput="filterStudents()">
                <select id="filterClass" onchange="filterStudents()"><option value="">Tất cả lớp</option>${APP_STATE.classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}</select>
                <select id="filterGrade" onchange="filterStudents()"><option value="">Tất cả khối</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select>
                <select id="filterGender" onchange="filterStudents()"><option value="">Giới tính</option><option value="Nam">Nam</option><option value="Nữ">Nữ</option></select>
                <button class="btn btn-secondary btn-sm" onclick="resetFilters()"><i class="fas fa-undo"></i> Reset</button>
            </div>
            <div class="table-wrapper">
                <table id="studentTable">
                    <thead><tr>
                        <th><input type="checkbox" id="selectAll" onchange="toggleSelectAll()"></th>
                        <th>STT</th>
                        <th>Ảnh</th>
                        <th data-sort="id">Mã HS</th>
                        <th data-sort="fullName">Họ tên</th>
                        <th data-sort="dob">Ngày sinh</th>
                        <th data-sort="gender">Giới tính</th>
                        <th data-sort="class">Lớp</th>
                        <th data-sort="competence">Năng lực</th>
                        <th data-sort="quality">Phẩm chất</th>
                        <th data-sort="status">Trạng thái</th>
                        <th>Thao tác</th>
                    </tr></thead>
                    <tbody id="studentTableBody"></tbody>
                </table>
            </div>
            <div class="pagination" id="studentPagination"></div>
        </div>
    `;
}

function getFilteredStudents() {
    let list = [...APP_STATE.students];
    const k = document.getElementById('studentSearch')?.value?.toLowerCase() || '';
    if (k) list = list.filter(s => s.fullName.toLowerCase().includes(k) || s.id.toLowerCase().includes(k));
    const cls = document.getElementById('filterClass')?.value || '';
    if (cls) list = list.filter(s => s.class === cls);
    const grd = document.getElementById('filterGrade')?.value || '';
    if (grd) list = list.filter(s => s.grade === grd);
    const gen = document.getElementById('filterGender')?.value || '';
    if (gen) list = list.filter(s => s.gender === gen);
    const field = studentSort.field;
    const order = studentSort.order;
    list.sort((a, b) => {
        let va = a[field] || '';
        let vb = b[field] || '';
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return order === 'asc' ? -1 : 1;
        if (va > vb) return order === 'asc' ? 1 : -1;
        return 0;
    });
    return list;
}

function initStudentTable() {
    const list = getFilteredStudents();
    const total = list.length;
    const totalPages = Math.ceil(total / STUDENT_PAGE_SIZE);
    if (studentPage > totalPages) studentPage = totalPages || 1;
    const start = (studentPage - 1) * STUDENT_PAGE_SIZE;
    const pageData = list.slice(start, start + STUDENT_PAGE_SIZE);
    const tbody = document.getElementById('studentTableBody');
    if (!tbody) return;
    tbody.innerHTML = pageData.map((s, idx) => {
        const stt = start + idx + 1;
        const checked = APP_STATE.selectedStudents.includes(s.id) ? 'checked' : '';
        const avatarSrc = (s.avatar && s.avatar.startsWith('data:image')) ? s.avatar : DEFAULT_AVATAR;
        return `<tr>
            <td><input type="checkbox" class="student-check" data-id="${s.id}" ${checked} onchange="toggleStudent('${s.id}')"></td>
            <td>${stt}</td>
            <td><img src="${avatarSrc}" class="avatar-sm" alt="avatar" style="width:32px;height:32px;border-radius:50%;object-fit:cover;"></td>
            <td><strong>${s.id}</strong></td>
            <td>${s.fullName}</td>
            <td>${formatDate(s.dob)}</td>
            <td>${s.gender}</td>
            <td>${s.class}</td>
            <td>${displayText(s.competence)}</td>
            <td>${displayText(s.quality)}</td>
            <td>${getStatusBadge(s.status)}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon" title="Xem" onclick="viewStudent('${s.id}')"><i class="fas fa-eye"></i></button>
                    <button class="btn-icon" title="Sửa" onclick="editStudent('${s.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" title="Xóa" onclick="deleteStudent('${s.id}')" style="color:#dc2626;"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');

    const pag = document.getElementById('studentPagination');
    if (pag) {
        let html = `<button onclick="goStudentPage(${studentPage - 1})" ${studentPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<button class="${i === studentPage ? 'active' : ''}" onclick="goStudentPage(${i})">${i}</button>`;
        }
        html += `<button onclick="goStudentPage(${studentPage + 1})" ${studentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        pag.innerHTML = html;
    }
    document.querySelectorAll('#studentTable thead th[data-sort]').forEach(th => {
        th.style.cursor = 'pointer';
        th.onclick = function() {
            const field = this.dataset.sort;
            if (studentSort.field === field) {
                studentSort.order = studentSort.order === 'asc' ? 'desc' : 'asc';
            } else {
                studentSort.field = field;
                studentSort.order = 'asc';
            }
            initStudentTable();
        };
    });
}

function filterStudents() { studentPage = 1; initStudentTable(); }
function resetFilters() {
    document.getElementById('studentSearch').value = '';
    document.getElementById('filterClass').value = '';
    document.getElementById('filterGrade').value = '';
    document.getElementById('filterGender').value = '';
    filterStudents();
}
function goStudentPage(p) {
    const list = getFilteredStudents();
    const totalPages = Math.ceil(list.length / STUDENT_PAGE_SIZE);
    if (p < 1 || p > totalPages) return;
    studentPage = p;
    initStudentTable();
}

function toggleStudent(id) {
    const idx = APP_STATE.selectedStudents.indexOf(id);
    if (idx > -1) APP_STATE.selectedStudents.splice(idx, 1);
    else APP_STATE.selectedStudents.push(id);
    initStudentTable();
}
function toggleSelectAll() {
    const checked = document.getElementById('selectAll').checked;
    const list = getFilteredStudents();
    const start = (studentPage - 1) * STUDENT_PAGE_SIZE;
    const pageData = list.slice(start, start + STUDENT_PAGE_SIZE);
    if (checked) {
        pageData.forEach(s => { if (!APP_STATE.selectedStudents.includes(s.id)) APP_STATE.selectedStudents.push(s.id); });
    } else {
        pageData.forEach(s => {
            const idx = APP_STATE.selectedStudents.indexOf(s.id);
            if (idx > -1) APP_STATE.selectedStudents.splice(idx, 1);
        });
    }
    initStudentTable();
}

// ============================================================
// 7. CÁC HÀM XỬ LÝ AVATAR VÀ THÊM/SỬA HỌC SINH (có dùng Supabase)
// ============================================================
function resizeImage(dataUrl, maxWidth = 200, maxHeight = 200, quality = 0.7) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round(height * maxWidth / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round(width * maxHeight / height);
                    height = maxHeight;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const resizedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(resizedDataUrl);
        };
        img.src = dataUrl;
    });
}

function previewAvatar(input) {
    const preview = document.getElementById('sfAvatarPreview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const dataUrl = e.target.result;
            const resizedUrl = await resizeImage(dataUrl, 200, 200, 0.7);
            preview.src = resizedUrl;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function clearAvatar() {
    const preview = document.getElementById('sfAvatarPreview');
    if (preview) preview.src = DEFAULT_AVATAR;
    const input = document.getElementById('sfAvatarInput');
    if (input) input.value = '';
}

function getStudentFormHTML(student = null, showAvatar = true) {
    const s = student || {};
    const classes = APP_STATE.classes.map(c => c.name);
    const avatarSrc = (s.avatar && s.avatar.startsWith('data:image')) ? s.avatar : DEFAULT_AVATAR;
    const compOptions = ['', 'Tốt', 'Đạt', 'Cần cố gắng'];
    const qualOptions = ['', 'Tốt', 'Đạt', 'Cần cố gắng'];

    return `
        ${showAvatar ? `
        <div style="text-align:center; margin-bottom:1rem;">
            <img id="sfAvatarPreview" src="${avatarSrc}" class="profile-avatar" style="width:120px; height:120px; border-radius:50%; object-fit:cover; border:3px solid var(--primary);">
            <div style="margin-top:0.5rem; display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
                <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
                    <i class="fas fa-upload"></i> Tải ảnh
                    <input type="file" id="sfAvatarInput" accept="image/*" style="display:none" onchange="previewAvatar(this)">
                </label>
                <button class="btn btn-danger btn-sm" onclick="clearAvatar()"><i class="fas fa-times"></i> Xóa ảnh</button>
            </div>
        </div>
        ` : ''}
        <div class="form-grid">
            <div class="form-group"><label>Họ và tên *</label><input type="text" id="sfFullName" value="${s.fullName || ''}" placeholder="Nguyễn Văn A"></div>
            <div class="form-group"><label>Ngày sinh *</label><input type="date" id="sfDob" value="${s.dob || ''}"></div>
            <div class="form-group"><label>Giới tính</label>
                <select id="sfGender"><option value="Nam" ${s.gender === 'Nam' ? 'selected' : ''}>Nam</option><option value="Nữ" ${s.gender === 'Nữ' ? 'selected' : ''}>Nữ</option></select>
            </div>
            <div class="form-group"><label>Lớp</label>
                <select id="sfClass">${classes.map(c => `<option value="${c}" ${s.class === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
            </div>
            <div class="form-group"><label>Khối</label>
                <select id="sfGrade"><option value="3" ${s.grade === '3' ? 'selected' : ''}>3</option><option value="4" ${s.grade === '4' ? 'selected' : ''}>4</option><option value="5" ${s.grade === '5' ? 'selected' : ''}>5</option></select>
            </div>
            <div class="form-group"><label>Địa chỉ</label><input type="text" id="sfAddress" value="${s.address || ''}"></div>
            <div class="form-group"><label>Số điện thoại</label><input type="text" id="sfPhone" value="${s.phone || ''}"></div>
            <div class="form-group"><label>Email</label><input type="email" id="sfEmail" value="${s.email || ''}"></div>
            <div class="form-group"><label>Tên cha</label><input type="text" id="sfFather" value="${s.fatherName || ''}"></div>
            <div class="form-group"><label>Tên mẹ</label><input type="text" id="sfMother" value="${s.motherName || ''}"></div>
            <div class="form-group"><label>SĐT phụ huynh</label><input type="text" id="sfParentPhone" value="${s.parentPhone || ''}"></div>
            <div class="form-group"><label>Trạng thái</label>
                <select id="sfStatus"><option value="Đang học" ${s.status === 'Đang học' ? 'selected' : ''}>Đang học</option><option value="Đã chuyển" ${s.status === 'Đã chuyển' ? 'selected' : ''}>Đã chuyển</option><option value="Đã tốt nghiệp" ${s.status === 'Đã tốt nghiệp' ? 'selected' : ''}>Đã tốt nghiệp</option><option value="Bảo lưu" ${s.status === 'Bảo lưu' ? 'selected' : ''}>Bảo lưu</option></select>
            </div>
            <div class="form-group"><label>Năng lực</label>
                <select id="sfCompetence">
                    ${compOptions.map(opt => `<option value="${opt}" ${s.competence === opt ? 'selected' : ''}>${opt || ''}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>Phẩm chất</label>
                <select id="sfQuality">
                    ${qualOptions.map(opt => `<option value="${opt}" ${s.quality === opt ? 'selected' : ''}>${opt || ''}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>Ngày nhập học</label><input type="date" id="sfEnrollmentDate" value="${s.enrollmentDate || ''}"></div>
            <div class="form-group"><label>Ghi chú</label><textarea id="sfNote">${s.note || ''}</textarea></div>
        </div>
    `;
}

function getStudentFormData() {
    const dob = document.getElementById('sfDob').value;
    return {
        fullName: document.getElementById('sfFullName').value.trim(),
        dob: dob,
        gender: document.getElementById('sfGender').value,
        class: document.getElementById('sfClass').value,
        grade: document.getElementById('sfGrade').value,
        address: document.getElementById('sfAddress').value.trim(),
        phone: document.getElementById('sfPhone').value.trim(),
        email: document.getElementById('sfEmail').value.trim(),
        fatherName: document.getElementById('sfFather').value.trim(),
        motherName: document.getElementById('sfMother').value.trim(),
        parentPhone: document.getElementById('sfParentPhone').value.trim(),
        status: document.getElementById('sfStatus').value,
        note: document.getElementById('sfNote').value.trim(),
        competence: document.getElementById('sfCompetence').value,
        quality: document.getElementById('sfQuality').value,
        enrollmentDate: document.getElementById('sfEnrollmentDate').value || new Date().toISOString().split('T')[0]
    };
}

async function addStudentToSupabase(data, avatarFile) {
    const classObj = APP_STATE.classes.find(c => c.name === data.class);
    const classId = classObj ? classObj.id : null;

    const maxCode = APP_STATE.students.reduce((max, s) => {
        const num = parseInt(s.id.replace('HS', ''));
        return num > max ? num : max;
    }, 10000);
    const studentCode = `HS${String(maxCode + 1).padStart(5, '0')}`;

    let avatarUrl = DEFAULT_AVATAR;
    if (avatarFile) {
        try {
            const reader = new FileReader();
            const base64 = await new Promise((resolve) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(avatarFile);
            });
            const resized = await resizeImage(base64, 200, 200, 0.7);
            avatarUrl = resized;
        } catch (err) {
            console.warn('Lỗi xử lý ảnh:', err);
        }
    }

    const studentData = {
        student_code: studentCode,
        full_name: data.fullName,
        dob: data.dob || null,
        gender: data.gender,
        address: data.address,
        phone: data.phone,
        email: data.email,
        class_id: classId,
        grade: data.grade,
        father_name: data.fatherName,
        mother_name: data.motherName,
        parent_phone: data.parentPhone,
        competence: data.competence,
        quality: data.quality,
        enrollment_date: data.enrollmentDate || null,
        status: data.status || 'Đang học',
        note: data.note,
        avatar_url: avatarUrl
    };

    const { data: inserted, error } = await supabase
        .from('app3_students')
        .insert([studentData])
        .select()
        .single();

    if (error) throw error;

    const newStudent = {
        ...inserted,
        db_uuid: inserted.id,
        id: inserted.student_code,
        fullName: inserted.full_name,
        dob: inserted.dob,
        gender: inserted.gender,
        address: inserted.address,
        phone: inserted.phone,
        email: inserted.email,
        fatherName: inserted.father_name,
        motherName: inserted.mother_name,
        parentPhone: inserted.parent_phone,
        competence: inserted.competence,
        quality: inserted.quality,
        enrollmentDate: inserted.enrollment_date,
        status: inserted.status,
        note: inserted.note,
        avatar: inserted.avatar_url || DEFAULT_AVATAR,
        grade: inserted.grade,
        class: data.class,
        class_id: inserted.class_id
    };
    APP_STATE.students.push(newStudent);
    APP_STATE.scores[newStudent.id] = {};
    SUBJECTS.forEach(sub => {
        APP_STATE.scores[newStudent.id][sub] = { giuaKy1: '', cuoiKy1: null, giuaKy2: '', cuoiKy2: null };
    });
    updateClassCounts();
    return newStudent;
}

function openAddStudent() {
    showModal('Thêm học sinh', getStudentFormHTML(null, true), 'Thêm', 'Hủy').then(async confirmed => {
        if (confirmed) {
            const data = getStudentFormData();
            if (!data.fullName || !data.dob) {
                showToast('Vui lòng điền đầy đủ thông tin!', 'error');
                return;
            }
            const avatarInput = document.getElementById('sfAvatarInput');
            const avatarFile = avatarInput && avatarInput.files.length ? avatarInput.files[0] : null;

            try {
                await addStudentToSupabase(data, avatarFile);
                showToast('Thêm học sinh thành công!');
                renderPage('students');
            } catch (err) {
                showToast('Lỗi khi thêm học sinh: ' + err.message, 'error');
            }
        }
    });
}

async function updateStudentInSupabase(id, data, avatarFile) {
    const existing = APP_STATE.students.find(s => s.id === id);
    if (!existing) throw new Error('Không tìm thấy học sinh');

    const classObj = APP_STATE.classes.find(c => c.name === data.class);
    const classId = classObj ? classObj.id : null;

    let avatarUrl = existing.avatar;
    if (avatarFile) {
        try {
            const reader = new FileReader();
            const base64 = await new Promise((resolve) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(avatarFile);
            });
            const resized = await resizeImage(base64, 200, 200, 0.7);
            avatarUrl = resized;
        } catch (err) {
            console.warn('Lỗi xử lý ảnh mới:', err);
        }
    } else {
        if (!avatarUrl || avatarUrl === DEFAULT_AVATAR) {
            avatarUrl = DEFAULT_AVATAR;
        }
    }

    const updateData = {
        full_name: data.fullName,
        dob: data.dob || null,
        gender: data.gender,
        address: data.address,
        phone: data.phone,
        email: data.email,
        class_id: classId,
        grade: data.grade,
        father_name: data.fatherName,
        mother_name: data.motherName,
        parent_phone: data.parentPhone,
        competence: data.competence,
        quality: data.quality,
        enrollment_date: data.enrollmentDate || null,
        status: data.status || 'Đang học',
        note: data.note,
        avatar_url: avatarUrl
    };

    const { error } = await supabase
        .from('app3_students')
        .update(updateData)
        .eq('student_code', id);

    if (error) throw error;

    Object.assign(existing, {
        fullName: data.fullName,
        dob: data.dob,
        gender: data.gender,
        address: data.address,
        phone: data.phone,
        email: data.email,
        fatherName: data.fatherName,
        motherName: data.motherName,
        parentPhone: data.parentPhone,
        competence: data.competence,
        quality: data.quality,
        enrollmentDate: data.enrollmentDate,
        status: data.status,
        note: data.note,
        avatar: avatarUrl,
        grade: data.grade,
        class: data.class,
        class_id: classId
    });
    updateClassCounts();
    return existing;
}

function editStudent(id) {
    const student = APP_STATE.students.find(s => s.id === id);
    if (!student) return;
    showModal('Sửa học sinh', getStudentFormHTML(student, true), 'Cập nhật', 'Hủy').then(async confirmed => {
        if (confirmed) {
            const data = getStudentFormData();
            if (!data.fullName || !data.dob) {
                showToast('Vui lòng điền đầy đủ thông tin!', 'error');
                return;
            }
            const avatarInput = document.getElementById('sfAvatarInput');
            const avatarFile = avatarInput && avatarInput.files.length ? avatarInput.files[0] : null;

            try {
                await updateStudentInSupabase(id, data, avatarFile);
                showToast('Cập nhật thành công!');
                renderPage('students');
            } catch (err) {
                showToast('Lỗi cập nhật: ' + err.message, 'error');
            }
        }
    });
}

function viewStudent(id) {
    const s = APP_STATE.students.find(st => st.id === id);
    if (!s) return;
    const avatarSrc = (s.avatar && s.avatar.startsWith('data:image')) ? s.avatar : DEFAULT_AVATAR;
    const html = `
        <div class="profile-header">
            <img src="${avatarSrc}" class="profile-avatar" id="viewAvatar" alt="avatar" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid var(--primary);">
            <div class="profile-info">
                <h2>${s.fullName}</h2>
                <p><strong>Mã HS:</strong> ${s.id} | <strong>Lớp:</strong> ${s.class} | <strong>Khối:</strong> ${s.grade}</p>
                <p>${getStatusBadge(s.status)}</p>
                <div style="margin-top:0.5rem; display:flex; gap:0.5rem;">
                    <button class="btn btn-primary btn-sm" onclick="downloadAvatar('${s.id}')"><i class="fas fa-download"></i> Tải ảnh</button>
                </div>
            </div>
        </div>
        <div class="form-grid">
            <div><label>Ngày sinh</label><p><strong>${formatDate(s.dob)}</strong></p></div>
            <div><label>Giới tính</label><p><strong>${s.gender}</strong></p></div>
            <div><label>Địa chỉ</label><p><strong>${s.address || ''}</strong></p></div>
            <div><label>SĐT</label><p><strong>${s.phone || ''}</strong></p></div>
            <div><label>Email</label><p><strong>${s.email || ''}</strong></p></div>
            <div><label>Năng lực</label><p><strong>${displayText(s.competence)}</strong></p></div>
            <div><label>Phẩm chất</label><p><strong>${displayText(s.quality)}</strong></p></div>
            <div><label>Ngày nhập học</label><p><strong>${formatDate(s.enrollmentDate)}</strong></p></div>
            <div><label>Tên cha</label><p><strong>${s.fatherName || ''}</strong></p></div>
            <div><label>Tên mẹ</label><p><strong>${s.motherName || ''}</strong></p></div>
            <div><label>SĐT phụ huynh</label><p><strong>${s.parentPhone || ''}</strong></p></div>
            <div><label>Ghi chú</label><p><strong>${s.note || ''}</strong></p></div>
        </div>
        <div class="flex gap-2 mt-2">
            <button class="btn btn-primary btn-sm" onclick="printStudent('${s.id}')"><i class="fas fa-print"></i> In hồ sơ</button>
        </div>
    `;
    showModal('Hồ sơ học sinh', html, 'Đóng', '');
}

function downloadAvatar(studentId) {
    const student = APP_STATE.students.find(s => s.id === studentId);
    if (!student) return;
    const avatarSrc = (student.avatar && student.avatar.startsWith('data:image')) ? student.avatar : null;
    if (!avatarSrc || avatarSrc === DEFAULT_AVATAR) {
        showToast('Học sinh này chưa có ảnh riêng.', 'warning');
        return;
    }
    const link = document.createElement('a');
    link.href = avatarSrc;
    link.download = `avatar_${student.fullName.replace(/\s/g,'_')}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Đang tải ảnh...', 'info');
}

async function deleteStudent(id) {
    const student = APP_STATE.students.find(s => s.id === id);
    if (!student) return;
    const confirmed = await showModal('Xóa học sinh', `Bạn có chắc muốn xóa học sinh <strong>${student.fullName}</strong>?`, 'Xóa', 'Hủy');
    if (confirmed) {
        try {
            const { error } = await supabase
                .from('app3_students')
                .delete()
                .eq('student_code', id);
            if (error) throw error;

            APP_STATE.students = APP_STATE.students.filter(s => s.id !== id);
            APP_STATE.selectedStudents = APP_STATE.selectedStudents.filter(sid => sid !== id);
            delete APP_STATE.scores[id];
            updateClassCounts();
            showToast('Đã xóa học sinh!', 'warning');
            renderPage('students');
        } catch (err) {
            showToast('Lỗi xóa: ' + err.message, 'error');
        }
    }
}

async function deleteSelectedStudents() {
    if (APP_STATE.selectedStudents.length === 0) {
        showToast('Vui lòng chọn ít nhất một học sinh.', 'warning');
        return;
    }
    const confirmed = await showModal('Xóa nhiều học sinh', `Bạn có chắc muốn xóa <strong>${APP_STATE.selectedStudents.length}</strong> học sinh?`, 'Xóa tất cả', 'Hủy');
    if (confirmed) {
        try {
            const ids = APP_STATE.selectedStudents;
            const { error } = await supabase
                .from('app3_students')
                .delete()
                .in('student_code', ids);
            if (error) throw error;

            APP_STATE.students = APP_STATE.students.filter(s => !ids.includes(s.id));
            ids.forEach(id => delete APP_STATE.scores[id]);
            APP_STATE.selectedStudents = [];
            updateClassCounts();
            showToast('Đã xóa các học sinh đã chọn!', 'warning');
            renderPage('students');
        } catch (err) {
            showToast('Lỗi xóa: ' + err.message, 'error');
        }
    }
}

// ============================================================
// 8. IMPORT / EXPORT EXCEL (học sinh)
// ============================================================
function exportExcel() {
    const data = APP_STATE.students.map(s => ({
        'Mã HS': s.id,
        'Họ tên': s.fullName,
        'Ngày sinh': s.dob,
        'Giới tính': s.gender,
        'Lớp': s.class,
        'Khối': s.grade,
        'Địa chỉ': s.address,
        'SĐT': s.phone,
        'Email': s.email,
        'Năng lực': s.competence || '',
        'Phẩm chất': s.quality || '',
        'Trạng thái': s.status,
        'Tên cha': s.fatherName || '',
        'Tên mẹ': s.motherName || '',
        'SĐT phụ huynh': s.parentPhone || '',
        'Ngày nhập học': s.enrollmentDate || '',
        'Ghi chú': s.note || ''
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'HocSinh');
    XLSX.writeFile(wb, `Danh_sach_hoc_sinh_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('Xuất Excel thành công!');
}

function downloadSampleExcel() {
    const sampleData = [{
        'Mã HS': 'HS10001',
        'Họ tên': 'Nguyễn Văn A',
        'Ngày sinh': '2015-05-15',
        'Giới tính': 'Nam',
        'Lớp': '3B1',
        'Khối': '3',
        'Địa chỉ': '123 Đường Lê Lợi, Khu phố 1, Đặc khu Kiên Hải',
        'SĐT': '0912345678',
        'Email': 'vana@gmail.com',
        'Năng lực': '',
        'Phẩm chất': '',
        'Trạng thái': 'Đang học',
        'Tên cha': 'Nguyễn Văn B',
        'Tên mẹ': 'Nguyễn Thị C',
        'SĐT phụ huynh': '0987654321',
        'Ngày nhập học': '2025-09-01',
        'Ghi chú': ''
    }, {
        'Mã HS': 'HS10002',
        'Họ tên': 'Trần Thị B',
        'Ngày sinh': '2015-08-20',
        'Giới tính': 'Nữ',
        'Lớp': '4B2',
        'Khối': '4',
        'Địa chỉ': '456 Đường Nguyễn Huệ, Khu phố 2, Đặc khu Kiên Hải',
        'SĐT': '0987654321',
        'Email': 'thib@gmail.com',
        'Năng lực': '',
        'Phẩm chất': '',
        'Trạng thái': 'Đang học',
        'Tên cha': 'Trần Văn D',
        'Tên mẹ': 'Trần Thị E',
        'SĐT phụ huynh': '0912345678',
        'Ngày nhập học': '2025-09-01',
        'Ghi chú': ''
    }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(wb, ws, 'Mau');
    XLSX.writeFile(wb, 'Mau_import_hoc_sinh.xlsx');
    showToast('Đã tải file mẫu!');
}

function importExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
            let imported = 0;
            let errors = 0;
            const newStudents = [];

            for (const row of rows) {
                const fullName = row['Họ tên'] || row['Họ và tên'] || '';
                const dobRaw = row['Ngày sinh'] || '';
                const gender = row['Giới tính'] || '';
                const cls = row['Lớp'] || '';
                const grade = String(row['Khối'] || '').trim();
                const address = row['Địa chỉ'] || '';
                const phone = row['SĐT'] || '';
                const email = row['Email'] || '';
                const fatherName = row['Tên cha'] || '';
                const motherName = row['Tên mẹ'] || '';
                const parentPhone = row['SĐT phụ huynh'] || '';
                const status = row['Trạng thái'] || 'Đang học';
                const note = row['Ghi chú'] || '';
                const competence = row['Năng lực'] || '';
                const quality = row['Phẩm chất'] || '';
                const enrollmentRaw = row['Ngày nhập học'] || '';

                if (!fullName || !gender || !cls) {
                    errors++;
                    continue;
                }

                let dob = '';
                if (dobRaw) {
                    if (typeof dobRaw === 'number') {
                        const date = new Date((dobRaw - 25569) * 86400 * 1000);
                        if (!isNaN(date.getTime())) {
                            dob = date.toISOString().split('T')[0];
                        }
                    } else if (typeof dobRaw === 'string') {
                        let parts = dobRaw.split(/[\/\-]/);
                        if (parts.length === 3) {
                            let day = parseInt(parts[0]);
                            let month = parseInt(parts[1]);
                            let year = parseInt(parts[2]);
                            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                                if (year < 100) year += 2000;
                                const date = new Date(year, month-1, day);
                                if (!isNaN(date.getTime())) {
                                    dob = date.toISOString().split('T')[0];
                                }
                            }
                        }
                        if (!dob) {
                            const date = new Date(dobRaw);
                            if (!isNaN(date.getTime())) {
                                dob = date.toISOString().split('T')[0];
                            }
                        }
                    }
                }

                let enrollmentDate = '';
                if (enrollmentRaw) {
                    if (typeof enrollmentRaw === 'number') {
                        const date = new Date((enrollmentRaw - 25569) * 86400 * 1000);
                        if (!isNaN(date.getTime())) {
                            enrollmentDate = date.toISOString().split('T')[0];
                        }
                    } else {
                        const date = new Date(enrollmentRaw);
                        if (!isNaN(date.getTime())) {
                            enrollmentDate = date.toISOString().split('T')[0];
                        }
                    }
                }

                const maxCode = APP_STATE.students.reduce((max, s) => {
                    const num = parseInt(s.id.replace('HS', ''));
                    return num > max ? num : max;
                }, 10000);
                const studentCode = `HS${String(maxCode + newStudents.length + 1).padStart(5, '0')}`;

                const classObj = APP_STATE.classes.find(c => c.name === cls);
                let classId = classObj ? classObj.id : null;
                if (!classObj) {
                    const newClass = {
                        name: cls,
                        grade: grade || cls.charAt(0),
                        teacher: 'Võ Thanh Đậm',
                        class_code: 'L' + cls
                    };
                    const { data: insertedClass, error: classErr } = await supabase
                        .from('app3_classes')
                        .insert([newClass])
                        .select()
                        .single();
                    if (!classErr && insertedClass) {
                        APP_STATE.classes.push(insertedClass);
                        APP_STATE.classMap[insertedClass.name] = insertedClass.id;
                        classId = insertedClass.id;
                    }
                }

                newStudents.push({
                    student_code: studentCode,
                    full_name: fullName.trim(),
                    dob: dob,
                    gender: gender.trim(),
                    class_id: classId,
                    grade: grade || cls.trim().charAt(0),
                    address: address.trim(),
                    phone: phone.trim(),
                    email: email.trim(),
                    father_name: fatherName.trim(),
                    mother_name: motherName.trim(),
                    parent_phone: parentPhone.trim(),
                    status: status.trim(),
                    note: note.trim(),
                    competence: competence.trim(),
                    quality: quality.trim(),
                    enrollment_date: enrollmentDate || new Date().toISOString().split('T')[0],
                    avatar_url: DEFAULT_AVATAR,
                    class: cls,
                    fullName: fullName.trim(),
                    id: studentCode
                });
                imported++;
            }

            if (newStudents.length > 0) {
                const { data: inserted, error: insertErr } = await supabase
                    .from('app3_students')
                    .insert(newStudents.map(s => ({
                        student_code: s.student_code,
                        full_name: s.full_name,
                        dob: s.dob,
                        gender: s.gender,
                        class_id: s.class_id,
                        grade: s.grade,
                        address: s.address,
                        phone: s.phone,
                        email: s.email,
                        father_name: s.father_name,
                        mother_name: s.mother_name,
                        parent_phone: s.parent_phone,
                        status: s.status,
                        note: s.note,
                        competence: s.competence,
                        quality: s.quality,
                        enrollment_date: s.enrollment_date,
                        avatar_url: s.avatar_url
                    })))
                    .select();
                if (insertErr) throw insertErr;

                inserted.forEach(st => {
                    const newStudent = {
                        ...st,
                        db_uuid: st.id,
                        id: st.student_code,
                        fullName: st.full_name,
                        dob: st.dob,
                        gender: st.gender,
                        address: st.address,
                        phone: st.phone,
                        email: st.email,
                        fatherName: st.father_name,
                        motherName: st.mother_name,
                        parentPhone: st.parent_phone,
                        competence: st.competence,
                        quality: st.quality,
                        enrollmentDate: st.enrollment_date,
                        status: st.status,
                        note: st.note,
                        avatar: st.avatar_url || DEFAULT_AVATAR,
                        grade: st.grade,
                        class: APP_STATE.classes.find(c => c.id === st.class_id)?.name || '',
                        class_id: st.class_id
                    };
                    APP_STATE.students.push(newStudent);
                    APP_STATE.scores[newStudent.id] = {};
                    SUBJECTS.forEach(sub => {
                        APP_STATE.scores[newStudent.id][sub] = { giuaKy1: '', cuoiKy1: null, giuaKy2: '', cuoiKy2: null };
                    });
                });
                updateClassCounts();
                showToast(`Import thành công ${imported} học sinh. ${errors > 0 ? 'Có ' + errors + ' dòng bị lỗi (thiếu thông tin).' : ''}`);
            } else {
                showToast('Không có dữ liệu hợp lệ để import.', 'error');
            }
            renderPage('students');
            document.getElementById('importFileInput').value = '';
        } catch (err) {
            showToast('Lỗi đọc file: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

// ============================================================
// 9. QUẢN LÝ LỚP (CRUD với Supabase)
// ============================================================
function renderClasses() {
    updateClassCounts(); // <--- CHỈ CẦN THÊM DÒNG NÀY VÀO ĐẦU HÀM
    const classOptions = APP_STATE.classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    return `
        <div class="card">
            <div class="flex-between mb-2">
                <h3 class="card-title"><i class="fas fa-chalkboard-teacher"></i> Danh sách lớp</h3>
                <div class="flex gap-2">
                    <button class="btn btn-primary btn-sm" onclick="openAddClass()"><i class="fas fa-plus"></i> Thêm lớp</button>
                    <div class="flex gap-1" style="align-items:center;">
                        <select id="exportClassSelect" style="padding:0.3rem 0.6rem;border:1px solid var(--border);border-radius:4px;">
                            <option value="">Chọn lớp</option>
                            ${classOptions}
                        </select>
                        <button class="btn btn-success btn-sm" onclick="exportClassList()"><i class="fas fa-file-excel"></i> Xuất danh sách</button>
                    </div>
                </div>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead><tr><th>STT</th><th>Tên lớp</th><th>Khối</th><th>GVCN</th><th>Sĩ số</th><th>Nam</th><th>Nữ</th><th>Thao tác</th></tr></thead>
                    <tbody id="classTableBody"></tbody>
                </table>
            </div>
        </div>
    `;
}

function initClassTable() {
    const tbody = document.getElementById('classTableBody');
    if (!tbody) return;
    const list = APP_STATE.classes;
    tbody.innerHTML = list.map((c, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td><strong>${c.name}</strong></td>
            <td>${c.grade}</td>
            <td>${c.teacher || 'Võ Thanh Đậm'}</td>
            <td>${c.count || 0}</td>
            <td>${c.male || 0}</td>
            <td>${c.female || 0}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon" onclick="editClass('${c.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" onclick="deleteClass('${c.id}')" style="color:#dc2626;"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openAddClass() {
    showModal('Thêm lớp', `
        <div class="form-grid">
            <div class="form-group"><label>Tên lớp *</label><input type="text" id="cfName" placeholder="5B1"></div>
            <div class="form-group"><label>Khối *</label><select id="cfGrade"><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></div>
            <div class="form-group"><label>Giáo viên chủ nhiệm</label><input type="text" id="cfTeacher" placeholder="Võ Thanh Đậm" value="Võ Thanh Đậm"></div>
        </div>
    `, 'Thêm', 'Hủy').then(async confirmed => {
        if (confirmed) {
            const name = document.getElementById('cfName').value.trim();
            const grade = document.getElementById('cfGrade').value;
            const teacher = document.getElementById('cfTeacher').value.trim() || 'Võ Thanh Đậm';
            if (!name) { showToast('Vui lòng nhập tên lớp!', 'error'); return; }
            if (APP_STATE.classes.some(c => c.name === name)) {
                showToast('Lớp đã tồn tại!', 'error'); return;
            }
            try {
                const { data: newClass, error } = await supabase
                    .from('app3_classes')
                    .insert([{
                        class_code: 'L' + name,
                        name: name,
                        grade: grade,
                        teacher: teacher
                    }])
                    .select()
                    .single();
                if (error) throw error;
                APP_STATE.classes.push(newClass);
                APP_STATE.classMap[newClass.name] = newClass.id;
                updateClassCounts();
                showToast('Thêm lớp thành công!');
                renderPage('classes');
            } catch (err) {
                showToast('Lỗi thêm lớp: ' + err.message, 'error');
            }
        }
    });
}

function editClass(id) {
    const c = APP_STATE.classes.find(cls => cls.id === id);
    if (!c) return;
    showModal('Sửa lớp', `
        <div class="form-grid">
            <div class="form-group"><label>Tên lớp *</label><input type="text" id="cfName" value="${c.name}"></div>
            <div class="form-group"><label>Khối *</label><select id="cfGrade"><option value="3" ${c.grade === '3' ? 'selected' : ''}>3</option><option value="4" ${c.grade === '4' ? 'selected' : ''}>4</option><option value="5" ${c.grade === '5' ? 'selected' : ''}>5</option></select></div>
            <div class="form-group"><label>Giáo viên chủ nhiệm</label><input type="text" id="cfTeacher" value="${c.teacher || 'Võ Thanh Đậm'}"></div>
        </div>
    `, 'Cập nhật', 'Hủy').then(async confirmed => {
        if (confirmed) {
            const name = document.getElementById('cfName').value.trim();
            if (!name) { showToast('Vui lòng nhập tên lớp!', 'error'); return; }
            try {
                const { error } = await supabase
                    .from('app3_classes')
                    .update({
                        name: name,
                        grade: document.getElementById('cfGrade').value,
                        teacher: document.getElementById('cfTeacher').value.trim() || 'Võ Thanh Đậm'
                    })
                    .eq('id', id);
                if (error) throw error;
                const oldName = c.name;
                c.name = name;
                c.grade = document.getElementById('cfGrade').value;
                c.teacher = document.getElementById('cfTeacher').value.trim() || 'Võ Thanh Đậm';
                delete APP_STATE.classMap[oldName];
                APP_STATE.classMap[name] = id;
                APP_STATE.students.forEach(s => {
                    if (s.class === oldName) s.class = name;
                });
                updateClassCounts();
                showToast('Cập nhật thành công!');
                renderPage('classes');
            } catch (err) {
                showToast('Lỗi cập nhật: ' + err.message, 'error');
            }
        }
    });
}

async function deleteClass(id) {
    const c = APP_STATE.classes.find(cls => cls.id === id);
    if (!c) return;
    const confirmed = await showModal('Xóa lớp', `Bạn có chắc muốn xóa lớp <strong>${c.name}</strong>?`, 'Xóa', 'Hủy');
    if (confirmed) {
        try {
            const { error } = await supabase
                .from('app3_classes')
                .delete()
                .eq('id', id);
            if (error) throw error;
            APP_STATE.classes = APP_STATE.classes.filter(cls => cls.id !== id);
            delete APP_STATE.classMap[c.name];
            updateClassCounts();
            showToast('Đã xóa lớp!', 'warning');
            renderPage('classes');
        } catch (err) {
            showToast('Lỗi xóa lớp: ' + err.message, 'error');
        }
    }
}

// ============================================================
// 10. QUẢN LÝ ĐIỂM (CÓ CỘT NĂNG LỰC & PHẨM CHẤT)
// ============================================================
function renderScores() {
    const classOptions = APP_STATE.classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    const subjectOptions = SUBJECTS.map(sub => `<option value="${sub}" ${sub === APP_STATE.currentSubject ? 'selected' : ''}>${sub}</option>`).join('');

    return `
        <div class="card">
            <div class="flex-between mb-2">
                <h3 class="card-title"><i class="fas fa-pencil-alt"></i> Quản lý điểm</h3>
                <div class="flex gap-2" style="flex-wrap:wrap;">
                    <div class="form-group" style="margin:0; min-width:130px;">
                        <label style="font-size:0.75rem;">Chọn môn</label>
                        <select id="scoreSubject" onchange="switchSubject(this.value)" style="padding:0.3rem 0.6rem;">
                            ${subjectOptions}
                        </select>
                    </div>
                    <select id="exportScoreClass" style="padding:0.3rem 0.6rem;border:1px solid var(--border);border-radius:4px;">
                        <option value="">Chọn lớp</option>
                        ${classOptions}
                    </select>
                    <button class="btn btn-success btn-sm" onclick="exportScoreClass()"><i class="fas fa-file-excel"></i> Xuất điểm</button>
                </div>
            </div>
            <p class="text-muted mb-2">Nhập điểm cho môn <strong>${APP_STATE.currentSubject}</strong> theo Thông tư 27.</p>
            <div class="search-bar">
                <input type="text" id="scoreSearch" placeholder="Tìm học sinh..." oninput="initScoreTable()">
                <select id="scoreClass" onchange="initScoreTable()"><option value="">Tất cả lớp</option>${classOptions}</select>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead><tr>
                        <th>STT</th><th>Mã HS</th><th>Họ tên</th><th>Lớp</th>
                        <th>Giữa kỳ 1</th><th>Cuối kỳ 1</th>
                        <th>Giữa kỳ 2</th><th>Cuối kỳ 2</th>
                        <th>Năng lực</th>
                        <th>Phẩm chất</th>
                        <th>Thao tác</th>
                    </tr></thead>
                    <tbody id="scoreTableBody"></tbody>
                </table>
            </div>
        </div>
    `;
}

function switchSubject(subject) {
    APP_STATE.currentSubject = subject;
    renderPage('scores');
}

function initScoreTable() {
    const tbody = document.getElementById('scoreTableBody');
    if (!tbody) return;
    let list = APP_STATE.students;
    const kw = document.getElementById('scoreSearch')?.value?.toLowerCase() || '';
    if (kw) list = list.filter(s => s.fullName.toLowerCase().includes(kw) || s.id.toLowerCase().includes(kw));
    const cls = document.getElementById('scoreClass')?.value || '';
    if (cls) list = list.filter(s => s.class === cls);
    const subject = APP_STATE.currentSubject;
    const gkOptions = ['', 'Hoàn thành tốt', 'Hoàn thành', 'Chưa hoàn thành'];
    const compOptions = ['', 'Tốt', 'Đạt', 'Cần cố gắng'];

    tbody.innerHTML = list.map((s, idx) => {
        const studentScores = APP_STATE.scores[s.id] || {};
        const sc = studentScores[subject] || { giuaKy1: '', cuoiKy1: null, giuaKy2: '', cuoiKy2: null };
        const comp = sc.competence || '';
        const qual = sc.quality || '';
        const gk1Opts = gkOptions.map(opt => `<option value="${opt}" ${opt === sc.giuaKy1 ? 'selected' : ''}>${opt || ''}</option>`).join('');
        const gk2Opts = gkOptions.map(opt => `<option value="${opt}" ${opt === sc.giuaKy2 ? 'selected' : ''}>${opt || ''}</option>`).join('');
        const ck1Val = (sc.cuoiKy1 !== null && sc.cuoiKy1 !== undefined) ? sc.cuoiKy1 : '';
        const ck2Val = (sc.cuoiKy2 !== null && sc.cuoiKy2 !== undefined) ? sc.cuoiKy2 : '';
        const compOpts = compOptions.map(opt => `<option value="${opt}" ${opt === comp ? 'selected' : ''}>${opt || ''}</option>`).join('');
        const qualOpts = compOptions.map(opt => `<option value="${opt}" ${opt === qual ? 'selected' : ''}>${opt || ''}</option>`).join('');
        return `<tr>
            <td>${idx + 1}</td>
            <td>${s.id}</td>
            <td>${s.fullName}</td>
            <td>${s.class}</td>
            <td>
                <select style="width:140px;" onchange="updateScore('${s.id}','giuaKy1',this.value)">
                    ${gk1Opts}
                </select>
            </td>
            <td>
                <input type="number" min="0" max="10" step="0.5" value="${ck1Val}" style="width:70px;" onchange="updateScore('${s.id}','cuoiKy1',this.value)">
            </td>
            <td>
                <select style="width:140px;" onchange="updateScore('${s.id}','giuaKy2',this.value)">
                    ${gk2Opts}
                </select>
            </td>
            <td>
                <input type="number" min="0" max="10" step="0.5" value="${ck2Val}" style="width:70px;" onchange="updateScore('${s.id}','cuoiKy2',this.value)">
            </td>
            <td>
                <select style="width:120px;" onchange="updateScore('${s.id}','competence',this.value)">
                    ${compOpts}
                </select>
            </td>
            <td>
                <select style="width:120px;" onchange="updateScore('${s.id}','quality',this.value)">
                    ${qualOpts}
                </select>
            </td>
            <td><button class="btn btn-primary btn-sm" onclick="saveScore('${s.id}')"><i class="fas fa-save"></i></button></td>
        </tr>`;
    }).join('');
}

// Đã sửa logic lấy UUID chính xác
async function updateScore(studentId, field, value) {
    const subject = APP_STATE.currentSubject;
    if (!APP_STATE.scores[studentId]) {
        APP_STATE.scores[studentId] = {};
    }
    if (!APP_STATE.scores[studentId][subject]) {
        APP_STATE.scores[studentId][subject] = { giuaKy1: '', cuoiKy1: null, giuaKy2: '', cuoiKy2: null };
    }
    const sc = APP_STATE.scores[studentId][subject];
    let updateData = {};

    if (field === 'giuaKy1' || field === 'giuaKy2') {
        sc[field] = value;
        updateData = { [field === 'giuaKy1' ? 'giua_ky_1' : 'giua_ky_2']: value };
    } else if (field === 'cuoiKy1' || field === 'cuoiKy2') {
        const num = parseFloat(value);
        sc[field] = isNaN(num) ? null : num;
        updateData = { [field === 'cuoiKy1' ? 'cuoi_ky_1' : 'cuoi_ky_2']: isNaN(num) ? null : num };
        } else if (field === 'competence' || field === 'quality') {
        // 1. Cập nhật dữ liệu trong APP_STATE để giao diện hiển thị ngay lập tức
        if (!APP_STATE.scores[studentId]) APP_STATE.scores[studentId] = {};
        if (!APP_STATE.scores[studentId][subject]) APP_STATE.scores[studentId][subject] = { giuaKy1: '', cuoiKy1: null, giuaKy2: '', cuoiKy2: null };
        APP_STATE.scores[studentId][subject][field] = value;

        // 2. Lấy UUID của học sinh để lưu xuống bảng app3_scores
        const student = APP_STATE.students.find(s => s.id === studentId);
        if (!student) return;

        // 3. Ghi dữ liệu xuống đúng bảng app3_scores (có thêm cột competence và quality)
        const { error } = await supabase
            .from('app3_scores')
            .upsert({
                student_id: student.db_uuid,
                subject: subject,
                [field]: value
            }, { onConflict: 'student_id,subject' });
            
        if (error) {
            console.error('Lỗi cập nhật năng lực/phẩm chất:', error);
            showToast('Lỗi khi lưu: ' + error.message, 'error');
        }
        return; // Kết thúc hàm ở đây
    }
    // Lấy UUID của học sinh để lưu vào bảng điểm (app3_scores yêu cầu UUID)
    const student = APP_STATE.students.find(s => s.id === studentId);
    if (!student) return;

    if (updateData && Object.keys(updateData).length) {
        const { error } = await supabase
            .from('app3_scores') // Đã sửa đúng tên bảng điểm
            .upsert({
                student_id: student.db_uuid, // Gửi UUID (dạng dài) đúng yêu cầu của Supabase
                subject: subject,
                ...updateData
            }, { onConflict: 'student_id,subject' });
        if (error) {
            showToast('Lỗi cập nhật điểm: ' + error.message, 'error');
        }
    }
}

function saveScore(studentId) {
    showToast('Đã lưu điểm!');
    initScoreTable();
}

// ============================================================
// 11. ĐIỂM DANH (CRUD với Supabase)
// ============================================================
function renderAttendance() {
    const today = new Date().toISOString().split('T')[0];
    const classOptions = APP_STATE.classes.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    return `
        <div class="card">
            <div class="flex-between mb-2">
                <h3 class="card-title"><i class="fas fa-clipboard-check"></i> Điểm danh</h3>
                <button class="btn btn-success btn-sm" onclick="exportAttendanceExcel()"><i class="fas fa-file-excel"></i> Xuất Excel</button>
            </div>
            <div class="flex gap-2 mb-2" style="flex-wrap:wrap;">
                <div class="form-group" style="flex:1; min-width:150px;">
                    <label>Chọn lớp</label>
                    <select id="attendanceClass" onchange="loadAttendance()">${classOptions}</select>
                </div>
                <div class="form-group" style="flex:1; min-width:150px;">
                    <label>Ngày</label>
                    <input type="date" id="attendanceDate" value="${today}" onchange="loadAttendance()">
                </div>
                <div class="form-group" style="align-self:flex-end;">
                    <button class="btn btn-primary" onclick="saveAttendance()"><i class="fas fa-save"></i> Lưu điểm danh</button>
                </div>
            </div>
            <div id="attendanceTableWrapper">
                <p class="text-muted">Chọn lớp và ngày để xem danh sách điểm danh.</p>
            </div>
        </div>
    `;
}

async function loadAttendance() {
    const clsName = document.getElementById('attendanceClass').value;
    const date = document.getElementById('attendanceDate').value;
    const wrapper = document.getElementById('attendanceTableWrapper');
    if (!clsName || !date) {
        wrapper.innerHTML = '<p class="text-muted">Vui lòng chọn lớp và ngày.</p>';
        return;
    }

    const classObj = APP_STATE.classes.find(c => c.name === clsName);
    if (!classObj) {
        wrapper.innerHTML = '<p class="text-muted">Lớp không tồn tại.</p>';
        return;
    }

    const students = APP_STATE.students.filter(s => s.class === clsName);
    if (students.length === 0) {
        wrapper.innerHTML = '<p class="text-muted">Lớp này chưa có học sinh.</p>';
        return;
    }

    const { data: records, error } = await supabase
        .from('app3_attendance')
        .select('*')
        .eq('class_id', classObj.id)
        .eq('attendance_date', date);

    if (error) {
        showToast('Lỗi tải điểm danh: ' + error.message, 'error');
        return;
    }

    const statusOptions = ['Có mặt', 'Vắng', 'Phép', 'Không phép', 'Muộn'];
    let html = `
        <div class="table-wrapper">
            <table>
                <thead><tr><th>STT</th><th>Mã HS</th><th>Họ tên</th><th>Trạng thái</th></tr></thead>
                <tbody>
    `;
    students.forEach((s, idx) => {
        // Tìm UUID của sinh viên trong records
        const record = records.find(r => r.student_id === s.db_uuid);
        const status = record ? record.status : 'Có mặt';
        const options = statusOptions.map(opt => `<option value="${opt}" ${opt === status ? 'selected' : ''}>${opt}</option>`).join('');
        html += `
            <tr>
                <td>${idx + 1}</td>
                <td>${s.id}</td>
                <td>${s.fullName}</td>
                <td>
                    <select class="attendance-status" data-student="${s.db_uuid}" onchange="updateAttendanceStatus('${date}','${classObj.id}','${s.db_uuid}',this.value)">
                        ${options}
                    </select>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table></div>`;
    wrapper.innerHTML = html;
}

async function updateAttendanceStatus(date, classId, studentUuid, status) {
    try {
        const { error } = await supabase
            .from('app3_attendance')
            .upsert({
                student_id: studentUuid,
                class_id: classId,
                attendance_date: date,
                status: status
            }, { onConflict: 'student_id,attendance_date' });
        if (error) throw error;
        showToast('Cập nhật trạng thái thành công!', 'success', 1500);
    } catch (err) {
        showToast('Lỗi cập nhật: ' + err.message, 'error');
    }
}

async function saveAttendance() {
    showToast('Đã lưu điểm danh!');
    loadAttendance();
}

function exportAttendanceExcel() {
    const cls = document.getElementById('attendanceClass')?.value;
    const date = document.getElementById('attendanceDate')?.value;
    if (!cls || !date) {
        showToast('Vui lòng chọn lớp và ngày trước khi xuất.', 'warning');
        return;
    }

    const records = APP_STATE.attendance.find(a => a.class === cls && a.date === date);
    if (!records || records.records.length === 0) {
        showToast('Không có dữ liệu điểm danh cho ngày và lớp này.', 'warning');
        return;
    }

    const data = records.records.map(r => {
        const student = APP_STATE.students.find(s => s.id === r.studentId);
        return {
            'Mã HS': r.studentId,
            'Họ tên': student ? student.fullName : 'Không xác định',
            'Lớp': cls,
            'Ngày': date,
            'Trạng thái': r.status
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'DiemDanh');
    XLSX.writeFile(wb, `DiemDanh_${cls}_${date}.xlsx`);
    showToast('Xuất Excel điểm danh thành công!');
}

// ============================================================
// 12. QUẢN LÝ KHEN THƯỞNG (CRUD)
// ============================================================
function renderRewards() {
    const rewards = APP_STATE.rewards;
    const studentMap = Object.fromEntries(APP_STATE.students.map(s => [s.id, s.fullName]));
    return `
        <div class="card">
            <div class="flex-between mb-2">
                <h3 class="card-title"><i class="fas fa-medal"></i> Khen thưởng</h3>
                <div class="flex gap-2">
                    <button class="btn btn-primary btn-sm" onclick="openAddReward()"><i class="fas fa-plus"></i> Thêm</button>
                    <button class="btn btn-success btn-sm" onclick="exportRewards()"><i class="fas fa-file-excel"></i> Xuất Excel</button>
                </div>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead><tr><th>STT</th><th>Học sinh</th><th>Ngày</th><th>Nội dung</th><th>Người quyết định</th><th>Thao tác</th></tr></thead>
                    <tbody>
                        ${rewards.length === 0 ? '<tr><td colspan="6" class="text-center text-muted">Chưa có khen thưởng nào.</td></tr>' :
                        rewards.map((r, i) => `
                            <tr>
                                <td>${i+1}</td>
                                <td>${studentMap[r.studentId] || 'Không xác định'}</td>
                                <td>${formatDate(r.date)}</td>
                                <td>${r.content}</td>
                                <td>${r.decisionBy}</td>
                                <td>
                                    <button class="btn-icon" onclick="deleteReward('${r.id}')" style="color:#dc2626;"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function openAddReward() {
    const studentOptions = APP_STATE.students.map(s => `<option value="${s.id}">${s.fullName}</option>`).join('');
    showModal('Thêm khen thưởng', `
        <div class="form-group"><label>Chọn học sinh *</label><select id="rewardStudent">${studentOptions}</select></div>
        <div class="form-group"><label>Ngày</label><input type="date" id="rewardDate" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label>Nội dung khen thưởng *</label><textarea id="rewardContent" placeholder="VD: Đạt giải nhất văn nghệ..."></textarea></div>
        <div class="form-group"><label>Người quyết định</label><input type="text" id="rewardDecision" value="Võ Thanh Đậm"></div>
    `, 'Thêm', 'Hủy').then(async confirmed => {
        if (confirmed) {
            const studentId = document.getElementById('rewardStudent').value; // Đây là Mã HS
            const date = document.getElementById('rewardDate').value;
            const content = document.getElementById('rewardContent').value.trim();
            const decision = document.getElementById('rewardDecision').value.trim() || 'Võ Thanh Đậm';
            if (!studentId || !content) {
                showToast('Vui lòng chọn học sinh và nhập nội dung!', 'error');
                return;
            }
            const student = APP_STATE.students.find(s => s.id === studentId);
            if (!student) return;

            try {
                const { data: newReward, error } = await supabase
                    .from('app3_rewards')
                    .insert({
                        student_id: student.db_uuid, // Gửi UUID
                        date: date,
                        content: content,
                        decision_by: decision
                    })
                    .select()
                    .single();
                if (error) throw error;
                APP_STATE.rewards.unshift({
                    id: newReward.id,
                    studentId: student.id, // Lưu Mã HS vào APP_STATE để dễ hiển thị
                    date: newReward.date,
                    content: newReward.content,
                    decisionBy: newReward.decision_by
                });
                showToast('Thêm khen thưởng thành công!');
                renderPage('rewards');
            } catch (err) {
                showToast('Lỗi thêm: ' + err.message, 'error');
            }
        }
    });
}

async function deleteReward(id) {
    const r = APP_STATE.rewards.find(rew => rew.id === id);
    if (!r) return;
    const confirmed = await showModal('Xóa khen thưởng', `Bạn có chắc muốn xóa khen thưởng này?`, 'Xóa', 'Hủy');
    if (confirmed) {
        try {
            const { error } = await supabase
                .from('app3_rewards')
                .delete()
                .eq('id', id);
            if (error) throw error;
            APP_STATE.rewards = APP_STATE.rewards.filter(rew => rew.id !== id);
            showToast('Đã xóa!', 'warning');
            renderPage('rewards');
        } catch (err) {
            showToast('Lỗi xóa: ' + err.message, 'error');
        }
    }
}

// ============================================================
// 13. QUẢN LÝ KỶ LUẬT (CRUD)
// ============================================================
function renderDisciplines() {
    const disciplines = APP_STATE.disciplines;
    const studentMap = Object.fromEntries(APP_STATE.students.map(s => [s.id, s.fullName]));
    return `
        <div class="card">
            <div class="flex-between mb-2">
                <h3 class="card-title"><i class="fas fa-gavel"></i> Kỷ luật</h3>
                <div class="flex gap-2">
                    <button class="btn btn-primary btn-sm" onclick="openAddDiscipline()"><i class="fas fa-plus"></i> Thêm</button>
                    <button class="btn btn-success btn-sm" onclick="exportDisciplines()"><i class="fas fa-file-excel"></i> Xuất Excel</button>
                </div>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead><tr><th>STT</th><th>Học sinh</th><th>Ngày</th><th>Nội dung</th><th>Người quyết định</th><th>Thao tác</th></tr></thead>
                    <tbody>
                        ${disciplines.length === 0 ? '<tr><td colspan="6" class="text-center text-muted">Chưa có kỷ luật nào.</td></tr>' :
                        disciplines.map((d, i) => `
                            <tr>
                                <td>${i+1}</td>
                                <td>${studentMap[d.studentId] || 'Không xác định'}</td>
                                <td>${formatDate(d.date)}</td>
                                <td>${d.content}</td>
                                <td>${d.decisionBy}</td>
                                <td>
                                    <button class="btn-icon" onclick="deleteDiscipline('${d.id}')" style="color:#dc2626;"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function openAddDiscipline() {
    const studentOptions = APP_STATE.students.map(s => `<option value="${s.id}">${s.fullName}</option>`).join('');
    showModal('Thêm kỷ luật', `
        <div class="form-group"><label>Chọn học sinh *</label><select id="disciplineStudent">${studentOptions}</select></div>
        <div class="form-group"><label>Ngày</label><input type="date" id="disciplineDate" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label>Nội dung kỷ luật *</label><textarea id="disciplineContent" placeholder="VD: Đi học muộn..."></textarea></div>
        <div class="form-group"><label>Người quyết định</label><input type="text" id="disciplineDecision" value="Võ Thanh Đậm"></div>
    `, 'Thêm', 'Hủy').then(async confirmed => {
        if (confirmed) {
            const studentId = document.getElementById('disciplineStudent').value;
            const date = document.getElementById('disciplineDate').value;
            const content = document.getElementById('disciplineContent').value.trim();
            const decision = document.getElementById('disciplineDecision').value.trim() || 'Võ Thanh Đậm';
            if (!studentId || !content) {
                showToast('Vui lòng chọn học sinh và nhập nội dung!', 'error');
                return;
            }
            const student = APP_STATE.students.find(s => s.id === studentId);
            if (!student) return;

            try {
                const { data: newDis, error } = await supabase
                    .from('app3_disciplines')
                    .insert({
                        student_id: student.db_uuid, // Gửi UUID
                        date: date,
                        content: content,
                        decision_by: decision
                    })
                    .select()
                    .single();
                if (error) throw error;
                APP_STATE.disciplines.unshift({
                    id: newDis.id,
                    studentId: student.id,
                    date: newDis.date,
                    content: newDis.content,
                    decisionBy: newDis.decision_by
                });
                showToast('Thêm kỷ luật thành công!');
                renderPage('disciplines');
            } catch (err) {
                showToast('Lỗi thêm: ' + err.message, 'error');
            }
        }
    });
}

async function deleteDiscipline(id) {
    const d = APP_STATE.disciplines.find(dis => dis.id === id);
    if (!d) return;
    const confirmed = await showModal('Xóa kỷ luật', `Bạn có chắc muốn xóa kỷ luật này?`, 'Xóa', 'Hủy');
    if (confirmed) {
        try {
            const { error } = await supabase
                .from('app3_disciplines')
                .delete()
                .eq('id', id);
            if (error) throw error;
            APP_STATE.disciplines = APP_STATE.disciplines.filter(dis => dis.id !== id);
            showToast('Đã xóa!', 'warning');
            renderPage('disciplines');
        } catch (err) {
            showToast('Lỗi xóa: ' + err.message, 'error');
        }
    }
}

// ============================================================
// 14. QUẢN LÝ FILE (Upload/Download với Supabase Storage)
// ============================================================
function renderFiles() {
    const files = APP_STATE.files;
    if (!Array.isArray(files)) {
        APP_STATE.files = [];
    }
    return `
        <div class="card">
            <div class="flex-between mb-2">
                <h3 class="card-title"><i class="fas fa-folder-open"></i> Quản lý file</h3>
                <button class="btn btn-primary btn-sm" onclick="openUploadFile()"><i class="fas fa-upload"></i> Tải lên</button>
            </div>
            <div class="table-wrapper">
                <table>
                    <thead><tr>
                        <th>STT</th>
                        <th>Tên file</th>
                        <th>Loại</th>
                        <th>Dung lượng</th>
                        <th>Ngày tải</th>
                        <th>Mô tả</th>
                        <th>Thao tác</th>
                    </tr></thead>
                    <tbody>
                        ${files.length === 0 ? '<tr><td colspan="7" class="text-center text-muted">Chưa có file nào.</td></tr>' :
                        files.map((f, i) => `
                            <tr>
                                <td>${i+1}</td>
                                <td>${f.name}</td>
                                <td>${f.type}</td>
                                <td>${f.size}</td>
                                <td>${formatDate(f.uploadDate)}</td>
                                <td>${f.desc || ''}</td>
                                <td>
                                    <div class="table-actions">
                                        ${f.url ? `<button class="btn-icon" onclick="viewFile('${f.id}')" title="Xem"><i class="fas fa-eye"></i></button>` : `<span class="text-muted" title="File mẫu không có dữ liệu"><i class="fas fa-eye-slash"></i></span>`}
                                        <button class="btn-icon" onclick="downloadFile('${f.id}')" title="Tải xuống"><i class="fas fa-download"></i></button>
                                        <button class="btn-icon" onclick="editFile('${f.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                                        <button class="btn-icon" onclick="deleteFile('${f.id}')" style="color:#dc2626;" title="Xóa"><i class="fas fa-trash"></i></button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="text-muted mt-2" style="font-size:0.8rem;">
                <i class="fas fa-info-circle"></i> Tổng dung lượng đã dùng: ${calculateTotalSize()} / 4MB. 
                <span class="text-muted">(Mỗi file tối đa 2MB)</span>
            </div>
        </div>
    `;
}

function calculateTotalSize() {
    let totalBytes = 0;
    APP_STATE.files.forEach(f => {
        const sizeStr = f.size;
        if (sizeStr) {
            const num = parseFloat(sizeStr);
            if (!isNaN(num)) {
                if (sizeStr.includes('MB')) totalBytes += num * 1024 * 1024;
                else if (sizeStr.includes('KB')) totalBytes += num * 1024;
                else totalBytes += num;
            }
        }
    });
    const mb = (totalBytes / (1024 * 1024)).toFixed(2);
    return mb + ' MB';
}

async function openUploadFile() {
    const totalMB = parseFloat(calculateTotalSize());
    const MAX_TOTAL_MB = 4;
    if (totalMB >= MAX_TOTAL_MB) {
        showToast(`Dung lượng đã đạt giới hạn ${MAX_TOTAL_MB}MB. Vui lòng xóa bớt file cũ.`, 'error');
        return;
    }

    showModal('Tải file lên', `
        <div class="form-group"><label>Chọn file (tối đa 2MB)</label><input type="file" id="fileInput" style="padding:0.5rem;"></div>
        <div class="form-group"><label>Mô tả (không bắt buộc)</label><input type="text" id="fileDesc" placeholder="Ghi chú..."></div>
        <div class="text-muted" style="font-size:0.8rem; margin-top:0.5rem;">
            <i class="fas fa-info-circle"></i> Dung lượng còn trống: ${(MAX_TOTAL_MB - totalMB).toFixed(2)} MB
        </div>
    `, 'Tải lên', 'Hủy').then(async confirmed => {
        if (confirmed) {
            const input = document.getElementById('fileInput');
            if (!input.files || input.files.length === 0) {
                showToast('Vui lòng chọn file!', 'error');
                return;
            }
            const file = input.files[0];
            const MAX_FILE_SIZE = 2 * 1024 * 1024;
            if (file.size > MAX_FILE_SIZE) {
                showToast('File quá lớn! Chỉ hỗ trợ file dưới 2MB.', 'error');
                return;
            }

            try {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}_${file.name}`;
                const filePath = `documents/${fileName}`;

                const { data: uploadData, error: uploadErr } = await supabase.storage
                    .from('app3-files')
                    .upload(filePath, file, { cacheControl: '3600' });
                if (uploadErr) throw uploadErr;

                const { data: urlData } = supabase.storage
                    .from('app3-files')
                    .getPublicUrl(filePath);

                const { data: fileMeta, error: metaErr } = await supabase
                    .from('app3_files')
                    .insert({
                        file_name: file.name,
                        file_path: filePath,
                        file_url: urlData.publicUrl,
                        file_type: file.type.split('/')[0] || 'unknown',
                        file_size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
                        description: document.getElementById('fileDesc').value.trim() || '',
                        uploaded_by: (await supabase.auth.getUser()).data.user?.id || null
                    })
                    .select()
                    .single();
                if (metaErr) throw metaErr;

                APP_STATE.files.unshift({
                    id: fileMeta.id,
                    name: fileMeta.file_name,
                    type: fileMeta.file_type,
                    size: fileMeta.file_size,
                    uploadDate: fileMeta.created_at,
                    desc: fileMeta.description,
                    path: fileMeta.file_path,
                    url: fileMeta.file_url
                });
                showToast('Tải file thành công!');
                renderPage('files');
            } catch (err) {
                showToast('Lỗi tải file: ' + err.message, 'error');
            }
        }
    });
}

function viewFile(id) {
    const file = APP_STATE.files.find(f => f.id === id);
    if (!file) {
        showToast('Không tìm thấy file!', 'error');
        return;
    }
    if (!file.url) {
        showToast('File này không có đường dẫn xem trước.', 'warning');
        return;
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext);
    const isPDF = ext === 'pdf';
    const isText = ['txt', 'csv', 'log', 'md', 'json', 'xml'].includes(ext);

    let contentHTML = '';
    if (isImage) {
        contentHTML = `<img src="${file.url}" style="max-width:100%; max-height:500px; display:block; margin:auto;">`;
    } else if (isPDF) {
        contentHTML = `<iframe src="${file.url}" style="width:100%; height:500px; border:none;"></iframe>`;
    } else if (isText) {
        try {
            fetch(file.url)
                .then(res => res.text())
                .then(text => {
                    document.querySelector('#modalBody pre')?.remove();
                    const pre = document.createElement('pre');
                    pre.style.cssText = 'white-space:pre-wrap; max-height:400px; overflow-y:auto; background:#f5f5f5; padding:1rem; border-radius:4px;';
                    pre.textContent = text;
                    document.getElementById('modalBody').appendChild(pre);
                })
                .catch(() => {
                    showToast('Không thể tải nội dung file.', 'error');
                });
            contentHTML = `<p>Đang tải nội dung...</p>`;
        } catch(e) {
            contentHTML = `<p class="text-muted">Không thể hiển thị nội dung file này.</p>`;
        }
    } else {
        contentHTML = `
            <div class="text-center" style="padding:2rem 0;">
                <i class="fas fa-file" style="font-size:4rem; color:var(--primary);"></i>
                <p style="margin-top:1rem;"><strong>${file.name}</strong></p>
                <p class="text-muted">Không thể xem trước loại file này. Vui lòng tải xuống để mở.</p>
                <button class="btn btn-primary" onclick="downloadFile('${file.id}')"><i class="fas fa-download"></i> Tải xuống</button>
            </div>
        `;
    }
    showModal('Xem trước file', contentHTML, 'Đóng', '');
}

function downloadFile(id) {
    const file = APP_STATE.files.find(f => f.id === id);
    if (!file) return;
    if (!file.url) {
        showToast('File này không có đường dẫn tải.', 'warning');
        return;
    }
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Đang tải file: ${file.name}`, 'info');
}

function editFile(id) {
    const file = APP_STATE.files.find(f => f.id === id);
    if (!file) return;
    showModal('Sửa file', `
        <div class="form-group"><label>Tên file</label><input type="text" id="editFileName" value="${file.name}"></div>
        <div class="form-group"><label>Mô tả</label><input type="text" id="editFileDesc" value="${file.desc || ''}"></div>
    `, 'Cập nhật', 'Hủy').then(async confirmed => {
        if (confirmed) {
            const newName = document.getElementById('editFileName').value.trim();
            const newDesc = document.getElementById('editFileDesc').value.trim();
            if (!newName) {
                showToast('Tên file không được để trống.', 'error');
                return;
            }
            try {
                const { error } = await supabase
                    .from('app3_files')
                    .update({
                        file_name: newName,
                        description: newDesc
                    })
                    .eq('id', id);
                if (error) throw error;
                file.name = newName;
                file.desc = newDesc;
                showToast('Cập nhật file thành công!');
                renderPage('files');
            } catch (err) {
                showToast('Lỗi cập nhật: ' + err.message, 'error');
            }
        }
    });
}

async function deleteFile(id) {
    const file = APP_STATE.files.find(f => f.id === id);
    if (!file) return;
    const confirmed = await showModal('Xóa file', `Bạn có chắc muốn xóa file <strong>${file.name}</strong>?`, 'Xóa', 'Hủy');
    if (confirmed) {
        try {
            if (file.path) {
                const { error: storageErr } = await supabase.storage
                    .from('app3-files')
                    .remove([file.path]);
                if (storageErr) console.warn('Không thể xóa file trong storage:', storageErr);
            }
            const { error } = await supabase
                .from('app3_files')
                .delete()
                .eq('id', id);
            if (error) throw error;

            APP_STATE.files = APP_STATE.files.filter(f => f.id !== id);
            showToast('Đã xóa file!', 'warning');
            renderPage('files');
        } catch (err) {
            showToast('Lỗi xóa file: ' + err.message, 'error');
        }
    }
}

// ============================================================
// 15. THỐNG KÊ (dùng dữ liệu từ APP_STATE)
// ============================================================
function renderStatistics() {
    return `
        <div class="card">
            <h3 class="card-title"><i class="fas fa-chart-bar"></i> Thống kê chi tiết</h3>
            <div class="chart-grid">
                <div class="chart-box"><canvas id="statGradeChart"></canvas></div>
                <div class="chart-box"><canvas id="statGenderChart"></canvas></div>
                <div class="chart-box"><canvas id="statCompetenceChart"></canvas></div>
            </div>
            <div class="stats-grid mt-2">
                <div class="stat-card"><div class="stat-label">Tổng học sinh</div><div class="stat-value">${APP_STATE.students.length}</div></div>
                <div class="stat-card"><div class="stat-label">Số lớp</div><div class="stat-value">${APP_STATE.classes.length}</div></div>
                <div class="stat-card"><div class="stat-label">Khen thưởng</div><div class="stat-value">${APP_STATE.rewards.length}</div></div>
                <div class="stat-card"><div class="stat-label">Kỷ luật</div><div class="stat-value">${APP_STATE.disciplines.length}</div></div>
            </div>
        </div>
    `;
}

function initStatCharts() {
    const grades = ['3', '4', '5'];
    const counts = grades.map(g => APP_STATE.students.filter(s => s.grade === g).length);
    if (chartInstances.statGrade) chartInstances.statGrade.destroy();
    chartInstances.statGrade = new Chart(document.getElementById('statGradeChart'), {
        type: 'bar',
        data: {
            labels: ['Khối 3', 'Khối 4', 'Khối 5'],
            datasets: [{ label: 'Số học sinh', data: counts, backgroundColor: ['#60a5fa', '#34d399', '#fbbf24'], borderRadius: 6 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    const male = APP_STATE.students.filter(s => s.gender === 'Nam').length;
    const female = APP_STATE.students.length - male;
    if (chartInstances.statGender) chartInstances.statGender.destroy();
    chartInstances.statGender = new Chart(document.getElementById('statGenderChart'), {
        type: 'doughnut',
        data: {
            labels: ['Nam', 'Nữ'],
            datasets: [{ data: [male, female], backgroundColor: ['#2563eb', '#ec4899'], borderWidth: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    const compMap = {};
    APP_STATE.students.forEach(s => {
        const val = s.competence || 'Chưa xếp';
        compMap[val] = (compMap[val] || 0) + 1;
    });
    const compLabels = Object.keys(compMap);
    const compValues = Object.values(compMap);
    const colors = ['#16a34a', '#2563eb', '#f59e0b', '#dc2626', '#94a3b8'];
    if (chartInstances.statCompetence) chartInstances.statCompetence.destroy();
    chartInstances.statCompetence = new Chart(document.getElementById('statCompetenceChart'), {
        type: 'pie',
        data: {
            labels: compLabels,
            datasets: [{
                data: compValues,
                backgroundColor: colors.slice(0, compLabels.length),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

// ============================================================
// 16. TÌM KIẾM, CÀI ĐẶT, IN ẤN (giữ nguyên)
// ============================================================
function renderSearch() {
    return `
        <div class="card">
            <h3 class="card-title"><i class="fas fa-search"></i> Tìm kiếm nâng cao</h3>
            <div class="search-bar">
                <input type="text" id="globalSearch" placeholder="Nhập từ khóa..." oninput="globalSearch()">
                <select id="searchField" onchange="globalSearch()"><option value="all">Tất cả</option><option value="id">Mã HS</option><option value="fullName">Họ tên</option><option value="class">Lớp</option><option value="grade">Khối</option><option value="competence">Năng lực</option><option value="quality">Phẩm chất</option></select>
                <button class="btn btn-primary btn-sm" onclick="globalSearch()"><i class="fas fa-search"></i> Tìm</button>
            </div>
            <div id="searchResults"></div>
        </div>
    `;
}

function globalSearch() {
    const kw = document.getElementById('globalSearch')?.value?.toLowerCase() || '';
    const field = document.getElementById('searchField')?.value || 'all';
    const container = document.getElementById('searchResults');
    if (!container) return;
    if (!kw) { container.innerHTML = '<p class="text-muted">Nhập từ khóa để tìm kiếm.</p>'; return; }
    let results = APP_STATE.students.filter(s => {
        if (field === 'all') {
            return s.fullName.toLowerCase().includes(kw) || s.id.toLowerCase().includes(kw) || s.class.toLowerCase().includes(kw) || s.grade.includes(kw) || (s.competence && s.competence.toLowerCase().includes(kw)) || (s.quality && s.quality.toLowerCase().includes(kw));
        }
        return String(s[field] || '').toLowerCase().includes(kw);
    });
    if (results.length === 0) {
        container.innerHTML = '<p class="text-muted">Không tìm thấy kết quả.</p>';
        return;
    }
    container.innerHTML = `
        <div class="table-wrapper">
            <table>
                <thead><tr><th>STT</th><th>Mã HS</th><th>Họ tên</th><th>Lớp</th><th>Năng lực</th><th>Phẩm chất</th><th>Trạng thái</th></tr></thead>
                <tbody>${results.map((s, i) => `
                    <tr>
                        <td>${i + 1}</td>
                        <td>${s.id}</td>
                        <td>${s.fullName}</td>
                        <td>${s.class}</td>
                        <td>${displayText(s.competence)}</td>
                        <td>${displayText(s.quality)}</td>
                        <td>${getStatusBadge(s.status)}</td>
                    </tr>
                `).join('')}</tbody>
            </table>
        </div>
        <p class="text-muted mt-2">Tìm thấy ${results.length} kết quả.</p>
    `;
}

function renderSettings() {
    const settings = APP_STATE.settings;
    return `
        <div class="card">
            <h3 class="card-title"><i class="fas fa-cog"></i> Cài đặt</h3>
            <div class="form-grid">
                <div class="form-group"><label>Tên trường</label><input type="text" id="setSchoolName" value="${settings.schoolName || ''}"></div>
                <div class="form-group"><label>Năm học</label><input type="text" id="setSchoolYear" value="${settings.schoolYear || ''}"></div>
                <div class="form-group"><label>Giáo viên</label><input type="text" id="setTeacherName" value="${settings.teacherName || ''}"></div>
                <div class="form-group"><label>Giao diện</label>
                    <select id="setTheme"><option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Sáng</option><option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Tối</option></select>
                </div>
            </div>
            <button class="btn btn-primary" onclick="saveSettings()"><i class="fas fa-save"></i> Lưu cài đặt</button>
            <hr class="my-3">
            <h4>Đổi mật khẩu</h4>
            <div class="form-grid">
                <div class="form-group"><label>Mật khẩu mới</label><input type="password" id="newPassword" placeholder="••••••••"></div>
                <div class="form-group"><label>Xác nhận</label><input type="password" id="confirmPassword" placeholder="••••••••"></div>
            </div>
            <button class="btn btn-warning" onclick="changePassword()"><i class="fas fa-key"></i> Đổi mật khẩu</button>
            <hr class="my-3">
            <h4>Quản lý dữ liệu</h4>
            <div class="flex gap-2">
                <button class="btn btn-primary" onclick="backupData()"><i class="fas fa-download"></i> Tải backup</button>
                <button class="btn btn-warning" onclick="restoreData()"><i class="fas fa-upload"></i> Phục hồi backup</button>
                <button class="btn btn-info" onclick="migrateLocal()"><i class="fas fa-database"></i> Migrate từ localStorage</button>
            </div>
            <p class="text-muted mt-2" style="font-size:0.8rem;">
                <i class="fas fa-info-circle"></i> Backup lưu toàn bộ dữ liệu (học sinh, điểm, file...). Dùng để chuyển dữ liệu giữa các trình duyệt hoặc máy tính.
            </p>
        </div>
    `;
}

function initSettings() {}
function initSearch() {}

async function saveSettings() {
    const settings = APP_STATE.settings;
    settings.schoolName = document.getElementById('setSchoolName').value.trim();
    settings.schoolYear = document.getElementById('setSchoolYear').value.trim();
    settings.teacherName = document.getElementById('setTeacherName').value.trim();
    settings.theme = document.getElementById('setTheme').value;
    if (settings.theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        APP_STATE.darkMode = true;
    } else {
        document.documentElement.removeAttribute('data-theme');
        APP_STATE.darkMode = false;
    }
    try {
        // Đã sửa 'id: 1' thành 'config_id: 1'
                const { error } = await supabase
            .from('app3_settings')
            .upsert({
                config_id: 1, // Quan trọng
                school_name: settings.schoolName,
                school_year: settings.schoolYear,
                teacher_name: settings.teacherName,
                theme: settings.theme,
                logo_url: settings.logo || ''
            }, { onConflict: 'config_id' }); // Bổ sung dòng này
        if (error) throw error;
        showToast('Đã lưu cài đặt!');
    } catch (err) {
        showToast('Lỗi lưu cài đặt: ' + err.message, 'error');
    }
}

function changePassword() {
    const pwd = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    if (!pwd || pwd.length < 6) { showToast('Mật khẩu phải có ít nhất 6 ký tự.', 'error'); return; }
    if (pwd !== confirm) { showToast('Mật khẩu xác nhận không khớp.', 'error'); return; }
    supabase.auth.updateUser({ password: pwd })
        .then(({ error }) => {
            if (error) throw error;
            showToast('Đổi mật khẩu thành công!');
        })
        .catch(err => showToast('Lỗi đổi mật khẩu: ' + err.message, 'error'));
}

function printStudents() {
    window.print();
}

function printStudent(id) {
    const s = APP_STATE.students.find(st => st.id === id);
    if (!s) return;
    const avatarSrc = (s.avatar && s.avatar.startsWith('data:image')) ? s.avatar : DEFAULT_AVATAR;
    const win = window.open('', '_blank');
    win.document.write(`
        <html>
        <head>
            <title>Hồ sơ học sinh</title>
            <style>
                body {
                    font-family: 'Times New Roman', Times, serif;
                    padding: 2rem;
                    margin: 0;
                    background: #fff;
                    color: #000;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    border: 1px solid #ccc;
                    padding: 2rem;
                    border-radius: 8px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                }
                .header {
                    display: flex;
                    align-items: center;
                    gap: 2rem;
                    border-bottom: 2px solid #2563eb;
                    padding-bottom: 1rem;
                    margin-bottom: 1.5rem;
                }
                .avatar {
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 3px solid #2563eb;
                    flex-shrink: 0;
                }
                .info {
                    flex: 1;
                }
                .info h1 {
                    margin: 0 0 0.25rem 0;
                    font-size: 1.8rem;
                    color: #1e293b;
                }
                .info .sub {
                    font-size: 1rem;
                    color: #475569;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 1rem;
                }
                td {
                    padding: 0.5rem 0.3rem;
                    border-bottom: 1px solid #e2e8f0;
                }
                .label {
                    font-weight: 600;
                    width: 40%;
                    color: #334155;
                }
                .value {
                    width: 60%;
                    color: #0f172a;
                }
                .footer {
                    margin-top: 2rem;
                    text-align: center;
                    font-size: 0.85rem;
                    color: #94a3b8;
                    border-top: 1px solid #e2e8f0;
                    padding-top: 1rem;
                }
                @media print {
                    body { padding: 0.5in; }
                    .container { border: none; box-shadow: none; padding: 0; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <img src="${avatarSrc}" alt="Avatar" class="avatar" onerror="this.style.display='none'">
                    <div class="info">
                        <h1>${s.fullName}</h1>
                        <div class="sub"><strong>Mã HS:</strong> ${s.id} &nbsp;|&nbsp; <strong>Lớp:</strong> ${s.class} &nbsp;|&nbsp; <strong>Khối:</strong> ${s.grade}</div>
                        <div class="sub" style="margin-top:0.25rem;">
                            <span style="display:inline-block;background:#dbeafe;padding:0.1rem 0.6rem;border-radius:12px;font-size:0.8rem;">${s.status}</span>
                        </div>
                    </div>
                </div>

                <table>
                    <tr><td class="label">Ngày sinh</td><td class="value">${formatDate(s.dob)}</td></tr>
                    <tr><td class="label">Giới tính</td><td class="value">${s.gender}</td></tr>
                    <tr><td class="label">Địa chỉ</td><td class="value">${s.address || ''}</td></tr>
                    <tr><td class="label">Số điện thoại</td><td class="value">${s.phone || ''}</td></tr>
                    <tr><td class="label">Email</td><td class="value">${s.email || ''}</td></tr>
                    <tr><td class="label">Năng lực</td><td class="value">${displayText(s.competence)}</td></tr>
                    <tr><td class="label">Phẩm chất</td><td class="value">${displayText(s.quality)}</td></tr>
                    <tr><td class="label">Trạng thái</td><td class="value">${s.status}</td></tr>
                    <tr><td class="label">Ngày nhập học</td><td class="value">${formatDate(s.enrollmentDate)}</td></tr>
                    <tr><td class="label">Tên cha</td><td class="value">${s.fatherName || ''}</td></tr>
                    <tr><td class="label">Tên mẹ</td><td class="value">${s.motherName || ''}</td></tr>
                    <tr><td class="label">SĐT phụ huynh</td><td class="value">${s.parentPhone || ''}</td></tr>
                    <tr><td class="label">Ghi chú</td><td class="value">${s.note || ''}</td></tr>
                </table>

                <div class="footer">
                    &copy; ${new Date().getFullYear()} Trường Tiểu học Trần Quốc Toản - Hệ thống QLHS
                </div>
            </div>
            <script>
                window.onload = function() {
                    window.print();
                };
            <\/script>
        </body>
        </html>
    `);
    win.document.close();
}

// ============================================================
// 17. CÁC HÀM XUẤT EXCEL BỔ SUNG
// ============================================================
function exportClassList() {
    const cls = document.getElementById('exportClassSelect')?.value;
    if (!cls) {
        showToast('Vui lòng chọn lớp để xuất.', 'warning');
        return;
    }
    const students = APP_STATE.students.filter(s => s.class === cls);
    if (students.length === 0) {
        showToast('Lớp này chưa có học sinh.', 'warning');
        return;
    }
    const data = students.map(s => ({
        'Mã HS': s.id,
        'Họ tên': s.fullName,
        'Ngày sinh': s.dob,
        'Giới tính': s.gender,
        'Lớp': s.class,
        'Khối': s.grade,
        'Địa chỉ': s.address,
        'SĐT': s.phone,
        'Email': s.email,
        'Năng lực': s.competence || '',
        'Phẩm chất': s.quality || '',
        'Trạng thái': s.status,
        'Tên cha': s.fatherName || '',
        'Tên mẹ': s.motherName || '',
        'SĐT phụ huynh': s.parentPhone || '',
        'Ngày nhập học': s.enrollmentDate || '',
        'Ghi chú': s.note || ''
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSachLop');
    XLSX.writeFile(wb, `Danh_sach_lop_${cls}_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast(`Xuất danh sách lớp ${cls} thành công!`);
}

function exportScoreClass() {
    const cls = document.getElementById('exportScoreClass')?.value;
    const subject = APP_STATE.currentSubject;
    if (!cls) {
        showToast('Vui lòng chọn lớp để xuất điểm.', 'warning');
        return;
    }
    const students = APP_STATE.students.filter(s => s.class === cls);
    if (students.length === 0) {
        showToast('Lớp này chưa có học sinh.', 'warning');
        return;
    }
    const data = students.map(s => {
        const sc = APP_STATE.scores[s.id]?.[subject] || { giuaKy1: '', cuoiKy1: null, giuaKy2: '', cuoiKy2: null };
        return {
            'Mã HS': s.id,
            'Họ tên': s.fullName,
            'Lớp': s.class,
            'Giữa kỳ 1': sc.giuaKy1,
            'Cuối kỳ 1': sc.cuoiKy1 !== null ? sc.cuoiKy1 : '',
            'Giữa kỳ 2': sc.giuaKy2,
            'Cuối kỳ 2': sc.cuoiKy2 !== null ? sc.cuoiKy2 : '',
            'Năng lực': s.competence || '',
            'Phẩm chất': s.quality || ''
        };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, `Diem_${subject}`);
    XLSX.writeFile(wb, `Diem_${subject}_lop_${cls}_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast(`Xuất điểm môn ${subject} lớp ${cls} thành công!`);
}

function exportRewards() {
    if (APP_STATE.rewards.length === 0) {
        showToast('Chưa có dữ liệu khen thưởng.', 'warning');
        return;
    }
    const studentMap = Object.fromEntries(APP_STATE.students.map(s => [s.id, s.fullName]));
    const data = APP_STATE.rewards.map(r => ({
        'Học sinh': studentMap[r.studentId] || 'Không xác định',
        'Ngày': r.date,
        'Nội dung': r.content,
        'Người quyết định': r.decisionBy
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'KhenThuong');
    XLSX.writeFile(wb, `Khen_thuong_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('Xuất khen thưởng thành công!');
}

function exportDisciplines() {
    if (APP_STATE.disciplines.length === 0) {
        showToast('Chưa có dữ liệu kỷ luật.', 'warning');
        return;
    }
    const studentMap = Object.fromEntries(APP_STATE.students.map(s => [s.id, s.fullName]));
    const data = APP_STATE.disciplines.map(d => ({
        'Học sinh': studentMap[d.studentId] || 'Không xác định',
        'Ngày': d.date,
        'Nội dung': d.content,
        'Người quyết định': d.decisionBy
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'KyLuat');
    XLSX.writeFile(wb, `Ky_luat_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('Xuất kỷ luật thành công!');
}

// ============================================================
// 18. BACKUP & RESTORE TOÀN BỘ DỮ LIỆU
// ============================================================
function backupData() {
    try {
        const data = {
            students: APP_STATE.students,
            classes: APP_STATE.classes,
            scores: APP_STATE.scores,
            attendance: APP_STATE.attendance,
            rewards: APP_STATE.rewards,
            disciplines: APP_STATE.disciplines,
            files: APP_STATE.files,
            settings: APP_STATE.settings,
            backedUpAt: new Date().toISOString(),
            version: '2.0'
        };
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_qlhs_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Tải backup thành công!', 'success');
    } catch (err) {
        showToast('Lỗi khi tạo backup: ' + err.message, 'error');
    }
}

async function restoreData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.click();

    input.addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async function (ev) {
            try {
                const backup = JSON.parse(ev.target.result);
                if (!backup.students || !backup.classes || !backup.scores) {
                    showToast('File backup không hợp lệ!', 'error');
                    return;
                }

                const confirm = await showModal(
                    'Xác nhận phục hồi',
                    `<p>Bạn sẽ thay thế toàn bộ dữ liệu hiện tại bằng dữ liệu từ backup.</p>
                     <p><strong>Ngày backup:</strong> ${backup.backedUpAt ? new Date(backup.backedUpAt).toLocaleString() : 'Không rõ'}</p>
                     <p>Số học sinh: ${backup.students.length}</p>
                     <p style="color:#dc2626;">Hành động này không thể hoàn tác!</p>`,
                    'Phục hồi',
                    'Hủy'
                );
                if (!confirm) return;

                showLoading();

                // --- 1. Phục hồi Lớp (app3_classes) ---
                const classMap = {};
                for (const cls of backup.classes) {
                    const classCode = cls.id || cls.name;
                    const { data, error } = await supabase
                        .from('app3_classes')
                        .upsert({
                            class_code: classCode,
                            name: cls.name,
                            grade: cls.grade,
                            teacher: cls.teacher || 'Võ Thanh Đậm'
                        }, { onConflict: 'class_code' })
                        .select('id, class_code')
                        .single();
                    if (error) throw new Error(`Lỗi upsert class ${cls.name}: ${error.message}`);
                    classMap[classCode] = data.id;
                }

                // --- 2. Phục hồi Học sinh (app3_students) ---
                const studentMap = {};
                for (const s of backup.students) {
                    const classId = classMap[s.class];
                    
                    let avatarUrl = s.avatar || DEFAULT_AVATAR;
                    if (avatarUrl && !avatarUrl.startsWith('data:image')) {
                        avatarUrl = DEFAULT_AVATAR;
                    }
                    const { data, error } = await supabase
                        .from('app3_students')
                        .upsert({
                            student_code: s.id,
                            full_name: s.fullName,
                            dob: s.dob || null,
                            gender: s.gender || null,
                            class_id: classId,
                            class_code: s.class, // Đã thêm cột này để hiện Lớp
                            grade: s.grade || null,
                            address: s.address,
                            phone: s.phone,
                            email: s.email,
                            father_name: s.fatherName,
                            mother_name: s.motherName,
                            parent_phone: s.parentPhone,
                            competence: s.competence || null,
                            quality: s.quality || null,
                            enrollment_date: s.enrollmentDate || null,
                            status: s.status || 'Đang học',
                            note: s.note,
                            avatar_url: avatarUrl
                        }, { onConflict: 'student_code' })
                        .select()
                        .single();
                    if (error) throw new Error(`Lỗi upsert student ${s.id}: ${error.message}`);
                    studentMap[s.id] = data.id;
                }

                // --- 3. Phục hồi Điểm (app3_scores) ---
                for (const [studentCode, subjects] of Object.entries(backup.scores)) {
                    const studentId = studentMap[studentCode];
                    if (!studentId) continue;
                    for (const [subject, sc] of Object.entries(subjects)) {
                        const { error } = await supabase
                            .from('app3_scores')
                            .upsert({
                                student_id: studentId,
                                subject: subject,
                                giua_ky_1: sc.giuaKy1 || '',
                                cuoi_ky_1: sc.cuoiKy1 !== null ? sc.cuoiKy1 : null,
                                giua_ky_2: sc.giuaKy2 || '',
                                cuoi_ky_2: sc.cuoiKy2 !== null ? sc.cuoiKy2 : null
                            }, { onConflict: 'student_id,subject' });
                        if (error) {
                            console.error('Lỗi upsert score:', error);
                            throw new Error(`Lỗi điểm ${studentCode}-${subject}: ${error.message}`);
                        }
                    }
                }

                // --- 4. Phục hồi Điểm danh (app3_attendance) ---
                for (const att of backup.attendance) {
                    const classCode = att.class;
                    const classId = classMap[classCode];
                    if (!classId) continue;
                    for (const rec of att.records) {
                        const studentId = studentMap[rec.studentId];
                        if (!studentId) continue;
                        const { error } = await supabase
                            .from('app3_attendance')
                            .upsert({
                                student_id: studentId,
                                class_id: classId,
                                attendance_date: att.date,
                                status: rec.status || 'Có mặt'
                            }, { onConflict: 'student_id,attendance_date' });
                        if (error) {
                            console.error('Lỗi upsert attendance:', error);
                        }
                    }
                }

                // --- 5. Phục hồi Khen thưởng (app3_rewards) ---
                for (const r of backup.rewards || []) {
                    const studentId = studentMap[r.studentId];
                    if (!studentId) continue;
                    const { error } = await supabase
                        .from('app3_rewards')
                        .insert({
                            student_id: studentId,
                            date: r.date,
                            content: r.content,
                            decision_by: r.decisionBy || 'Võ Thanh Đậm'
                        });
                    if (error) console.error('Lỗi insert reward:', error);
                }

                // --- 6. Phục hồi Kỷ luật (app3_disciplines) ---
                for (const d of backup.disciplines || []) {
                    const studentId = studentMap[d.studentId];
                    if (!studentId) continue;
                    const { error } = await supabase
                        .from('app3_disciplines')
                        .insert({
                            student_id: studentId,
                            date: d.date,
                            content: d.content,
                            decision_by: d.decisionBy || 'Võ Thanh Đậm'
                        });
                    if (error) console.error('Lỗi insert discipline:', error);
                }

                // --- 7. Phục hồi File (app3_files) ---
                for (const f of backup.files || []) {
                    const { error } = await supabase
                        .from('app3_files')
                        .insert({
                            file_name: f.name,
                            file_path: f.path || `legacy/${f.id}`,
                            file_url: f.url || null,
                            file_type: f.type,
                            file_size: f.size,
                            description: f.desc || ''
                        });
                    if (error) console.error('Lỗi insert file:', error);
                }

                // --- 8. Phục hồi Settings (app3_settings) ---
                if (backup.settings) {
                    // Đã sửa 'id: 1' thành 'config_id: 1'
                    const { error } = await supabase
                        .from('app3_settings')
                        .upsert({
                            config_id: 1,
                            school_name: backup.settings.schoolName || 'Trường Tiểu học Trần Quốc Toản',
                            school_year: backup.settings.schoolYear || '2025-2026',
                            teacher_name: backup.settings.teacherName || 'Võ Thanh Đậm',
                            theme: backup.settings.theme || 'light',
                            logo_url: backup.settings.logo || ''
                        });
                    if (error) console.error('Lỗi upsert settings:', error);
                }

                await loadAllData();
                showToast('Phục hồi dữ liệu thành công!', 'success');
                renderPage(APP_STATE.currentPage);

            } catch (err) {
                console.error('Lỗi restore:', err);
                showToast('Lỗi phục hồi: ' + err.message, 'error');
            } finally {
                hideLoading();
                document.body.removeChild(input);
            }
        };
        reader.readAsText(file);
    });
}

// ============================================================
// 19. MIGRATION LOCALSTORAGE → SUPABASE
// ============================================================
async function migrateLocal() {
    const confirmed = await showModal('Migration dữ liệu từ localStorage',
        '<p>Bạn sẽ chuyển toàn bộ dữ liệu từ localStorage lên Supabase.</p>' +
        '<p style="color:#dc2626;">Dữ liệu trên Supabase sẽ được cập nhật, không mất dữ liệu cũ nếu trùng mã.</p>',
        'Tiến hành', 'Hủy');
    if (!confirmed) return;

    showLoading();
    try {
        const result = await migrateLocalStorageToSupabase();
        if (result.success) {
            showToast(`Migration thành công! Số bản ghi đã chuyển: ${JSON.stringify(result.result)}`, 'success');
            await loadAllData();
            renderPage(APP_STATE.currentPage);
        } else {
            showToast('Migration thất bại: ' + result.error, 'error');
        }
    } catch (err) {
        showToast('Lỗi migration: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

// ============================================================
// 20. NAVIGATION & LOGIN (Supabase Auth)
// ============================================================
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const page = this.dataset.page;
            if (!page) return;
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            renderPage(page);
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar').classList.remove('open');
            }
        });
    });

    document.getElementById('toggleSidebar').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });

    document.getElementById('toggleSidebarMobile').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    document.getElementById('darkModeToggle').addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            APP_STATE.settings.theme = 'light';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            APP_STATE.settings.theme = 'dark';
        }
        localStorage.setItem('settings', JSON.stringify(APP_STATE.settings));
        APP_STATE.darkMode = !isDark;
        const icon = document.querySelector('#darkModeToggle i');
        if (icon) {
            icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
        }
        // Đã sửa 'id: 1' thành 'config_id: 1'
         supabase.from('app3_settings').upsert({
            config_id: 1, 
            theme: APP_STATE.settings.theme
        }, { onConflict: 'config_id' }).then(({ error }) => { // Bổ sung dòng onConflict
            if (error) console.warn('Không thể lưu theme:', error);
        });
    });
}

function initLogin() {
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        if (!username || !password) {
            showToast('Vui lòng nhập đầy đủ thông tin.', 'error');
            return;
        }
        showLoading();
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: username,
                password: password
            });
            if (error) throw error;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('app').classList.remove('hidden');
            if (document.getElementById('rememberMe').checked) {
                localStorage.setItem('remembered', 'true');
            }
            showToast('Đăng nhập thành công!');
            await loadAllData();
            renderPage('dashboard');
        } catch (err) {
            showToast('Đăng nhập thất bại: ' + err.message, 'error');
        } finally {
            hideLoading();
        }
    });

    document.getElementById('togglePassword').addEventListener('click', function() {
        const input = document.getElementById('loginPassword');
        const icon = this.querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    });

    document.getElementById('forgotPassword').addEventListener('click', function(e) {
        e.preventDefault();
        const email = prompt('Nhập email để đặt lại mật khẩu:');
        if (email) {
            supabase.auth.resetPasswordForEmail(email)
                .then(({ error }) => {
                    if (error) throw error;
                    showToast('Email đặt lại mật khẩu đã được gửi.', 'info');
                })
                .catch(err => showToast('Lỗi: ' + err.message, 'error'));
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', async function() {
        await supabase.auth.signOut();
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('app').classList.add('hidden');
        showToast('Đã đăng xuất.', 'info');
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('app').classList.remove('hidden');
            loadAllData().then(() => renderPage('dashboard'));
        }
    });
}

// ============================================================
// 21. KHỞI ĐỘNG
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    initLogin();
    initNavigation();

    if (APP_STATE.darkMode) {
        const icon = document.querySelector('#darkModeToggle i');
        if (icon) icon.className = 'fas fa-sun';
    }

    window.openAddStudent = openAddStudent;
    window.editStudent = editStudent;
    window.viewStudent = viewStudent;
    window.deleteStudent = deleteStudent;
    window.deleteSelectedStudents = deleteSelectedStudents;
    window.toggleStudent = toggleStudent;
    window.toggleSelectAll = toggleSelectAll;
    window.filterStudents = filterStudents;
    window.resetFilters = resetFilters;
    window.goStudentPage = goStudentPage;
    window.openAddClass = openAddClass;
    window.editClass = editClass;
    window.deleteClass = deleteClass;
    window.initStudentTable = initStudentTable;
    window.initClassTable = initClassTable;
    window.initScoreTable = initScoreTable;
    window.updateScore = updateScore;
    window.saveScore = saveScore;
    window.switchSubject = switchSubject;
    window.globalSearch = globalSearch;
    window.saveSettings = saveSettings;
    window.changePassword = changePassword;
    window.exportExcel = exportExcel;
    window.downloadSampleExcel = downloadSampleExcel;
    window.importExcel = importExcel;
    window.printStudents = printStudents;
    window.printStudent = printStudent;
    window.loadAttendance = loadAttendance;
    window.saveAttendance = saveAttendance;
    window.updateAttendanceStatus = updateAttendanceStatus;
    window.exportAttendanceExcel = exportAttendanceExcel;
    window.openAddReward = openAddReward;
    window.deleteReward = deleteReward;
    window.openAddDiscipline = openAddDiscipline;
    window.deleteDiscipline = deleteDiscipline;
    window.openUploadFile = openUploadFile;
    window.viewFile = viewFile;
    window.downloadFile = downloadFile;
    window.editFile = editFile;
    window.deleteFile = deleteFile;
    window.exportClassList = exportClassList;
    window.exportScoreClass = exportScoreClass;
    window.exportRewards = exportRewards;
    window.exportDisciplines = exportDisciplines;
    window.previewAvatar = previewAvatar;
    window.clearAvatar = clearAvatar;
    window.downloadAvatar = downloadAvatar;
    window.backupData = backupData;
    window.restoreData = restoreData;
    window.migrateLocal = migrateLocal;
});