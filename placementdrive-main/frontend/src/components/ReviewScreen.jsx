// frontend/src/components/ReviewScreen.jsx
import React from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

// Register Chart.js components, required for Chart.js v3+
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const ReviewScreen = ({ reviewData, onBack }) => {
  // CRITICAL CHECK: Ensure we have data and questions before proceeding
  if (!reviewData || !reviewData.questions || reviewData.questions.length === 0) return (
      <div className="card">
        <h2>No Review Data Available</h2>
        <p>The test details could not be loaded or the test was empty.</p>
        <button onClick={onBack} className="btn btn-primary" style={{ marginTop: '1rem' }}>Back to Dashboard</button>
      </div>
  );

  const { testName, score, questions, answers, analysis } = reviewData;

  // --- Analysis Calculations (Safeguarded) ---
  const safeScore = score || 0; // Use 0 if score is undefined (for missed tests)
  const totalQuestions = questions.length;
  const correctAnswers = Math.round((safeScore / 100) * totalQuestions);
  const incorrectAnswers = totalQuestions - correctAnswers;
  
  // Use safe analysis object for charts and logic ({} for missed tests)
  const safeAnalysis = analysis && Object.keys(analysis).length > 0 ? analysis : {};

  // Function to determine the color of the progress bar based on score
  const getPathColor = (scoreValue) => {
      if (scoreValue >= 75) return `#28a745`; // Green for high scores
      if (scoreValue >= 50) return `#ffc107`; // Yellow for medium scores
      return `#dc3545`; // Red for low scores
  };

  // Prepare data for the Bar chart for topic-wise performance
  const chartData = {
      labels: Object.keys(safeAnalysis), // Use safeAnalysis
      datasets: [
          {
              label: 'Score %',
              // Use safeAnalysis and ensure total > 0 before division
              data: Object.values(safeAnalysis).map(topic => (topic.total > 0 ? (topic.correct / topic.total) * 100 : 0)),
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
  // --- End of Analysis Calculations ---

  return (
    <div className="card">
      {/* Test Name Header */}
      <h1 className="results-title">{testName} – Review</h1>

      {/* Show special message for Missed Test */}
      {reviewData.status === 'missed' && (
          <div className="message error-message" style={{marginBottom: '20px', borderLeft: '5px solid #D22D64', textAlign: 'left', backgroundColor: '#fee2e2'}}>
              This test was missed (not attempted). The review below shows all questions and the correct answers.
          </div>
      )}
      
      {/* --- Analysis Section --- */}
      <div className="results-container">
          <div className="results-grid" style={{ gridTemplateColumns: '1fr 2fr' }}> 
              {/* Score Summary Card */}
              <div className="card score-summary-card" style={{ boxShadow: 'none' }}>
                  <h2 className="card-title">Overall Score</h2>
                  <div style={{ width: '170px', margin: '20px auto' }}>
                      <CircularProgressbar
                          value={safeScore} // Use safeScore
                          text={`${safeScore.toFixed(1)}%`} // Use safeScore
                          styles={buildStyles({
                              rotation: 0.25,
                              strokeLinecap: 'round',
                              textSize: '18px',
                              pathTransitionDuration: 0.5,
                              pathColor: getPathColor(safeScore),
                              textColor: getPathColor(safeScore),
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
              <div className="card topic-performance-card" style={{ boxShadow: 'none' }}>
                  <h2 className="card-title">Topic Breakdown {Object.keys(safeAnalysis).length === 0 ? '(N/A - Missed Test)' : ''}</h2>
                  <div className="chart-container" style={{ minHeight: '250px' }}>
                       {/* Only render chart if there is analysis data */}
                       {Object.keys(safeAnalysis).length > 0 ? (
                            <Bar options={chartOptions} data={chartData} />
                       ) : (
                            <p style={{textAlign: 'center', marginTop: '50px', color: '#6c757d'}}>No topic performance data available for this missed test.</p>
                       )}
                  </div>
              </div>
          </div>
      </div>
      {/* --- End Analysis Section --- */}

      <hr style={{margin: '30px 0', border: 'none', borderTop: '1px dashed #ccc'}} />

      {/* Detailed Question Review */}
      {questions.map((q, idx) => {
        const chosen = answers[q.id]; // Undefined for missed tests
        const correct = q.correctOptionIndex;

        return (
          <div key={q.id} className="question-block">
            <h3>{idx + 1}. {q.questionText}</h3>
            <div className="options-group">
              {q.options.map((opt, i) => {
                const isCorrect = Number(i) === Number(correct);
                const isChosen = Number(i) === Number(chosen);
                return (
                  <div
                    key={i}
                    className="option-label"
                    style={{
                      backgroundColor: isCorrect ? '#22c55e33' : isChosen && !isCorrect ? '#ef444433' : '',
                      fontWeight: isCorrect ? 'bold' : 'normal',
                      padding: '10px',
                      borderRadius: '4px',
                      marginBottom: '5px'
                    }}
                  >
                    {opt}{" "}
                    {isCorrect && '✅ (Correct Answer)'}
                    {isChosen && !isCorrect && '❌ (Your Answer)'}
                    {isChosen && isCorrect && '(Your Answer )'}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <button onClick={onBack} className="btn btn-primary btn-full" style={{ marginTop: '2rem' }}>
        Back to Dashboard
      </button>
    </div>
  );
};

export default ReviewScreen;