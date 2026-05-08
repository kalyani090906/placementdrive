// frontend/src/components/Results.jsx
import React from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

// Register Chart.js components, which is required for Chart.js v3+
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const ResultsScreen = ({ results, onBack }) => {
    const { score, analysis, testName } = results;

    // Calculate total questions from the analysis object
    const totalQuestions = Object.values(analysis).reduce((sum, topic) => sum + topic.total, 0);
    const correctAnswers = Math.round((score / 100) * totalQuestions);
    const incorrectAnswers = totalQuestions - correctAnswers;

    // Function to determine the color of the progress bar based on score
    const getPathColor = (scoreValue) => {
        if (scoreValue >= 75) return `#28a745`; // Green for high scores
        if (scoreValue >= 50) return `#ffc107`; // Yellow for medium scores
        return `#dc3545`; // Red for low scores
    };

    // Prepare data for the Bar chart for topic-wise performance
    const chartData = {
        labels: Object.keys(analysis),
        datasets: [
            {
                label: 'Score %',
                data: Object.values(analysis).map(topic => (topic.correct / topic.total) * 100),
                backgroundColor: 'rgba(75, 192, 192, 0.7)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
            },
        ],
    };

    const chartOptions = {
        indexAxis: 'y', // Makes the bar chart horizontal
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            title: {
                display: true,
                text: 'Topic-wise Performance',
                font: { size: 18 },
                color: '#333'
            },
        },
        scales: {
            x: {
                beginAtZero: true,
                max: 100,
                ticks: {
                    callback: value => value + '%',
                },
            },
            y: {
                ticks: {
                    color: '#333',
                    font: {
                        size: 12
                    }
                }
            }
        },
    };

    return (
        <div className="results-container">
            <h1 className="results-header">Test Analysis: {testName || 'Results'}</h1>
            
            <div className="results-grid">
                {/* Score Summary Card */}
                <div className="card score-summary-card">
                    <h2 className="card-title">Overall Score</h2>
                    <div style={{ width: '170px', margin: '20px auto' }}>
                        <CircularProgressbar
                            value={score}
                            text={`${score.toFixed(1)}%`}
                            styles={buildStyles({
                                rotation: 0.25,
                                strokeLinecap: 'round',
                                textSize: '18px',
                                pathTransitionDuration: 0.5,
                                pathColor: getPathColor(score),
                                textColor: getPathColor(score),
                                trailColor: '#e9ecef',
                            })}
                        />
                    </div>
                    <div className="score-details">
                        <div className="score-detail-item">
                            <span>Total Questions</span>
                            <strong>{totalQuestions}</strong>
                        </div>
                        <div className="score-detail-item">
                            <span className="correct-text">Correct Answers</span>
                            <strong className="correct-text">{correctAnswers}</strong>
                        </div>
                         <div className="score-detail-item">
                            <span className="incorrect-text">Incorrect Answers</span>
                            <strong className="incorrect-text">{incorrectAnswers}</strong>
                        </div>
                    </div>
                </div>

                {/* Topic Performance Card */}
                <div className="card topic-performance-card">
                    <h2 className="card-title">Topic Breakdown</h2>
                    <div className="chart-container">
                         <Bar options={chartOptions} data={chartData} />
                    </div>
                </div>
            </div>

             <button onClick={onBack} className="btn btn-primary btn-full" style={{marginTop: '20px'}}>
                Back to Dashboard
            </button>
        </div>
    );
};

export default ResultsScreen;