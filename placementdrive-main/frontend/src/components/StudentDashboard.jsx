// frontend/src/components/StudentDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import TestScreen from './Test.js';
import ResultsScreen from './Results.jsx';
import ReviewScreen from './ReviewScreen.jsx'; 
import { collection, query, where, getDocs } from "firebase/firestore"; 
import { 
    EmailAuthProvider, 
    reauthenticateWithCredential, 
    updatePassword 
} from "firebase/auth"; 
import { db, auth } from '../firebase.js'; 

// CHART.JS IMPORTS
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { API_URL } from '../api';


ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

//const API_URL = 'http://172.29.23.168:5000';

const MOCK_COURSES = [
    { id: 'dsa', name: 'Data Structures & Algorithms', icon: '🧩' },
    { id: 'os', name: 'Operating Systems', icon: '💻' },
    { id: 'cn', name: 'Computer Networks', icon: '🌐' },
    { id: 'dbms', name: 'DBMS', icon: '💾' },
    { id: 'oops', name: 'OOPS', icon: '🔷' },
    { id: 'c', name: 'C', icon: '🔤' },
];

function StudentDashboard({ user, onLogout }) {
    const [currentScreen, setCurrentScreen] = useState('subjects');
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [testData, setTestData] = useState(null);
    const [testResults, setTestResults] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [reviewData, setReviewData] = useState(null);

    // Profile & Password States
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [passwords, setPasswords] = useState({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const [availableTests, setAvailableTests] = useState([]);
    const [missedTests, setMissedTests] = useState([]); 
    const [testHistory, setTestHistory] = useState({}); 

    // --- DATA FETCHING LOGIC ---
    const fetchAllTestData = useCallback(async (courseId) => {
        if (!user?.uid || !courseId) return;
        setIsLoading(true);
        setError('');

        try {
            const availableResponse = await fetch(`${API_URL}/tests/available`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: user.uid }),
            });
            
            if (!availableResponse.ok) throw new Error("Failed to fetch available tests.");
            const tests = await availableResponse.json();
            setAvailableTests(tests.filter(t => t.courseId === courseId)); 

            const historyResponse = await fetch(`${API_URL}/tests/history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: user.uid }),
            });
            if (!historyResponse.ok) throw new Error("Failed to fetch test history.");
            const historyData = await historyResponse.json();
            const courseHistory = historyData[courseId] || [];
            setTestHistory(historyData); 
            
            const testsRef = collection(db, 'tests');
            const q = query(testsRef, where('courseId', '==', courseId));
            const querySnapshot = await getDocs(q);
            const allFacultyTests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const completedTestIds = new Set(courseHistory.map(t => t.originalTestId));
            const now = new Date();
            const missed = allFacultyTests.filter(test => {
                const isInactive = test.status === 'inactive';
                const isExpired = test.scheduledEnd && new Date(test.scheduledEnd) <= now;
                const isCompleted = completedTestIds.has(test.id);
                return (isInactive || isExpired) && !isCompleted; 
            });
            
            setMissedTests(missed);
        } catch (err) {
            console.error('Error fetching all test data:', err);
            setError('Error fetching tests: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        if (selectedCourse) {
            fetchAllTestData(selectedCourse.id);
        }
    }, [selectedCourse, fetchAllTestData]);

    // --- PASSWORD CHANGE HANDLER ---
    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (passwords.newPassword !== passwords.confirmPassword) {
            setError("New passwords do not match.");
            setIsLoading(false);
            return;
        }

        try {
            const currentUser = auth.currentUser;
            const credential = EmailAuthProvider.credential(currentUser.email, passwords.oldPassword);
            
            // Step 1: Re-authenticate
            await reauthenticateWithCredential(currentUser, credential);
            
            // Step 2: Update Password
            await updatePassword(currentUser, passwords.newPassword);

            alert("Password updated successfully!");
            setPasswords({ oldPassword: '', newPassword: '', confirmPassword: '' });
            setCurrentScreen('subjects');
        } catch (err) {
            setError(err.code === 'auth/wrong-password' ? "Current password is incorrect." : err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // --- NAVIGATION HANDLERS ---
    const handleSubjectSelect = (course) => {
        setSelectedCourse(course);
        setCurrentScreen('tests');
    };

    const handleBackToSubjects = () => {
        setSelectedCourse(null);
        setCurrentScreen('subjects');
        setAvailableTests([]);
        setMissedTests([]);
    };

    const resetToDashboard = () => {
        setCurrentScreen('subjects'); 
        setTestData(null);
        setTestResults(null);
        setError('');
        if (user) fetchAllTestData(selectedCourse?.id || null);
    };
    
    const viewTestReview = async (testId) => {
      setIsLoading(true);
      setError('');
      try {
        const isMissed = missedTests.some(test => test.id === testId);
        let endpoint = isMissed 
            ? `${API_URL}/tests/missed-details/${testId}` 
            : `${API_URL}/results/${testId}`;

        const response = await fetch(endpoint); 
        if (!response.ok) throw new Error('Failed to fetch review data.');

        const data = await response.json();
        setReviewData(data);
        setCurrentScreen('review');
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    
    const startTest = async (testId) => {
        setIsLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_URL}/tests/start-specific`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: user.uid, testId }),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                fetchAllTestData(selectedCourse.id); 
                throw new Error(errorData.message || 'Failed to start test.');
            }
            
            const data = await response.json();
            setTestData(data);
            setCurrentScreen('test');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const submitTest = useCallback(async (answers) => {
        setIsLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_URL}/tests/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ testId: testData.testId, answers }),
            });
            if (!response.ok) throw new Error(`Failed to submit test.`);
            const results = await response.json();
            setTestResults(results);
            setCurrentScreen('results');
            fetchAllTestData(selectedCourse.id);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [testData?.testId, selectedCourse?.id, fetchAllTestData]);


    // --- RENDERING VIEWS ---

    const renderSubjectSelection = () => (
        <div className="card">
            <h2>Welcome, {user.name}!</h2>
            <p>Select a subject to view available tests</p>
            <div className="subjects-grid">
                {MOCK_COURSES.map(course => (
                    <div key={course.id} className="subject-card" onClick={() => handleSubjectSelect(course)}>
                        <div className="subject-icon">{course.icon}</div>
                        <h3>{course.name}</h3>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderChangePassword = () => (
        <div className="card" style={{maxWidth: '500px', margin: '2rem auto'}}>
            <h2>Security</h2>
            <p style={{color: '#6b7280', marginBottom: '1.5rem'}}>Update your account password below.</p>
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
                <div style={{display: 'flex', gap: '1rem', marginTop: '2rem'}}>
                    <button type="submit" className="btn btn-primary">Update Password</button>
                    <button type="button" onClick={() => setCurrentScreen('subjects')} className="btn btn-secondary">Cancel</button>
                </div>
            </form>
        </div>
    );

    const renderTestsForSubject = () => {
        if (!selectedCourse) return null;
        const courseTests = availableTests.filter(test => test.courseId === selectedCourse.id);
        let courseHistory = testHistory[selectedCourse.id] || [];

        const sortedHistory = [...courseHistory].sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
        const improvementTrendData = {
            labels: sortedHistory.map((t, index) => `${t.testName} (${index + 1})`),
            datasets: [{
                label: 'Score',
                data: sortedHistory.map(t => t.score),
                borderColor: '#D22D64',
                tension: 0.1,
                pointBackgroundColor: '#D22D64', 
                pointRadius: 5
            }]
        };

        return (
            <div>
                <div className="card" style={{marginBottom: '2rem'}}>
                    <button onClick={handleBackToSubjects} className="btn btn-secondary" style={{marginBottom: '1rem'}}>← Back to Subjects</button>
                    <h2>{selectedCourse.name} Tests</h2>
                </div>
                
                <div className="card">
                    <h3>Available Tests</h3>
                    <div className="student-tests">
                        {courseTests.length > 0 ? (
                            courseTests.map(test => (
                                <div key={test.id} className="test-card">
                                    <div className="test-header">
                                        <h4>{test.testName}</h4>
                                        <span className="test-status status-active">Available</span>
                                    </div>
                                    <div className="test-details">
                                        <p>Duration: {test.durationMinutes} mins</p>
                                        {test.scheduledEnd && <p style={{fontWeight: 'bold', color: '#D22D64'}}>Ends: {new Date(test.scheduledEnd).toLocaleString()}</p>}
                                    </div>
                                    <button onClick={() => startTest(test.id)} className="btn btn-primary">Start Test</button>
                                </div>
                            ))
                        ) : <p>No tests available.</p>}
                    </div>
                </div>

                <div className="card" style={{marginTop: '2rem'}}>
  <h3>Missed Tests ({missedTests.length})</h3>
  <div className="student-tests">
    {missedTests.length > 0 ? (
      missedTests.map(test => (
        <div key={test.id} className="test-card missed-test-card">
          <div className="test-header">
            <h4>{test.testName}</h4>
            <span className="test-status status-inactive">MISSED</span>
          </div>

          {Array.isArray(test.questionIds) ? (
  <button
    onClick={() => viewTestReview(test.id)}
    className="btn btn-secondary btn-sm"
  >
    View Questions
  </button>
) : (
  <button
    disabled
    className="btn btn-secondary btn-sm"
    title="Randomized tests cannot be reviewed"
    style={{ opacity: 0.6, cursor: 'not-allowed' }}
  >
    Review Unavailable
  </button>
)}


        </div>
      ))
    ) : <p>No missed tests found.</p>}
  </div>
</div>


                {courseHistory.length > 0 && (
                    <div className="card" style={{marginTop: '2rem'}}>
                        <h3>Test History</h3>
                        <div className="test-history">
                            {courseHistory.map(h => (
                                <div key={h.testId} className="history-item" onClick={() => viewTestReview(h.testId)}>
                                    <div><strong>{h.testName}</strong><p>{new Date(h.completedAt).toLocaleDateString()}</p></div>
                                    <span className="score-badge">{h.score.toFixed(2)}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {courseHistory.length >= 2 && (
                    <div className="card" style={{marginTop: '2rem'}}>
                        <h3>Improvement Trend</h3>
                        <div style={{height: '300px'}}><Line data={improvementTrendData} options={{ responsive: true, maintainAspectRatio: false }} /></div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="app-container">
            <nav className="navbar">
                <h1>Student Dashboard</h1>
                <div className="profile-container">
                    <div className="profile-trigger" onClick={() => setShowProfileMenu(!showProfileMenu)}>
                        <span className="user-name-nav">{user.name}</span>
                        <div className="profile-icon-nav">👤</div>
                    </div>
                    {showProfileMenu && (
                        <div className="profile-dropdown">
                            <button onClick={() => { setCurrentScreen('change-password'); setShowProfileMenu(false); }}>🔒 Change Password</button>
                            <button onClick={onLogout} className="logout-opt">🚪 Logout</button>
                        </div>
                    )}
                </div>
            </nav>

            <main className="main-content">
                {isLoading && <div className="message">Processing...</div>}
                {error && <div className="message error-message">{error}</div>}

                {currentScreen === 'subjects' && renderSubjectSelection()}
                {currentScreen === 'change-password' && renderChangePassword()}
                {currentScreen === 'tests' && renderTestsForSubject()}
                {currentScreen === 'test' && testData && <TestScreen testData={testData} onTestSubmit={submitTest} />}
                {currentScreen === 'results' && testResults && <ResultsScreen results={testResults} onBack={resetToDashboard} />}
                {currentScreen === 'review' && reviewData && <ReviewScreen reviewData={reviewData} onBack={() => setCurrentScreen('tests')} />}
            </main>
        </div>
    );
}

export default StudentDashboard;