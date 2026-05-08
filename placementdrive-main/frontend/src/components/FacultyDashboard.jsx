// frontend/src/components/FacultyDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, deleteDoc, doc, query, where } from "firebase/firestore";
import { db } from '../firebase.js';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { 
    EmailAuthProvider, 
    reauthenticateWithCredential, 
    updatePassword 
} from "firebase/auth"; 
import { auth } from '../firebase.js';
import { API_URL } from '../api';
//added now
// ===== Randomization helpers (from FacultyDashboard2 logic) =====

/*function shuffleArray(array) {
  return [...array].sort(() => Math.random() - 0.5);
}*/

/*function pickRandomFromPool(pool, count, usedQuestionIds) {
  const available = pool.filter(q => !usedQuestionIds.has(q.id));
  const shuffled = shuffleArray(available);
  const selected = shuffled.slice(0, count);

  selected.forEach(q => usedQuestionIds.add(q.id));
  return selected;
}*/

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

//const API_URL = 'http://172.29.23.168:5000';

const subjects = [
    { id: 'dsa', name: 'Data Structures & Algorithms', icon: '🧩' },
    { id: 'oops', name: 'Object-Oriented Programming', icon: '🔷' },
    { id: 'dbms', name: 'Database Management Systems', icon: '💾' },
    { id: 'os', name: 'Operating Systems', icon: '💻' },
    { id: 'cn', name: 'Computer Networks', icon: '🌐' },
    { id: 'c', name: 'C Programming', icon: '🔤' }
];

const difficulties = ['Easy', 'Medium', 'Hard']; 

const getMinDate = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0'); 
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};
const minDate = getMinDate(); 

