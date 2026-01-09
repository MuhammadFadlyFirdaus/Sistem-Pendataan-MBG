// =================================================================
// KONFIGURASI FIREBASE (PASTE KODE DARI FIREBASE CONSOLE DI BAWAH INI)
// =================================================================
const firebaseConfig = {
    apiKey: "AIzaSyAw6FVc5QPyVSDeSjfnArKSqKki3Zo_MfQ",
    authDomain: "tritas-mbg.firebaseapp.com",
    databaseURL: "https://tritas-mbg-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tritas-mbg",
    storageBucket: "tritas-mbg.firebasestorage.app",
    messagingSenderId: "90879537348",
    appId: "1:90879537348:web:8a3e49497eaa6f3ea2d991",
    measurementId: "G-D66MLR0HM6"
};
// =================================================================


// Menunggu Firebase SDK dimuat dari index.html
document.addEventListener('DOMContentLoaded', () => {
    // Cek apakah firebaseModules tersedia (dari script di index.html)
    if (window.firebaseModules) {
        App.init(window.firebaseModules);
    } else {
        console.error("Firebase SDK gagal dimuat. Cek internet.");
        alert("Gagal memuat sistem Database. Pastikan internet aktif.");
    }
});

const App = {
    db: null,

    state: {
        angkatan: null,
        kelas: null,
        isLoggedIn: false,
        today: new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        dateKey: new Date().toISOString().split('T')[0] // YYYY-MM-DD (Reset otomatis tiap hari karena key berubah sesuai tanggal)
    },

    elements: {
        views: {
            login: document.getElementById('login-view'),
            dashboard: document.getElementById('dashboard-view'),
            admin: document.getElementById('admin-view')
        },
        login: {
            form: document.getElementById('login-form'),
            angkatan: document.getElementById('angkatan_select'),
            kelas: document.getElementById('kelas_select'),
            password: document.getElementById('password_input'),
            adminBtn: document.getElementById('admin-link_btn')
        },
        admin: {
            backBtn: document.getElementById('admin-back-btn'),
            refreshBtn: document.getElementById('refresh-admin'),
            tbody: document.getElementById('admin-tbody'),
            totalPorsi: document.getElementById('admin-total-porsi'),
            takenCount: document.getElementById('admin-taken-count'),
            pendingCount: document.getElementById('admin-pending-count'),
            dateDisplay: document.getElementById('admin-date-display')
        },
        dashboard: {
            classTitle: document.getElementById('class-title'),
            currentDate: document.getElementById('current-date'),
            logoutBtn: document.getElementById('logout-btn'),
            stats: {
                total: document.getElementById('disp-total'),
                hadir: document.getElementById('disp-hadir')
            },
            status: document.getElementById('submission-status'),
            form: document.getElementById('data-form'),
            inputs: {
                total: document.getElementById('input_total'),
                hadir: document.getElementById('input_hadir'),
                catatan: document.getElementById('input_catatan')
            },
            calc: {
                absen: document.getElementById('calc-absen'),
                porsi: document.getElementById('calc-porsi')
            }
        }
    },

    init(firebase) {
        // Initialize Firebase
        if (firebaseConfig.apiKey === "GANTI_DENGAN_API_KEY_ANDA") {
            alert("SISTEM BELUM TERHUBUNG! \n\nSilakan edit file 'app.js' dan masukkan Config Firebase Anda.");
        } else {
            const app = firebase.initializeApp(firebaseConfig);
            this.db = firebase.getDatabase(app);
            this.firebaseOps = firebase; // Store refs specifically
        }

        // Set Date
        this.elements.dashboard.currentDate.textContent = this.state.today;

        // Event Listeners for Login
        this.elements.login.angkatan.addEventListener('change', (e) => this.populateKelas(e.target.value));
        this.elements.login.form.addEventListener('submit', (e) => this.handleLogin(e));
        this.elements.login.adminBtn.addEventListener('click', (e) => this.handleAdminLogin(e));

        // Event Listeners for Admin
        this.elements.admin.backBtn.addEventListener('click', () => {
            this.elements.views.admin.classList.remove('active');
            this.elements.views.login.classList.add('active');
        });
        // Refresh di Firebase sebenarnya tidak perlu karena realtime, tapi kita keep tombolnya untuk UX
        this.elements.admin.refreshBtn.addEventListener('click', () => {
            // Re-trigger listener is not needed in realtime, simple toast feedback
            this.showToast('Memuat data terbaru...', 'info');
        });

        // Event Listeners for Dashboard
        this.elements.dashboard.logoutBtn.addEventListener('click', () => this.handleLogout());
        this.elements.dashboard.form.addEventListener('submit', (e) => this.handleSubmit(e));

        // Real-time Calculation Ui
        this.elements.dashboard.inputs.total.addEventListener('input', () => this.calculate());
        this.elements.dashboard.inputs.hadir.addEventListener('input', () => this.calculate());

        // Check Session (SessionStorage still useful for "Remember Me" on refresh)
        const savedSession = sessionStorage.getItem('mbg_session');
        if (savedSession) {
            const session = JSON.parse(savedSession);
            if (session.role === 'admin') {
                this.enterAdminMode();
            } else {
                this.login(session.angkatan, session.kelas);
            }
        }
    },

    populateKelas(angkatan) {
        const select = this.elements.login.kelas;
        select.innerHTML = '<option value="" disabled selected>Pilih Kelas...</option>';
        select.disabled = false;

        for (let i = 1; i <= 12; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Kelas ${angkatan} - ${i}`;
            select.appendChild(option);
        }
    },

    handleLogin(e) {
        e.preventDefault();
        const angkatan = this.elements.login.angkatan.value;
        const kelas = this.elements.login.kelas.value;
        const password = this.elements.login.password.value;

        // Simple Validation
        if (password === '1234') {
            this.login(angkatan, kelas);
        } else {
            alert('Password Salah! (Hint: 1234)');
            this.elements.login.password.value = '';
            this.elements.login.password.focus();
        }
    },

    login(angkatan, kelas) {
        // Update State
        this.state.angkatan = angkatan;
        this.state.kelas = kelas;
        this.state.isLoggedIn = true;

        // Save Session
        sessionStorage.setItem('mbg_session', JSON.stringify({ angkatan, kelas, role: 'user' }));

        // Update UI
        this.elements.dashboard.classTitle.textContent = `Kelas ${angkatan} - ${kelas}`;

        // Switch View
        this.elements.views.login.classList.remove('active');
        this.elements.views.dashboard.classList.add('active');

        // Listen to Realtime Data
        this.listenToClassData();
    },

    listenToClassData() {
        if (!this.db) return;

        const { ref, onValue } = this.firebaseOps;
        const path = `daily_reports/${this.state.dateKey}/${this.state.angkatan}/${this.state.kelas}`;
        const dataRef = ref(this.db, path);

        onValue(dataRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Populate inputs
                this.elements.dashboard.inputs.total.value = data.total;
                this.elements.dashboard.inputs.hadir.value = data.hadir;
                this.elements.dashboard.inputs.catatan.value = data.catatan || '';

                this.updateStatus(true);
                this.calculate();

                // Jika baru pertama kali load dan ada datanya -> notif
                // (Logic notif 'sudah terkirim' bisa ditaruh sini)
            } else {
                this.updateStatus(false);
                this.calculate(); // reset visuals
            }
        });
    },

    handleLogout() {
        sessionStorage.removeItem('mbg_session');
        window.location.reload();
    },

    calculate() {
        const total = parseInt(this.elements.dashboard.inputs.total.value) || 0;
        let hadir = parseInt(this.elements.dashboard.inputs.hadir.value) || 0;

        if (hadir > total) {
            hadir = total;
            this.elements.dashboard.inputs.hadir.value = total;
        }

        const absen = total - hadir;

        this.elements.dashboard.calc.absen.textContent = absen;
        this.elements.dashboard.calc.porsi.textContent = hadir;

        this.elements.dashboard.stats.total.textContent = total;
        this.elements.dashboard.stats.hadir.textContent = hadir;
    },

    handleSubmit(e) {
        e.preventDefault();

        if (!this.db) {
            alert("Database belum terkoneksi!");
            return;
        }

        const data = {
            total: parseInt(this.elements.dashboard.inputs.total.value),
            hadir: parseInt(this.elements.dashboard.inputs.hadir.value),
            catatan: this.elements.dashboard.inputs.catatan.value,
            taken: false, // Default belum diambil saat submit baru/update
            timestamp: new Date().toISOString()
        };

        const { ref, update } = this.firebaseOps; // Use update to merge, or set to overwrite.
        // Pakai update agar jika admin sudah set 'taken=true', tidak tertimpa jadi false lagi kecuali kita logic khusus.
        // Tapi biasanya kalau revisi data, status taken harus dicek ulang? 
        // User request: "Data reset tiap hari". Key kita pakai dateKey, jadi otomatis reset besoknya.
        // Kita pakai update() dan hanya kirim field yang relevan agar tidak menimpa status 'taken' jika sudah ada.

        const path = `daily_reports/${this.state.dateKey}/${this.state.angkatan}/${this.state.kelas}`;
        const dataRef = ref(this.db, path);

        // First, check existing to preserve 'taken' status if needed, 
        // OR just update specific fields.
        update(dataRef, {
            total: data.total,
            hadir: data.hadir,
            catatan: data.catatan,
            timestamp: data.timestamp
            // We intentionally DO NOT update 'taken' here so admin status persists even if they edit numbers
        }).then(() => {
            this.showToast('Data berhasil disimpan ke Cloud!', 'success');
        }).catch((err) => {
            console.error(err);
            this.showToast('Gagal menyimpan: ' + err.message, 'error');
        });
    },

    updateStatus(isSubmitted) {
        const statusEl = this.elements.dashboard.status;
        if (isSubmitted) {
            statusEl.className = 'status-indicator success';
            statusEl.innerHTML = '<i class="ph ph-check-circle"></i> <span>Data Terkirim</span>';
        } else {
            statusEl.className = 'status-indicator pending';
            statusEl.innerHTML = '<i class="ph ph-warning-circle"></i> <span>Belum Input Data</span>';
        }
    },

    // ================= ADMIN FUNCTIONS =================

    handleAdminLogin(e) {
        e.preventDefault();
        const pass = prompt("Masukkan Password Admin:");
        if (pass === "admin123") {
            this.enterAdminMode();
        } else if (pass !== null) {
            alert("Password Salah!");
        }
    },

    enterAdminMode() {
        if (!this.db) {
            alert("Konfigurasi Firebase belum diatur! Cek app.js");
            // Still allow View entry but data wont load
        }

        sessionStorage.setItem('mbg_session', JSON.stringify({ role: 'admin' }));
        this.elements.views.login.classList.remove('active');
        this.elements.views.admin.classList.add('active');
        this.listenAdminData();
    },

    listenAdminData() {
        if (!this.db) return;

        const { ref, onValue } = this.firebaseOps;
        // Listen to the whole day's node
        const path = `daily_reports/${this.state.dateKey}`;
        const dayRef = ref(this.db, path);

        onValue(dayRef, (snapshot) => {
            const dataAll = snapshot.val() || {};
            this.renderAdminTable(dataAll);
        });
    },

    renderAdminTable(dataAll) {
        const tbody = this.elements.admin.tbody;
        tbody.innerHTML = '';
        let grandTotalHadir = 0;
        let totalTaken = 0;
        let totalPending = 0;

        const angkatanList = [10, 11, 12];

        angkatanList.forEach(angkatan => {
            const angkatanData = dataAll[angkatan] || {};

            for (let k = 1; k <= 12; k++) {
                const data = angkatanData[k]; // data for specific class

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid var(--border)';

                // Stats Accumulation
                if (data) {
                    grandTotalHadir += (data.hadir || 0);
                    if (data.taken) {
                        totalTaken++;
                    } else {
                        totalPending++;
                    }
                }

                // 1. Class Name
                const tdClass = document.createElement('td');
                tdClass.style.padding = '1rem 0.5rem';
                tdClass.textContent = `${angkatan}-${k}`;

                // 2. Total Siswa
                const tdTotal = document.createElement('td');
                tdTotal.style.padding = '1rem 0.5rem';
                tdTotal.textContent = data ? data.total : '-';

                // 3. Hadir
                const tdHadir = document.createElement('td');
                tdHadir.style.padding = '1rem 0.5rem';
                tdHadir.textContent = data ? data.hadir : '-';

                // 4. Catatan
                const tdCatatan = document.createElement('td');
                tdCatatan.style.padding = '1rem 0.5rem';
                tdCatatan.style.maxWidth = '200px';
                if (data && data.catatan) {
                    tdCatatan.textContent = data.catatan;
                    tdCatatan.style.color = 'var(--text-main)';
                    tdCatatan.style.fontSize = '0.85rem';
                } else {
                    tdCatatan.textContent = '-';
                    tdCatatan.style.color = 'var(--text-muted)';
                }

                // 5. Status Text
                const tdStatus = document.createElement('td');
                tdStatus.style.padding = '1rem 0.5rem';
                if (data) {
                    tdStatus.innerHTML = '<span style="color: var(--success); font-size: 0.8rem;">● Masuk</span>';
                } else {
                    tdStatus.innerHTML = '<span style="color: var(--text-muted); font-size: 0.8rem;">○ Belum</span>';
                }

                // 6. Action (Taken Button)
                const tdAction = document.createElement('td');
                tdAction.style.padding = '1rem 0.5rem';

                if (data) {
                    const btnTaken = document.createElement('button');
                    btnTaken.className = `btn-taken ${data.taken ? 'active' : ''}`;
                    btnTaken.innerHTML = data.taken
                        ? '<i class="ph ph-check-square"></i> Diambil'
                        : '<i class="ph ph-square"></i> Ambil';

                    // Direct click handler
                    btnTaken.onclick = () => this.toggleTaken(angkatan, k, data.taken);
                    tdAction.appendChild(btnTaken);
                } else {
                    tdAction.innerHTML = '<span style="color: var(--text-muted);">-</span>';
                }

                tr.append(tdClass, tdTotal, tdHadir, tdCatatan, tdStatus, tdAction);
                tbody.appendChild(tr);
            }
        });

        this.elements.admin.totalPorsi.textContent = grandTotalHadir;
        this.elements.admin.takenCount.textContent = totalTaken;
        this.elements.admin.pendingCount.textContent = totalPending;
        this.elements.admin.dateDisplay.textContent = `Laporan: ${this.state.today}`;
    },

    toggleTaken(angkatan, kelas, currentStatus) {
        if (!this.db) return;

        const path = `daily_reports/${this.state.dateKey}/${angkatan}/${kelas}`;
        const { ref, update } = this.firebaseOps;
        const dataRef = ref(this.db, path);

        // Cukup update field 'taken'
        update(dataRef, {
            taken: !currentStatus
        }).then(() => {
            // No manual showToast needed here strictly, as the UI updates realtime.
            // But we can show one for feedback.
            this.showToast(`Status Kelas ${angkatan}-${kelas} diperbarui`, 'success');
        });
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        let icon = 'info';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'warning-circle';

        toast.innerHTML = `<i class="ph ph-${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};
