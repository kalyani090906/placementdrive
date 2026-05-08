import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../api';

const TestScreen = ({ testData, onTestSubmit }) => {
    // 1. Initialize answers from existing progress (if resuming)
    const [answers, setAnswers] = useState(testData.answers || {});
    
    // 2. Dynamic Timer Logic: Calculate time remaining based on startTime vs now
        const calculateTimeLeft = useCallback(() => {
        const start = new Date(testData.startTime).getTime();
        const now = new Date().getTime();
        const totalDurationMs = testData.durationMinutes * 60 * 1000;
        const elapsed = now - start;
        const remaining = Math.floor((totalDurationMs - elapsed) / 1000);
        return remaining > 0 ? remaining : 0;
    }, [testData.startTime, testData.durationMinutes]);

    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const [isAutoSubmitting, setIsAutoSubmitting] = useState(false);
    const hasSubmitted = useRef(false);

     // Memoize handleAutoSubmit
    const handleAutoSubmit = useCallback(() => {
        if (hasSubmitted.current) return;
        hasSubmitted.current = true;
        setIsAutoSubmitting(true);
        const timeoutMessage = document.getElementById('timeout-message');
        if (timeoutMessage) timeoutMessage.style.display = 'flex';
        setTimeout(() => onTestSubmit(answers), 4000);
    }, [onTestSubmit, answers]);



    // Timer Effect
    useEffect(() => {
        if (hasSubmitted.current) return;
        const timer = setInterval(() => {
            const remaining = calculateTimeLeft();
            setTimeLeft(remaining);
            if (remaining <= 0) {
                clearInterval(timer);
                handleAutoSubmit();
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [calculateTimeLeft, handleAutoSubmit]);

    // 3. AUTO-SAVE EFFECT: Sync answers to DB whenever they change
    useEffect(() => {
        const saveProgress = async () => {
            if (hasSubmitted.current || Object.keys(answers).length === 0) return;
            try {
                await fetch(`${API_URL}/tests/save-progress`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ testId: testData.testId, answers }),
                });
            } catch (err) {
                console.error("Failed to auto-sync progress:", err);
            }
        };

        // Optional: Debounce to prevent too many API calls
        const delayDebounce = setTimeout(saveProgress, 1000);
        return () => clearTimeout(delayDebounce);
    }, [answers, testData.testId]);



    const handleOptionChange = (qId, optIdx) => {
        if (hasSubmitted.current) return;
        setAnswers(prev => ({ ...prev, [qId]: optIdx }));
    };

    const formatTime = s => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    const handleSubmitClick = () => {
        if (!hasSubmitted.current) {
            hasSubmitted.current = true;
            onTestSubmit(answers);
        }
    };

    return (
        <div className="test-screen-container">
            <div id="timeout-message">
                <div className="timeout-card">
                    <div className="timeout-spinner"></div>
                    <h2 style={{ color: '#D22D64', margin: '0 0 1rem 0' }}>Time Expired!</h2>
                    <p>Securing your attempt...</p>
                    <div className="submitting-bar"><div className="submitting-progress"></div></div>
                </div>
            </div>

            <div className="sticky-test-header">
                <div className="test-header-flex">
                    <h1 className="test-title">{testData.testName}</h1>
                    <div className={`timer ${timeLeft < 60 ? 'timer-warning' : ''}`}>
                        {formatTime(timeLeft)}
                    </div>
                </div>
            </div>

            <div className="test-content-padding">
                <p style={{ color: '#6b7280' }}>Progress is saved automatically.</p>
                {testData.questions.map((q, index) => (
                    <div key={q.id} className="question-block">
                        <h3>{index + 1}. {q.questionText}</h3>
                        <div className="options-group">
                            {q.options.map((opt, i) => (
                                <label key={i} className={`option-label ${answers[q.id] === i ? 'selected' : ''}`}>
                                    <input 
                                        type="radio" 
                                        name={q.id} 
                                        checked={answers[q.id] === i} 
                                        onChange={() => handleOptionChange(q.id, i)} 
                                        disabled={isAutoSubmitting}
                                    />
                                    <span>{opt}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
                 <p style={{textAlign: 'center', marginTop: '1rem', marginBottom: '1rem', color: '#374151', fontWeight: 600}}>
                    {Object.keys(answers).length} of {testData.questions.length} Questions Answered
                </p>
                <button onClick={handleSubmitClick} className="btn btn-success btn-full" disabled={isAutoSubmitting}>
                    {isAutoSubmitting ? 'Submitting...' : 'Final Submit'}
                </button>
            </div>
        </div>
    );
};

export default TestScreen;