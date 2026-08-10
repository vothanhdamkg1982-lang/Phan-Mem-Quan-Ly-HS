import { supabase } from './supabase.js';

export async function migrateLocalStorageToSupabase() {
    const localStudents = JSON.parse(localStorage.getItem('students') || '[]');
    const localClasses = JSON.parse(localStorage.getItem('classes') || '[]');
    const localScores = JSON.parse(localStorage.getItem('scores') || '{}');
    const localAttendance = JSON.parse(localStorage.getItem('attendance') || '[]');
    const localRewards = JSON.parse(localStorage.getItem('rewards') || '[]');
    const localDisciplines = JSON.parse(localStorage.getItem('disciplines') || '[]');
    const localFiles = JSON.parse(localStorage.getItem('files') || '[]');
    const localSettings = JSON.parse(localStorage.getItem('settings') || '{}');

    let result = { students: 0, classes: 0, scores: 0, attendance: 0, rewards: 0, disciplines: 0, files: 0, settings: 0 };

    try {
        // 1. Migration Classes
        for (const cls of localClasses) {
            const { error } = await supabase
                .from('app3_classes')
                .upsert({
                    class_code: cls.id || cls.name,
                    name: cls.name,
                    grade: cls.grade,
                    teacher: cls.teacher || 'Võ Thanh Đậm'
                }, { onConflict: 'class_code' });
            if (!error) result.classes++;
        }

        // 2. Migration Students
        const classMap = {};
        const { data: classesData } = await supabase.from('app3_classes').select('id, class_code');
        if (classesData) {
            classesData.forEach(c => classMap[c.class_code] = c.id);
        }

        for (const s of localStudents) {
            const classId = classMap[s.class] || null;
            const { error } = await supabase
                .from('app3_students')
                .upsert({
                    student_code: s.id,
                    full_name: s.fullName,
                    dob: s.dob || null,
                    gender: s.gender,
                    address: s.address,
                    phone: s.phone,
                    email: s.email,
                    class_id: classId,
                    grade: s.grade,
                    father_name: s.fatherName,
                    mother_name: s.motherName,
                    parent_phone: s.parentPhone,
                    competence: s.competence,
                    quality: s.quality,
                    enrollment_date: s.enrollmentDate || null,
                    status: s.status || 'Đang học',
                    note: s.note,
                    avatar_url: (s.avatar && s.avatar.startsWith('data:')) ? null : s.avatar
                }, { onConflict: 'student_code' });
            if (!error) result.students++;
        }

        // 3. Migration Scores
        const studentMap = {};
        const { data: studentsData } = await supabase.from('app3_students').select('id, student_code');
        if (studentsData) {
            studentsData.forEach(st => studentMap[st.student_code] = st.id);
        }

        for (const [studentCode, subjects] of Object.entries(localScores)) {
            const studentId = studentMap[studentCode];
            if (!studentId) continue;
            for (const [subject, scores] of Object.entries(subjects)) {
                const { error } = await supabase
                    .from('app3_scores')
                    .upsert({
                        student_id: studentId,
                        subject: subject,
                        giua_ky_1: scores.giuaKy1 || '',
                        cuoi_ky_1: scores.cuoiKy1 !== null ? scores.cuoiKy1 : null,
                        giua_ky_2: scores.giuaKy2 || '',
                        cuoi_ky_2: scores.cuoiKy2 !== null ? scores.cuoiKy2 : null
                    }, { onConflict: 'student_id,subject' });
                if (!error) result.scores++;
            }
        }

        // 4. Migration Attendance
        for (const att of localAttendance) {
            const { data: classData } = await supabase.from('app3_classes').select('id').eq('class_code', att.class).single();
            const classId = classData?.id || null;
            for (const rec of att.records) {
                const studentId = studentMap[rec.studentId];
                if (!studentId) continue;
                const { error } = await supabase
                    .from('app3_attendance')
                    .upsert({
                        student_id: studentId,
                        class_id: classId,
                        attendance_date: att.date,
                        status: rec.status
                    }, { onConflict: 'student_id,attendance_date' });
                if (!error) result.attendance++;
            }
        }

        // 5. Migration Rewards
        for (const r of localRewards) {
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
            if (!error) result.rewards++;
        }

        // 6. Migration Disciplines
        for (const d of localDisciplines) {
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
            if (!error) result.disciplines++;
        }

        // 7. Migration Files
        for (const f of localFiles) {
            const { error } = await supabase
                .from('app3_files')
                .insert({
                    file_name: f.name,
                    file_path: `legacy/${f.id}`,
                    file_type: f.type,
                    file_size: f.size,
                    description: f.desc || ''
                });
            if (!error) result.files++;
        }

        // 8. Migration Settings
        if (localSettings && Object.keys(localSettings).length) {
            const { error } = await supabase
                .from('app3_settings')
                .upsert({
                    school_name: localSettings.schoolName || 'Trường Tiểu học Trần Quốc Toản',
                    school_year: localSettings.schoolYear || '2025-2026',
                    teacher_name: localSettings.teacherName || 'Võ Thanh Đậm',
                    theme: localSettings.theme || 'light'
                });
            if (!error) result.settings++;
        }

        return { success: true, result };
    } catch (err) {
        console.error('Migration error:', err);
        return { success: false, error: err.message };
    }
}