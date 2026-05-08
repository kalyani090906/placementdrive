// frontend/src/api.js

const getApiUrl = () => {
    // Get the hostname from the browser's current URL
    const hostname = window.location.hostname;
    
    // If accessing via localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:5000/api';
    }
    
    // If accessing via network IP (like 192.168.x.x or 10.x.x.x)
    // Use the same IP but with port 5000 for the backend
    return `http://${hostname}:5000/api`;
};

export const API_URL = getApiUrl();

console.log('🔧 API_URL configured as:', API_URL);
console.log('🔧 Current hostname:', window.location.hostname);

export const startTest = async (studentId, courseId) => {
    try {
        const response = await fetch(`${API_URL}/tests/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, courseId }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to start test.');
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
};

export const submitTest = async (testId, answers) => {
    try {
        const response = await fetch(`${API_URL}/tests/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ testId, answers }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to submit test.');
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
};

export const addQuestion = async (questionData) => {
    try {
        const response = await fetch(`${API_URL}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(questionData),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to add question.');
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
};