function FacultyDashboard({ user, onLogout }) {
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [activeTab, setActiveTab] = useState('create');
    const [questions, setQuestions] = useState([]);
    const [tests, setTests] = useState([]);

    // Analytics and student detail states
    const [analytics, setAnalytics] = useState(null);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentAnalytics, setStudentAnalytics] = useState(null);
    const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [currentScreen, setCurrentScreen] = useState('main'); // To handle password change view
    const [passwords, setPasswords] = useState({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    // Pool Management States
    const [pools, setPools] = useState([]); 
    const [newPoolName, setNewPoolName] = useState('');
    const [selectedPoolId, setSelectedPoolId] = useState(''); 

    // Form states
    const [questionForm, setQuestionForm] = useState({
        topic: '',
        questionText: '',
        options: ['', '', '', ''],
        correctOptionIndex: 0,
        poolId: '',
        difficulty: difficulties[0]
    });

    // Test Form States
    const [testForm, setTestForm] = useState({
        testName: '',
        releaseOption: 'now',
        scheduledDate: '',
        scheduledTime: '',
        durationMinutes: 60,
        releaseType: 'whole-pool', 
        selectedPoolIds: [], 
        totalQuestions: 10,
        difficultyDistribution: {
            easy: 40,
            medium: 30,
            hard: 30
        },
        // --- NEW FIELDS FOR CUSTOM DISTRIBUTION ---
        customPoolDistribution: false,
        poolQuestionMap: {}, 
        // ------------------------------------------

        // --- NEW FIELDS FOR END TIME ---
        endOption: 'none', 
        endDate: '',       
        endTime: '',       
    });

    //scores
    const [selectedTestForScores, setSelectedTestForScores] = useState(null);
const [testScores, setTestScores] = useState([]);


    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);


    const handlePasswordChange = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    if (passwords.newPassword !== passwords.confirmPassword) {
        setMessage("Error: New passwords do not match.");
        setIsSubmitting(false);
        return;
    }

    try {
        const currentUser = auth.currentUser;
        const credential = EmailAuthProvider.credential(currentUser.email, passwords.oldPassword);
        
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, passwords.newPassword);

        alert("Password updated successfully!");
        setPasswords({ oldPassword: '', newPassword: '', confirmPassword: '' });
        setCurrentScreen('main'); // Go back to dashboard
    } catch (err) {
        setMessage('Error: ' + (err.code === 'auth/wrong-password' ? "Current password is incorrect." : err.message));
    } finally {
        setIsSubmitting(false);
    }
};

    // --- Data Fetching Logic ---

    const fetchPools = useCallback(async () => {
        if (!selectedSubject?.id) return;
        try {
            const response = await fetch(`${API_URL}/pools/${selectedSubject.id}`);
            if (response.ok) {
                const poolsData = await response.json();
                setPools(poolsData);
                if (poolsData.length > 0 && !questionForm.poolId) {
                    setSelectedPoolId(poolsData[0].id);
                    setQuestionForm(prev => ({ ...prev, poolId: poolsData[0].id }));
                } else if (poolsData.length > 0 && questionForm.poolId) {
                    setSelectedPoolId(questionForm.poolId);
                } else if (poolsData.length === 0) {
                    setSelectedPoolId('');
                    setQuestionForm(prev => ({ ...prev, poolId: '' }));
                }
            }
        } catch (error) {
            console.error('Error fetching pools:', error);
            setMessage('Error fetching pools: ' + error.message);
        }
    }, [selectedSubject?.id, questionForm.poolId]);

    const fetchQuestions = useCallback(async () => {
        if (!selectedSubject?.id) return;
        try {
            const q = query(
                collection(db, "questions"),
                where("courseId", "==", selectedSubject.id)
            );
            const querySnapshot = await getDocs(q);
            const questionsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setQuestions(questionsData);
        } catch (error) {
            console.error('Error fetching questions:', error);
            setMessage('Error fetching questions: ' + error.message);
        }
    }, [selectedSubject?.id]);

    const fetchTests = useCallback(async () => {
        if (!selectedSubject?.id) return;
        try {
            const q = query(
                collection(db, "tests"),
                where("courseId", "==", selectedSubject.id)
            );
            const querySnapshot = await getDocs(q);
            const testsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setTests(testsData);
        } catch (error) {
            console.error('Error fetching tests:', error);
            setMessage('Error fetching tests: ' + error.message);
        }
    }, [selectedSubject?.id]);
    // now



    const fetchCourseAnalytics = useCallback(async () => {
        if (!selectedSubject) return;
        setIsLoadingAnalytics(true);
        setMessage('');
        try {
            const response = await fetch(`${API_URL}/faculty/course-analysis/${selectedSubject.id}`);
            if (response.ok) {
                setAnalytics(await response.json());
            } else {
                setMessage('Error fetching analytics: ' + await response.text());
            }
        } catch (error) {
            setMessage('Error fetching analytics: ' + error.message);
        } finally {
            setIsLoadingAnalytics(false);
        }
    }, [selectedSubject]);

    const fetchStudentAnalytics = useCallback(async (studentId) => {
        if (!selectedSubject || !studentId) return;
        setIsLoadingAnalytics(true);
        try {
            const response = await fetch(`${API_URL}/faculty/student-analysis/${selectedSubject.id}/${studentId}`);
            if (response.ok) {
                setStudentAnalytics(await response.json());
                setSelectedStudent(studentId);
            }
        } catch (error) {
            console.error('Error fetching student analytics:', error);
            setMessage('Error fetching student analytics: ' + error.message);
        } finally {
            setIsLoadingAnalytics(false);
        }
    }, [selectedSubject]);

    useEffect(() => {
        if (selectedSubject) {
            fetchPools();
            fetchQuestions();
            fetchTests();
            fetchCourseAnalytics();
        }
    }, [selectedSubject, fetchQuestions, fetchTests, fetchCourseAnalytics, fetchPools]);
    const fetchTestScores = async (testId) => {
    setIsLoadingAnalytics(true);
    setSelectedTestForScores(testId);
    try {
        const response = await fetch(`${API_URL}/faculty/test-scores/${testId}`);
        if (response.ok) {
            setTestScores(await response.json());
        }
    } catch (err) {
        setMessage('Error fetching test scores');
    } finally {
        setIsLoadingAnalytics(false);
    }
};


    // --- Helper Functions ---
    // Calculates available questions per difficulty for a specific pool
    const getPoolInventory = (poolId) => {
        const poolQuestions = questions.filter(q => q.poolId === poolId);
        return {
            easy: poolQuestions.filter(q => q.difficulty === 'Easy').length,
            medium: poolQuestions.filter(q => q.difficulty === 'Medium').length,
            hard: poolQuestions.filter(q => q.difficulty === 'Hard').length
        };
    };

    // --- Pool Handlers ---
    const handleCreatePool = async (e) => {
        e.preventDefault();
        if (!newPoolName.trim()) {
            setMessage('Pool name cannot be empty.');
            return;
        }

        setIsSubmitting(true);
        setMessage('');

        try {
            const response = await fetch(`${API_URL}/pools`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    courseId: selectedSubject.id,
                    poolName: newPoolName.trim(),
                    createdBy: user.uid
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to create pool.');

            setMessage(`Pool "${newPoolName}" created successfully!`);
            setNewPoolName('');
            await fetchPools(); 
        } catch (error) {
            setMessage('Error creating pool: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Form Handlers ---
    const handleQuestionSubmit = async (e) => {
        e.preventDefault();
        if (!questionForm.poolId) {
            setMessage('Error: You must select a Pool before adding a question.');
            return;
        }
        setIsSubmitting(true);
        setMessage('');

        try {
            const response = await fetch(`${API_URL}/questions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    courseId: selectedSubject.id,
                    ...questionForm,
                    correctOptionIndex: Number(questionForm.correctOptionIndex),
                    createdBy: user.uid
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to add question via API.');

            setMessage('Question added successfully!');
            setQuestionForm(prev => ({
                topic: '',
                questionText: '',
                options: ['', '', '', ''],
                correctOptionIndex: 0,
                poolId: prev.poolId, 
                difficulty: prev.difficulty 
            }));
            fetchQuestions();
        } catch (error) {
            setMessage('Error adding question: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFileUpload = async (e) => {
        e.preventDefault();
        if (!uploadFile) {
            setMessage('Error: Please select a file to upload.');
            return;
        }
        if (!selectedPoolId) {
            setMessage('Error: Please select a Pool to upload questions into.');
            return;
        }

        setIsSubmitting(true);
        setMessage('');

        const formData = new FormData();
        formData.append('questionsFile', uploadFile);
        formData.append('courseId', selectedSubject.id);
        formData.append('poolId', selectedPoolId); 

        try {
            const response = await fetch(`${API_URL}/questions/upload`, {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to upload file.');
            }

            setMessage(result.message);
            setUploadFile(null);
            document.getElementById('file-upload-input').value = '';
            fetchQuestions();

        } catch (error) {
            setMessage('Error: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteQuestion = async (questionId) => {
        if (window.confirm('Are you sure you want to delete this question?')) {
            try {
                await deleteDoc(doc(db, "questions", questionId));
                setMessage('Question deleted successfully!');
                fetchQuestions();
            } catch (error) {
                setMessage('Error deleting question: ' + error.message);
            }
        }
    };

    const handleTestRelease = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage('');

        const { releaseType, selectedPoolIds, totalQuestions, difficultyDistribution } = testForm;

        if (selectedPoolIds.length === 0) {
            setMessage('Error: Please select at least one Pool for the test source.');
            setIsSubmitting(false);
            return;
        }

        if (testForm.endOption === 'schedule' && (!testForm.endDate || !testForm.endTime)) {
            setMessage('Error: Schedule End Time selected but date/time fields are missing.');
            setIsSubmitting(false);
            return;
        }

        let endpoint = '';
        let payload = {
            testName: testForm.testName,
            courseId: selectedSubject.id,
            durationMinutes: parseInt(testForm.durationMinutes),
            releaseOption: testForm.releaseOption,
            scheduledDate: testForm.scheduledDate,
            scheduledTime: testForm.scheduledTime,
            selectedPoolIds: selectedPoolIds,
            createdBy: user.uid,
            endOption: testForm.endOption, 
            endDate: testForm.endDate,     
            endTime: testForm.endTime      
        };
        // now
        // 🔑 tells backend to generate UNIQUE papers per student
        payload.perStudentRandomization = true;
        //now
        if (releaseType === 'random' && !payload.perStudentRandomization) {
    setMessage('Error: Per-student randomization flag missing.');
    setIsSubmitting(false);
    return;
}




        if (releaseType === 'random') {
            endpoint = `${API_URL}/tests/release-random`;

            if (testForm.customPoolDistribution) {
                // --- CUSTOM DISTRIBUTION VALIDATION LOGIC ---
                let calculatedTotal = 0;
                const errors = [];

                // Validate each selected pool against inventory
                testForm.selectedPoolIds.forEach(poolId => {
                    const counts = testForm.poolQuestionMap[poolId] || { easy: 0, medium: 0, hard: 0 };
                    const inventory = getPoolInventory(poolId);
                    const poolName = pools.find(p => p.id === poolId)?.poolName || poolId;

                    ['easy', 'medium', 'hard'].forEach(d => {
                        const requested = Number(counts[d] || 0);
                        const available = inventory[d];
                        
                        if (requested > available) {
                            errors.push(`Pool "${poolName}": Requested ${requested} ${d} (Available: ${available})`);
                        }
                        calculatedTotal += requested;
                    });
                });

                if (errors.length > 0) {
                    setMessage('Error:\n- ' + errors.join('\n- '));
                    setIsSubmitting(false);
                    return;
                }

                if (calculatedTotal <= 0) {
                    setMessage('Error: Total questions must be greater than 0.');
                    setIsSubmitting(false);
                    return;
                }

                // Override payload with calculated values
                payload.totalQuestions = calculatedTotal;
                payload.poolQuestionMap = testForm.poolQuestionMap;
                payload.customPoolDistribution = true;
                // Send dummy distribution to satisfy generic backend checks if necessary
                payload.difficultyDistribution = { easy: 0, medium: 0, hard: 0 }; 

            } else {
    // --- STANDARD LOGIC (Global Percentage) ---
    const totalPercentage =
        difficultyDistribution.easy +
        difficultyDistribution.medium +
        difficultyDistribution.hard;

    if (totalPercentage !== 100 || totalQuestions <= 0) {
        setMessage(
            'Error: Total questions must be > 0 and difficulty percentages must sum to 100%.'
        );
        setIsSubmitting(false);
        return;
    }

    payload.totalQuestions = Number(totalQuestions);
    payload.difficultyDistribution = difficultyDistribution;

    // ✅ CRITICAL FIX (ADD THESE TWO LINES)
    payload.customPoolDistribution = false;
    payload.poolQuestionMap = {};
}


        } else {
            // 'whole-pool'
            endpoint = `${API_URL}/tests/release-whole-pool`;
        }

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to release test.');
            }

            setMessage(result.message);
            // Reset form
            setTestForm(prev => ({
                ...prev,
                testName: '',
                scheduledDate: '',
                scheduledTime: '',
                selectedPoolIds: [],
                totalQuestions: 10,
                endDate: prev.endOption === 'schedule' ? prev.endDate : '',
                endTime: prev.endOption === 'schedule' ? prev.endTime : '',
                poolQuestionMap: {}, // Reset custom map
            }));
            fetchTests();
            fetchCourseAnalytics();
        } catch (error) {
            setMessage('Error releasing test: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const clearStudentAnalytics = () => {
        setSelectedStudent(null);
        setStudentAnalytics(null);
    };

    const downloadCsvTemplate = () => {
        const headers = ['topic', 'questionText', 'option1', 'option2', 'option3', 'option4', 'correctOptionIndex', 'difficulty'];
        const exampleRow = ['Example Topic', 'What is the best way to travel?', 'Walking', 'Flying', 'Driving', 'Biking', '1', 'Easy'];
        const csvContent = [headers.join(','), exampleRow.map(item => `"${item}"`).join(',')].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');

        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'QuestionTemplate.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            alert("Your browser does not support downloading files directly. Please copy the template headers.");
        }
    };


    // --- Component Rendering ---

    if (!selectedSubject) {
    return (
        <div className="app-container">
            <nav className="navbar">
                <h1>Faculty Dashboard</h1>
                <div className="profile-container">
                    <div className="profile-trigger" onClick={() => setShowProfileMenu(!showProfileMenu)}>
                        <span className="user-name-nav">{user.name}</span>
                        <div className="profile-icon-nav">👤</div>
                    </div>
                    {showProfileMenu && (
                        <div className="profile-dropdown">
                            <button onClick={() => { setCurrentScreen('change-password'); setShowProfileMenu(false); }}>
                                🔒 Change Password
                            </button>
                            <button onClick={onLogout} className="logout-opt">🚪 Logout</button>
                        </div>
                    )}
                </div>
            </nav>
            
            <main className="main-content">
                {/* Show password change OR subject selection */}
                {currentScreen === 'change-password' ? (
                    <div className="card" style={{ maxWidth: '500px', margin: '2rem auto' }}>
                        <h2>Security</h2>
                        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>Update your account password below.</p>
                        
                        {message && (
                            <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
                                {message}
                            </div>
                        )}
                        
                        <form onSubmit={handlePasswordChange}>
                            <div className="input-group">
                                <label>Current Password</label>
                                <input 
                                    type="password" 
                                    value={passwords.oldPassword} 
                                    onChange={(e) => setPasswords({...passwords, oldPassword: e.target.value})} 
                                    required 
                                />
                            </div>
                            <div className="input-group">
                                <label>New Password</label>
                                <input 
                                    type="password" 
                                    value={passwords.newPassword} 
                                    onChange={(e) => setPasswords({...passwords, newPassword: e.target.value})} 
                                    required 
                                />
                            </div>
                            <div className="input-group">
                                <label>Confirm New Password</label>
                                <input 
                                    type="password" 
                                    value={passwords.confirmPassword} 
                                    onChange={(e) => setPasswords({...passwords, confirmPassword: e.target.value})} 
                                    required 
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                <button 
                                    type="submit" 
                                    className="btn btn-primary" 
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? 'Updating...' : 'Update Password'}
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        setCurrentScreen('main');
                                        setMessage('');
                                        setPasswords({ oldPassword: '', newPassword: '', confirmPassword: '' });
                                    }} 
                                    className="btn btn-secondary"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="card">
                        <h2>Welcome, {user.name}!</h2>
                        <p>Select a subject to manage questions and tests</p>
                        <div className="subjects-grid">
                            {subjects.map(subject => (
                                <div 
                                    key={subject.id} 
                                    className="subject-card"
                                    onClick={() => setSelectedSubject(subject)}
                                >
                                    <div className="subject-icon">{subject.icon}</div>
                                    <h3>{subject.name}</h3>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

    return (
        <div className="app-container">
            <nav className="navbar">
    <h1>Faculty Dashboard {selectedSubject ? `- ${selectedSubject.name}` : ''}</h1>
    <div className="profile-container">
        <div
            className="profile-trigger"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
        >
            <span className="user-name-nav">{user.name}</span>
            <div className="profile-icon-nav">👤</div>
        </div>

        {showProfileMenu && (
            <div className="profile-dropdown">
                <button
                    onClick={() => {
                        setCurrentScreen('change-password');
                        setShowProfileMenu(false);
                    }}
                >
                    🔒 Change Password
                </button>
                <button onClick={onLogout} className="logout-opt">
                    🚪 Logout
                </button>
            </div>
        )}
    </div>
</nav>

            <main className="main-content">
                  {currentScreen === 'change-password' ? (
        <div className="card" style={{ maxWidth: '500px', margin: '2rem auto' }}>
            <h2>Security</h2>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
                Update your account password below.
            </p>

            {message && (
                <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
                    {message}
                </div>
            )}

            <form onSubmit={handlePasswordChange}>
                <div className="input-group">
                    <label>Current Password</label>
                    <input
                        type="password"
                        value={passwords.oldPassword}
                        onChange={e =>
                            setPasswords({ ...passwords, oldPassword: e.target.value })
                        }
                        required
                    />
                </div>

                <div className="input-group">
                    <label>New Password</label>
                    <input
                        type="password"
                        value={passwords.newPassword}
                        onChange={e =>
                            setPasswords({ ...passwords, newPassword: e.target.value })
                        }
                        required
                    />
                </div>

                <div className="input-group">
                    <label>Confirm New Password</label>
                    <input
                        type="password"
                        value={passwords.confirmPassword}
                        onChange={e =>
                            setPasswords({ ...passwords, confirmPassword: e.target.value })
                        }
                        required
                    />
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Updating...' : 'Update Password'}
                    </button>

                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                            setCurrentScreen('main');
                            setMessage('');
                            setPasswords({
                                oldPassword: '',
                                newPassword: '',
                                confirmPassword: ''
                            });
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    ) : (
                <div className="card">
                    <button 
                        onClick={() => setSelectedSubject(null)} 
                        className="btn btn-secondary"
                    >
                        ← Back to Subjects
                    </button>
                    <p></p>
                    <p></p>
                    {/* Tab Navigation */}
                    <div className="faculty-tabs">
                       {['create', 'view', 'release', 'analytics', 'scores'].map(tab => (

                            <button
                                key={tab}
                                className={`faculty-tab ${activeTab === tab ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab)}
                            >
                                {tab.charAt(0).toUpperCase() + tab.slice(1)} {tab === 'view' && `(${questions.length})`}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    {message && (
                        <div className={`message ${message.includes('Error') ? 'error' : 'success'}`} style={{whiteSpace: 'pre-wrap'}}>
                            {message}
                        </div>
                    )}

                    {/* --- 1. Create Questions Tab --- */}
                    {activeTab === 'create' && (
                        <div>
                            {/* --- POOL CREATION SECTION --- */}
                            <div className="pool-creation-section">
                                <h3>Create/Select Question Pool</h3>
                                <div className="form-row">
                                    <div className="input-group input-group-half">
                                        <label>New Pool Name</label>
                                        <input type="text" value={newPoolName} onChange={e => setNewPoolName(e.target.value)} placeholder="e.g., Easy DSA Pool, Midterm 2024" />
                                        <button onClick={handleCreatePool} disabled={isSubmitting || !newPoolName.trim()} className="btn btn-primary" style={{ marginTop: '10px' }}>
                                            Create Pool
                                        </button>
                                    </div>
                                    <div className="input-group input-group-half">
                                        <label>Select Active Pool</label>
                                        <select
                                            value={selectedPoolId}
                                            onChange={e => {
                                                setSelectedPoolId(e.target.value);
                                                setQuestionForm(prev => ({ ...prev, poolId: e.target.value }));
                                            }}
                                            required
                                        >
                                            <option value="">-- Select or Create a Pool --</option>
                                            {pools.map(pool => (
                                                <option key={pool.id} value={pool.id}>{pool.poolName}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <hr className="divider" />

                            {/* --- UPLOAD FORM SECTION --- */}
                            <div className="upload-section">
                                <h3>Bulk Upload Questions (.csv)</h3>
                                <p>
                                    Upload file content will be added to the selected Pool above.
                                    <span
                                        onClick={downloadCsvTemplate}
                                        style={{ color: '#D22D64', cursor: 'pointer', textDecoration: 'underline', marginLeft: '5px' }}
                                    >
                                        Download Template
                                    </span>
                                </p>
                                <form onSubmit={handleFileUpload} className="upload-form">
                                    <div className="input-group">
                                        <input
                                            id="file-upload-input"
                                            type="file"
                                            accept=".csv"
                                            onChange={(e) => setUploadFile(e.target.files[0])}
                                            required
                                            disabled={!selectedPoolId}
                                        />
                                    </div>
                                    <button type="submit" disabled={isSubmitting || !uploadFile || !selectedPoolId} className="btn btn-primary">
                                        {isSubmitting ? 'Uploading...' : `Upload to Pool ${pools.find(p => p.id === selectedPoolId)?.poolName || '...'}`}
                                    </button>
                                    {!selectedPoolId && <p style={{ color: 'red', marginTop: '5px' }}>Select a Pool before uploading.</p>}
                                </form>
                            </div>

                            <hr className="divider" />

                            <h3>Add a Single Question</h3>
                            <form onSubmit={handleQuestionSubmit}>
                                <div className="input-group">
                                    <label>Topic</label>
                                    <input type="text" value={questionForm.topic} onChange={e => setQuestionForm(prev => ({ ...prev, topic: e.target.value }))} placeholder="e.g., Arrays, Concurrency" required />
                                </div>
                                <div className="form-row">
                                    <div className="input-group input-group-half">
                                        <label>Assigned Pool</label>
                                        <select value={questionForm.poolId} onChange={e => setQuestionForm(prev => ({ ...prev, poolId: e.target.value }))} disabled>
                                            <option value={selectedPoolId}>
                                                {pools.find(p => p.id === selectedPoolId)?.poolName || 'Select a Pool First'}
                                            </option>
                                        </select>
                                    </div>
                                    <div className="input-group input-group-half">
                                        <label>Difficulty Level</label>
                                        <select value={questionForm.difficulty} onChange={e => setQuestionForm(prev => ({ ...prev, difficulty: e.target.value }))} required>
                                            {difficulties.map(d => (<option key={d} value={d}>{d}</option>))}
                                        </select>
                                    </div>
                                </div>
                                <div className="input-group">
                                    <label>Question</label>
                                    <textarea value={questionForm.questionText} onChange={e => setQuestionForm(prev => ({ ...prev, questionText: e.target.value }))} rows="3" placeholder="Enter your question here..." required></textarea>
                                </div>
                                <div className="input-group">
                                    <label>Options</label>
                                    {questionForm.options.map((opt, i) => (
                                        <input key={i} type="text" value={opt} onChange={e => { const newOptions = [...questionForm.options]; newOptions[i] = e.target.value; setQuestionForm(prev => ({ ...prev, options: newOptions })); }} placeholder={`Option ${i + 1}`} className="option-input" required />
                                    ))}
                                </div>
                                <div className="input-group">
                                    <label>Correct Answer</label>
                                    <select value={questionForm.correctOptionIndex} onChange={e => setQuestionForm(prev => ({ ...prev, correctOptionIndex: e.target.value }))} required>
                                        {questionForm.options.map((opt, i) => (<option key={i} value={i} disabled={!opt}>{opt || `Option ${i + 1}`}</option>))}
                                    </select>
                                </div>
                                <button type="submit" disabled={isSubmitting || !questionForm.poolId} className="btn btn-success btn-full">
                                    {isSubmitting ? 'Submitting...' : 'Add Question'}
                                </button>
                                {!questionForm.poolId && <p style={{ color: 'red', textAlign: 'center', marginTop: '10px' }}>Please select a Pool above to add a question.</p>}
                            </form>
                        </div>
                    )}

                    {/* --- 2. View Questions Tab --- */}
                    {activeTab === 'view' && (
                        <div>
                            <h3>Filter Questions by Pool</h3>
                            <div className="input-group" style={{ marginBottom: '1rem' }}>
                                <select
                                    value={selectedPoolId}
                                    onChange={e => setSelectedPoolId(e.target.value)}
                                >
                                    <option value="">-- View All Questions ({questions.length}) --</option>
                                    {pools.map(pool => (
                                        <option key={pool.id} value={pool.id}>{pool.poolName} ({questions.filter(q => q.poolId === pool.id).length} Qs)</option>
                                    ))}
                                </select>
                            </div>

                            <div className="questions-list">
                                {questions.length === 0 ? (<p>No questions found for this subject.</p>) : (
                                    questions
                                        .filter(q => !selectedPoolId || q.poolId === selectedPoolId)
                                        .map(question => (
                                            <div key={question.id} className="question-item">
                                                <div className="question-header">
                                                    <span className="question-topic">{question.topic}</span>
                                                    <span className="question-pool" style={{ marginRight: '10px', fontSize: '0.8em', color: '#6c757d' }}>
                                                        Pool: {pools.find(p => p.id === question.poolId)?.poolName || 'No Pool'}
                                                    </span>
                                                    <span className={`question-difficulty difficulty-${question.difficulty?.toLowerCase() || 'medium'}`} style={{ fontWeight: 'bold' }}>
                                                        {question.difficulty || 'N/A'}
                                                    </span>
                                                    <div className="question-actions">
                                                        <button onClick={() => handleDeleteQuestion(question.id)} className="btn btn-danger">Delete</button>
                                                    </div>
                                                </div>
                                                <div className="question-text">{question.questionText}</div>
                                                <div className="options-list">
                                                    {question.options.map((option, index) => (
                                                        <div key={index} className={`option-item ${Number(index) === Number(question.correctOptionIndex) ? 'correct-option' : ''}`}>
                                                            {String.fromCharCode(65 + index)}. {option}
                                                            {Number(index) === Number(question.correctOptionIndex) && ' ✓'}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* --- 3. Release Test Tab (UPDATED) --- */}
                    {activeTab === 'release' && (
                        <form onSubmit={handleTestRelease} className="test-release-form">
                            <div className="input-group">
                                <label>Test Name</label>
                                <input type="text" value={testForm.testName} onChange={e => setTestForm(prev => ({ ...prev, testName: e.target.value }))} placeholder="e.g., Midterm Exam, Quiz 1" required />
                            </div>

                            <div className="input-group">
                                <label>Release Options</label>
                                <div className="release-options">
                                    <div className="release-option">
                                        <input type="radio" id="release-now" name="releaseOption" value="now" checked={testForm.releaseOption === 'now'} onChange={e => setTestForm(prev => ({ ...prev, releaseOption: e.target.value }))} />
                                        <label htmlFor="release-now">Release Now</label>
                                    </div>
                                    <div className="release-option">
                                        <input type="radio" id="release-schedule" name="releaseOption" value="schedule" checked={testForm.releaseOption === 'schedule'} onChange={e => setTestForm(prev => ({ ...prev, releaseOption: e.target.value }))} />
                                        <label htmlFor="release-schedule">Schedule Release</label>
                                    </div>
                                </div>
                            </div>
                            {testForm.releaseOption === 'schedule' && (
                                <div className="form-row">
                                    <div className="input-group">
                                        <label>Date</label>
                                        <input type="date" value={testForm.scheduledDate} onChange={e => setTestForm(prev => ({ ...prev, scheduledDate: e.target.value }))} min={minDate} required />
                                    </div>
                                    <div className="input-group">
                                        <label>Time</label>
                                        <input type="time" value={testForm.scheduledTime} onChange={e => setTestForm(prev => ({ ...prev, scheduledTime: e.target.value }))} required />
                                    </div>
                                </div>
                            )}
                            <div className="input-group">
                                <label>Duration (minutes)</label>
                                <input type="number" value={testForm.durationMinutes} onChange={e => setTestForm(prev => ({ ...prev, durationMinutes: e.target.value }))} min="1" required />
                            </div>

                            {/* --- END DATE/TIME SECTION --- */}
                            <div className="input-group">
                                <label>Test Expiry/End Options</label>
                                <div className="release-options">
                                    <div className="release-option">
                                        <input type="radio" id="end-none" name="endOption" value="none" checked={testForm.endOption === 'none'} onChange={e => setTestForm(prev => ({ ...prev, endOption: e.target.value }))} />
                                        <label htmlFor="end-none">No Fixed End</label>
                                    </div>
                                    <div className="release-option">
                                        <input type="radio" id="end-schedule" name="endOption" value="schedule" checked={testForm.endOption === 'schedule'} onChange={e => setTestForm(prev => ({ ...prev, endOption: e.target.value }))} />
                                        <label htmlFor="end-schedule">Schedule End Time</label>
                                    </div>
                                </div>
                            </div>

                            {testForm.endOption === 'schedule' && (
                                <div className="form-row">
                                    <div className="input-group">
                                        <label>End Date</label>
                                        <input type="date" value={testForm.endDate} onChange={e => setTestForm(prev => ({ ...prev, endDate: e.target.value }))} min={minDate} required />
                                    </div>
                                    <div className="input-group">
                                        <label>End Time</label>
                                        <input type="time" value={testForm.endTime} onChange={e => setTestForm(prev => ({ ...prev, endTime: e.target.value }))} required />
                                    </div>
                                </div>
                            )}

                            <div className="input-group">
                                <label>Question Selection Method</label>
                                <div className="release-options">
                                    <div className="release-option">
                                        <input type="radio" id="type-whole" name="releaseType" value="whole-pool" checked={testForm.releaseType === 'whole-pool'} onChange={e => setTestForm(prev => ({ ...prev, releaseType: e.target.value }))} />
                                        <label htmlFor="type-whole">Release Whole Pool(s)</label>
                                    </div>
                                    <div className="release-option">
                                        <input type="radio" id="type-random" name="releaseType" value="random" checked={testForm.releaseType === 'random'} onChange={e => setTestForm(prev => ({ ...prev, releaseType: e.target.value }))} />
                                        <label htmlFor="type-random">Randomly Sample Questions</label>
                                    </div>
                                </div>
                            </div>

                            <div className="input-group">
                                <label>Select Source Pool(s) for Test</label>
                                <div className="questions-list" style={{
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    padding: '0.75rem',
                                    backgroundColor: '#ffffff',
                                    maxHeight: '180px',
                                    overflowY: 'auto'
                                }}>
                                    {pools.length === 0 ? (<p>No pools available. Please create pools first.</p>) : (
                                        pools.map(pool => {
                                            const poolQuestionCount = questions.filter(q => q.poolId === pool.id).length;
                                            return (
                                                <label key={pool.id} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    backgroundColor: '#f9fafb',
                                                    border: '1px solid #e5e7eb',
                                                    borderRadius: '8px',
                                                    padding: '0.6rem 1rem',
                                                    marginBottom: '0.5rem',
                                                    cursor: 'pointer'
                                                }} >
                                                    <span style={{ flexGrow: 1 }}>{pool.poolName} ({poolQuestionCount} Qs)</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={testForm.selectedPoolIds.includes(pool.id)}
                                                        onChange={e => setTestForm(prev => ({
                                                            ...prev,
                                                            selectedPoolIds: e.target.checked
                                                                ? [...prev.selectedPoolIds, pool.id]
                                                                : prev.selectedPoolIds.filter(id => id !== pool.id)
                                                        }))}
                                                    />
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                                {!testForm.selectedPoolIds.length && <p style={{ color: 'red', fontSize: '0.8em' }}>Select at least one pool.</p>}
                            </div>

                            {/* --- RANDOM SELECTION OPTIONS (Conditional) --- */}
                            {testForm.releaseType === 'random' && (
                                <>
                                    <div className="input-group">
                                        <label className="custom-dist-toggle">
                                            <input
                                                type="checkbox"
                                                checked={testForm.customPoolDistribution}
                                                onChange={e =>
                                                    setTestForm(prev => ({
                                                        ...prev,
                                                        customPoolDistribution: e.target.checked,
                                                        poolQuestionMap: {} // Reset map on toggle
                                                    }))
                                                }
                                            />
                                            &nbsp;Enable Granular Distribution (Set Easy/Medium/Hard per Pool)
                                        </label>
                                    </div>

                                    {/* --- MODE A: STANDARD GLOBAL DISTRIBUTION --- */}
                                    {!testForm.customPoolDistribution && (
                                        <>
                                            <div className="input-group">
                                                <label>Total Questions to Release</label>
                                                <input
                                                    type="number"
                                                    value={testForm.totalQuestions}
                                                    onChange={e => setTestForm(prev => ({ ...prev, totalQuestions: e.target.value }))}
                                                    min="1"
                                                    required={!testForm.customPoolDistribution}
                                                />
                                            </div>

                                            <div className="input-group">
                                                <label>Global Difficulty Distribution (%)</label>
                                                <div className="form-row difficulty-distribution">
                                                    {difficulties.map(d => (
                                                        <div className="input-group-third" key={d}>
                                                            <label>{d}</label>
                                                            <input
                                                                type="number"
                                                                value={testForm.difficultyDistribution[d.toLowerCase()]}
                                                                onChange={e => setTestForm(prev => ({
                                                                    ...prev,
                                                                    difficultyDistribution: {
                                                                        ...prev.difficultyDistribution,
                                                                        [d.toLowerCase()]: Number(e.target.value)
                                                                    }
                                                                }))}
                                                                min="0"
                                                                max="100"
                                                                required={!testForm.customPoolDistribution}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                                <p style={{ fontSize: '0.8em', color: testForm.difficultyDistribution.easy + testForm.difficultyDistribution.medium + testForm.difficultyDistribution.hard !== 100 ? 'red' : 'green' }}>
                                                    Total: {testForm.difficultyDistribution.easy + testForm.difficultyDistribution.medium + testForm.difficultyDistribution.hard}% (Must be 100%)
                                                </p>
                                            </div>
                                        </>
                                    )}

                                    {/* --- MODE B: CUSTOM GRANULAR DISTRIBUTION --- */}
                                    {testForm.customPoolDistribution && (
                                        <div className="pool-distribution-box">
                                            <p style={{marginBottom: '10px', fontSize: '0.9rem', color: '#666'}}>Specify the exact number of questions to pull from each pool by difficulty.</p>
                                            
                                            {pools
                                                .filter(pool => testForm.selectedPoolIds.includes(pool.id))
                                                .map(pool => {
                                                    const inventory = getPoolInventory(pool.id);
                                                    const currentCounts = testForm.poolQuestionMap[pool.id] || { easy: 0, medium: 0, hard: 0 };

                                                    return (
                                                        <div key={pool.id} style={{ 
                                                            marginBottom: '15px', 
                                                            padding: '15px', 
                                                            background: '#fff', 
                                                            border: '1px solid #ddd', 
                                                            borderRadius: '8px',
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                                        }}>
                                                            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'8px'}}>
                                                                <strong style={{ color: '#D22D64' }}>{pool.poolName}</strong>
                                                                <span style={{fontSize:'0.85rem', color:'#666'}}>Total Available: {inventory.easy + inventory.medium + inventory.hard}</span>
                                                            </div>
                                                            
                                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                                                {['Easy', 'Medium', 'Hard'].map(diff => {
                                                                    const dKey = diff.toLowerCase();
                                                                    const max = inventory[dKey];
                                                                    const val = currentCounts[dKey] || 0;
                                                                    const isError = val > max;

                                                                    return (
                                                                        <div key={diff} style={{ flex: 1, minWidth: '80px' }}>
                                                                            <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px', color: isError ? 'red' : '#374151' }}>
                                                                                {diff} (Max: {max})
                                                                            </label>
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                max={max}
                                                                                value={val || ''}
                                                                                placeholder="0"
                                                                                style={{ 
                                                                                    width: '100%', 
                                                                                    padding: '6px',
                                                                                    borderRadius: '4px',
                                                                                    border: isError ? '1px solid red' : '1px solid #ccc',
                                                                                    backgroundColor: isError ? '#fff5f5' : '#fff'
                                                                                }}
                                                                                onChange={e => {
                                                                                    const newVal = Math.max(0, parseInt(e.target.value) || 0);
                                                                                    setTestForm(prev => ({
                                                                                        ...prev,
                                                                                        poolQuestionMap: {
                                                                                            ...prev.poolQuestionMap,
                                                                                            [pool.id]: {
                                                                                                ...prev.poolQuestionMap[pool.id],
                                                                                                [dKey]: newVal
                                                                                            }
                                                                                        }
                                                                                    }));
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            
                                            <div style={{ 
                                                marginTop: '15px', 
                                                padding: '10px', 
                                                backgroundColor: '#f8fafc', 
                                                borderTop: '1px dashed #e2e8f0',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <span>Total Questions to Release:</span>
                                                <strong style={{ fontSize: '1.2rem', color: '#D22D64' }}>
                                                    {Object.values(testForm.poolQuestionMap).reduce((acc, pool) => 
                                                        acc + (pool.easy || 0) + (pool.medium || 0) + (pool.hard || 0), 0
                                                    )}
                                                </strong>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            <button
                                type="submit"
                                disabled={isSubmitting || testForm.selectedPoolIds.length === 0}
                                className="btn btn-success btn-full"
                            >
                                {isSubmitting ? 'Releasing...' :
                                    testForm.releaseType === 'random' ? 'Release Random Test' : 'Release Whole Pool Test'}
                            </button>
                        </form>
                    )}

                    {/* --- 4. Analytics Tab --- */}
                    {activeTab === 'analytics' && (
                        <div className="analytics-dashboard">
                            {isLoadingAnalytics ? (
                                <div className="message">Loading analytics...</div>
                            ) : selectedStudent ? (
                                <div className="student-analytics-view">
                                    <button
                                        onClick={clearStudentAnalytics}
                                        className="btn btn-secondary"
                                        style={{ marginBottom: '1rem' }}
                                    >
                                        ← Back to Course Analytics
                                    </button>
                                    <h3>Student Analysis: {studentAnalytics?.studentName || selectedStudent.substring(0, 8)}</h3>
                                    {studentAnalytics && (
                                        <div className="student-analytics-content">
                                            <div className="kpi-grid">
                                                <div className="kpi-card">
                                                    <h4>Average Score</h4>
                                                    <p className="kpi-value">{studentAnalytics.averageScore.toFixed(1)}%</p>
                                                </div>
                                                <div className="kpi-card">
                                                    <h4>Tests Completed</h4>
                                                    <p className="kpi-value">{studentAnalytics.totalTests}</p>
                                                </div>
                                            </div>
                                            <div className="analytics-card">
                                                <h4>Improvement Trend</h4>
                                                <div className="chart-container" style={{ height: '250px' }}>
                                                    <Line
                                                        data={{
                                                            labels: studentAnalytics.improvementTrend.map(t => `Test ${t.attempt}`),
                                                            datasets: [{
                                                                label: 'Score',
                                                                data: studentAnalytics.improvementTrend.map(t => t.score),
                                                                fill: false,
                                                                borderColor: '#007bff',
                                                                tension: 0.1
                                                            }]
                                                        }}
                                                        options={{
                                                            responsive: true,
                                                            maintainAspectRatio: false,
                                                            scales: { y: { beginAtZero: true, max: 100 } }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="analytics-row">
                                                <div className="analytics-card">
                                                    <h4>Topic Strengths</h4>
                                                    {studentAnalytics.topicStrengths?.map((topic, index) => (
                                                        <div key={index} className="topic-performance-item">
                                                            <div className="topic-header"><span>{topic.topic}</span><span>{topic.percentage.toFixed(1)}%</span></div>
                                                            <div className="progress-bar-container"><div className="progress-bar progress-good" style={{ width: `${topic.percentage}%` }}></div></div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="analytics-card">
                                                    <h4>Topic Weaknesses</h4>
                                                    {studentAnalytics.topicWeaknesses?.map((topic, index) => (
                                                        <div key={index} className="topic-performance-item">
                                                            <div className="topic-header"><span>{topic.topic}</span><span>{topic.percentage.toFixed(1)}%</span></div>
                                                            <div className="progress-bar-container"><div className="progress-bar progress-bad" style={{ width: `${topic.percentage}%` }}></div></div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="course-analytics-view">
                                    <h3>Course Analytics - {selectedSubject.name}</h3>
                                    {analytics && analytics.totalAttempts > 0 ? (
                                        <div className="analytics-content">
                                            <div className="kpi-grid">
                                                <div className="kpi-card"><h4>Total Tests</h4><p className="kpi-value">{analytics.totalTests}</p></div>
                                                <div className="kpi-card"><h4>Total Attempts</h4><p className="kpi-value">{analytics.totalAttempts}</p></div>
                                                <div className="kpi-card"><h4>Average Score</h4><p className="kpi-value">{analytics.averageScore.toFixed(1)}%</p></div>
                                                <div className="kpi-card"><h4>Pass Rate (&gt;50%)</h4><p className="kpi-value">{analytics.passRate.toFixed(1)}%</p></div>
                                            </div>
                                            {analytics.topicPerformance && Object.values(analytics.topicPerformance).length > 0 && (
                                                <div className="analytics-card">
                                                    <h4>Overall Topic Performance</h4>
                                                    <div className="chart-container" style={{ height: '300px' }}>
                                                        <Bar
                                                            data={{
                                                                labels: Object.values(analytics.topicPerformance).map(t => t.topic),
                                                                datasets: [{
                                                                    label: 'Average Score %',
                                                                    data: Object.values(analytics.topicPerformance).map(t => t.averageScore),
                                                                    backgroundColor: Object.values(analytics.topicPerformance).map(t => t.averageScore >= 70 ? 'rgba(40, 167, 69, 0.7)' : t.averageScore >= 50 ? 'rgba(255, 193, 7, 0.7)' : 'rgba(220, 53, 69, 0.7)')
                                                                }]
                                                            }}
                                                            options={{
                                                                responsive: true,
                                                                maintainAspectRatio: false,
                                                                plugins: { legend: { display: false } },
                                                                scales: { y: { beginAtZero: true, max: 100 } }
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            {analytics.studentPerformance?.length > 0 && (
                                                <div className="analytics-card">
                                                    <h4>Student Leaderboard</h4>
                                                    <div className="students-list">
                                                        {analytics.studentPerformance.sort((a, b) => b.averageScore - a.averageScore).map((student) => (
                                                            <div key={student.studentId} className="student-item">
                                                                <div className="student-info"><strong>
                                                                    {student.studentName || 'Student'}
                                                                    {student.studentRollNo ? ` (${student.studentRollNo})` : ` (${student.studentId.substring(0, 8)})`}
                                                                </strong>
                                                                    <span> attempts- {student.attempts}</span></div>
                                                                <div className="student-scores"><span>Avg: {student.averageScore.toFixed(1)}%</span><button onClick={() => fetchStudentAnalytics(student.studentId)} className="btn btn-primary btn-sm">View Details</button></div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="message info-message">
                                            <h4>No Attempts Recorded Yet</h4>
                                            <p>Analytics will appear here once students begin to complete tests for {selectedSubject.name}.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tests List (Displayed outside the analytics tab) */}
                    {!['analytics', 'scores'].includes(activeTab) && tests.length > 0 && (

                        <div style={{ marginTop: '2rem' }}>
                            <h3>Released Tests ({tests.length})</h3>
                            <div className="tests-grid">
                                {tests.map(test => (
                                    <div key={test.id} className="test-card">
                                        <div className="test-header">
                                            <h4>{test.testName}</h4>
                                            <span className={`test-status ${test.status === 'active' ? 'status-active' :
                                                test.status === 'completed' ? 'status-completed' :
                                                    test.status === 'scheduled' ? 'status-scheduled' : 'status-inactive'
                                                }`}>
                                                {test.status}
                                            </span>
                                        </div>
                                        <div className="test-details">
                                            <p>
  Questions:{" "}
  {test.totalQuestions ??
    test.questionCount ??
    test.questionIds?.length ??
    0}
</p>

                                            <p>Duration: {test.durationMinutes} minutes</p>
                                            {test.scheduledFor && (<p>Scheduled Start: {new Date(test.scheduledFor).toLocaleString()}</p>)}
                                            {test.scheduledEnd && (<p style={{ fontWeight: 'bold' }}>Scheduled End: {new Date(test.scheduledEnd).toLocaleString()}</p>)}
                                            <p>Created: {new Date(test.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* --- 5. Scores Tab --- */}
{activeTab === 'scores' && (
    <div className="analytics-dashboard">
        {!selectedTestForScores ? (
            <>
                <h3>Test Scores - {selectedSubject.name}</h3>

                <div className="tests-grid">
                    {tests.length === 0 ? (
                        <p>No tests released yet.</p>
                    ) : (
                        tests.map(test => (
                            <div
                                key={test.id}
                                className="test-card"
                                style={{ cursor: 'pointer' }}
                                onClick={() => fetchTestScores(test.id)}
                            >
                                <div className="test-header">
                                    <h4>{test.testName}</h4>
                                    <span className={`test-status status-${test.status}`}>
                                        {test.status}
                                    </span>
                                </div>
                                <div className="test-details">
                                    <p>Duration: {test.durationMinutes} minutes</p>
                                    <p> Total Possible Attempts: {
                                        analytics?.studentPerformance
                                            ?.filter(s => s.attempts > 0).length || 0
                                    }</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </>
        ) : (
            <>
                <button
                    className="btn btn-secondary"
                    onClick={() => {
                        setSelectedTestForScores(null);
                        setTestScores([]);
                    }}
                >
                    ← Back to Tests
                </button>

                <h3 style={{ marginTop: '1rem' }}>
  Student Scores ({testScores.length} attempts)
</h3>


                {isLoadingAnalytics ? (
                    <p>Loading scores...</p>
                ) : testScores.length === 0 ? (
                    <p>No students have completed this test yet.</p>
                ) : (
                    <div className="analytics-card">
                        <div className="students-list">
                            {testScores
                                .sort((a, b) => b.score - a.score)
                                .map(student => (
                                    <div key={student.studentId} className="student-item">
                                        <div className="student-info">
                                            <strong>
                                                {student.studentName}
                                                {student.studentRollNo
                                                    ? ` (${student.studentRollNo})`
                                                    : ''}
                                            </strong>
                                        </div>
                                        <div className="student-scores">
                                            <span>{student.score.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
            </>
        )}
    </div>
)}

                </div>
                 )}
            </main>

        </div>
    );
}

export default FacultyDashboard;