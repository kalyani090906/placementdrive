// backend/combined_backend.js
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const stream = require('stream');

// --- SETUP ---
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// IMPORTANT: Ensure you have a serviceAccountKey.json file in this directory
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const upload = multer({ storage: multer.memoryStorage() });


// --- HELPER FUNCTIONS ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Fetches user profiles (name and rollNo) for a given set of UIDs.
 * This helper is essential for displaying readable student information in analytics.
 */
async function fetchUserProfiles(userIds) {
    const userProfiles = new Map();
    if (userIds.length === 0) return userProfiles;

    // Remove duplicates and split into chunks of 10 for Firestore 'in' query limit
    const uniqueUserIds = [...new Set(userIds)];
    const chunks = [];
    for (let i = 0; i < uniqueUserIds.length; i += 10) {
        chunks.push(uniqueUserIds.slice(i, i + 10));
    }

    // Fetch user data in batches
    for (const chunk of chunks) {
        try {
            // Note: FieldPath.documentId() allows querying by document ID
            const usersSnapshot = await db.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
            usersSnapshot.docs.forEach(doc => {
                const data = doc.data();
                userProfiles.set(doc.id, {
                    name: data.name || 'Unknown User',
                    // Use the rollNo field, or extract from email as a fallback
                    rollNo: data.rollNo || (data.email ? data.email.split('@')[0] : null)
                });
            });
        } catch (error) {
            console.error("Error fetching user chunk:", error);
        }
    }
    return userProfiles;
}

// --- MIDDLEWARE ---
const verifyFirebaseToken = async (req, res, next) => {
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
        return res.status(401).send({ message: 'Authorization token missing.' });
    }
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            return res.status(403).send({ message: 'Forbidden: Admin access required.' });
        }
        req.user = decodedToken; // Make decoded token available in the request
        next();
    } catch (error) {
        console.error('Error verifying token:', error);
        res.status(403).send({ message: 'Invalid or expired token.' });
    }
};


// --- ADMIN MANAGEMENT ROUTES ---

// Admin Route: Create a single user
app.post('/api/admin/create-user', verifyFirebaseToken, async (req, res) => {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name || !role) {
        return res.status(400).send({ message: 'Missing fields. Required: email, password, name, role.' });
    }

    try {
        // 1. Create user in Firebase Authentication
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name,
        });

        // 2. Create user document in Firestore with their role
        await db.collection('users').doc(userRecord.uid).set({
            name: name,
            email: email,
            role: role,
        });

        res.status(201).send({ message: `Successfully created user ${name} (${email})` });

    } catch (error) {
        console.error('Error creating new user:', error);
        // Provide a more specific error message if the email is already in use
        if (error.code === 'auth/email-already-exists') {
            return res.status(409).send({ message: 'The email address is already in use by another account.' });
        }
        res.status(500).send({ message: 'Failed to create user.' });
    }
});


// Admin Route: Bulk Upload Users from CSV
app.post('/api/admin/upload-users', verifyFirebaseToken, upload.single('usersFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send({ message: 'No file uploaded.' });
    }

    const usersToCreate = [];
    const errors = [];
    let processedRowCount = 0;

    const readable = new stream.Readable();
    readable._read = () => { };
    readable.push(req.file.buffer);
    readable.push(null);

    readable.pipe(csv())
        .on('data', (row) => {
            processedRowCount++;
            // Assumes CSV headers: name, email, password, role
            const { name, email, password, role } = row;
            if (name && email && password && role) {
                usersToCreate.push({ name, email, password, role, row: processedRowCount });
            } else {
                errors.push(`Row ${processedRowCount}: Missing required data. Skipping.`);
            }
        })
        .on('end', async () => {
            if (usersToCreate.length === 0) {
                return res.status(400).send({
                    message: 'CSV file is empty or formatted incorrectly. Check headers: name, email, password, role.',
                    errors: errors
                });
            }

            let successCount = 0;
            for (const user of usersToCreate) {
                try {
                    const userRecord = await admin.auth().createUser({
                        email: user.email,
                        password: user.password,
                        displayName: user.name,
                    });
                    await db.collection('users').doc(userRecord.uid).set({
                        name: user.name,
                        email: user.email,
                        role: user.role,
                    });
                    successCount++;
                } catch (error) {
                    let errorMessage = `Row ${user.row} (${user.email}): Failed to create user.`;
                    if (error.code === 'auth/email-already-exists') {
                        errorMessage += ' Reason: Email already exists.';
                    } else {
                        errorMessage += ` Reason: ${error.message}`;
                    }
                    errors.push(errorMessage);
                }
            }

            res.status(201).send({
                message: `Bulk upload complete. Successfully created ${successCount} of ${usersToCreate.length} users.`,
                errors: errors
            });
        })
        .on('error', (err) => {
            console.error("CSV Parsing Error:", err);
            res.status(500).send({ message: 'Failed to parse the CSV file.' });
        });
});


// --- QUESTION POOL MANAGEMENT ROUTES ---

// Faculty Route: Create a new Question Pool
app.post('/api/pools', async (req, res) => {
    try {
        const { courseId, poolName, createdBy } = req.body;

        if (!courseId || !poolName || !createdBy) {
            return res.status(400).send({ message: "Missing required fields (courseId, poolName, createdBy)." });
        }

        const poolRef = await db.collection('pools').add({
            courseId,
            poolName,
            createdBy,
            createdAt: new Date().toISOString()
        });

        res.status(201).send({ id: poolRef.id, message: 'Question Pool created successfully' });
    } catch (error) {
        console.error("Error creating pool:", error);
        res.status(500).send({ message: 'Failed to create pool' });
    }
});

// Faculty Route: Get all Pools for a course
app.get('/api/pools/:courseId', async (req, res) => {
    try {
        const { courseId } = req.params;

        const poolsSnapshot = await db.collection('pools').where('courseId', '==', courseId).get();
        const pools = poolsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.status(200).send(pools);
    } catch (error) {
        console.error("Error fetching pools:", error);
        res.status(500).send({ message: 'Failed to fetch pools' });
    }
});


// --- QUESTION MANAGEMENT ROUTES ---

// Faculty Route: Add a new question
app.post('/api/questions', async (req, res) => {
    try {
        const { courseId, topic, questionText, options, correctOptionIndex, poolId, difficulty } = req.body;

        if (!courseId || !topic || !questionText || !options || correctOptionIndex === undefined || !poolId || !difficulty) {
            return res.status(400).send({ message: "Missing required fields (including Pool ID and Difficulty)." });
        }

        let poolName = poolId;
        try {
            const poolDoc = await db.collection('pools').doc(poolId).get();
            if (poolDoc.exists) {
                poolName = poolDoc.data().poolName;
            }
        } catch (e) {
            console.warn("Could not fetch pool name, using ID.");
        }


        const questionRef = await db.collection('questions').add({
            courseId,
            topic,
            questionText,
            options,
            correctOptionIndex: Number(correctOptionIndex),
            poolId,
            difficulty,
            createdAt: new Date().toISOString()
        });

        res.status(201).send({ id: questionRef.id, message: `Question added successfully to pool '${poolName}'` });
    } catch (error) {
        console.error("Error adding question:", error);
        res.status(500).send({ message: 'Failed to add question' });
    }
});


// Faculty Route: Bulk Upload Questions
app.post('/api/questions/upload', upload.single('questionsFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send({ message: 'No file uploaded.' });
    }
    const { courseId, poolId } = req.body;

    if (!courseId || !poolId) {
        return res.status(400).send({ message: 'Course ID or Pool ID is missing.' });
    }

    let poolName = poolId;
    try {
        const poolDoc = await db.collection('pools').doc(poolId).get();
        if (poolDoc.exists) {
            poolName = poolDoc.data().poolName;
        }
    } catch (e) {
        console.warn("Could not fetch pool name, using ID.");
    }

    const questionsToAdd = [];

    const readable = new stream.Readable();
    readable._read = () => { };
    readable.push(req.file.buffer);
    readable.push(null);

    readable.pipe(csv())
        .on('data', (row) => {
            // Assumes CSV headers: topic, questionText, option1, option2, option3, option4, correctOptionIndex, difficulty
            const { topic, questionText, option1, option2, option3, option4, correctOptionIndex, difficulty } = row;

            // Validate required fields including the new difficulty field
            if (topic && questionText && option1 && option2 && correctOptionIndex !== undefined && difficulty) {
                questionsToAdd.push({
                    courseId,
                    poolId,
                    topic,
                    questionText,
                    options: [option1, option2, option3 || '', option4 || ''],
                    correctOptionIndex: Number(correctOptionIndex),
                    difficulty: difficulty.trim(),
                    createdAt: new Date().toISOString()
                });
            }
        })
        .on('end', async () => {
            if (questionsToAdd.length === 0) {
                return res.status(400).send({ message: 'CSV file is empty or formatted incorrectly. Check headers: topic, questionText, option1, option2, correctOptionIndex, difficulty.' });
            }

            try {
                const batch = db.batch();
                const questionsRef = db.collection('questions');

                questionsToAdd.forEach(question => {
                    const docRef = questionsRef.doc();
                    batch.set(docRef, question);
                });

                await batch.commit();
                res.status(201).send({ message: `${questionsToAdd.length} questions added successfully to pool '${poolName}'` });
            } catch (batchError) {
                console.error("Firestore Batch Error:", batchError);
                res.status(500).send({ message: 'Failed to save questions to the database.' });
            }
        })
        .on('error', (err) => {
            console.error("CSV Parsing Error:", err);
            res.status(500).send({ message: 'Failed to parse the CSV file.' });
        });
});

// Faculty Route: Get questions for a course
app.get('/api/questions/:courseId', async (req, res) => {
    try {
        const { courseId } = req.params;
        const questionsSnapshot = await db.collection('questions').where('courseId', '==', courseId).get();
        const questions = questionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).send(questions);
    } catch (error) {
        console.error("Error fetching questions:", error);
        res.status(500).send({ message: 'Failed to fetch questions' });
    }
});

// Faculty Route: Delete a question
app.delete('/api/questions/:questionId', async (req, res) => {
    try {
        await db.collection('questions').doc(req.params.questionId).delete();
        res.status(200).send({ message: 'Question deleted successfully' });
    } catch (error) {
        console.error("Error deleting question:", error);
        res.status(500).send({ message: 'Failed to delete question' });
    }
});


// --- TEST RELEASE ROUTES (UPDATED) ---

// Faculty Route: Release a Test - RANDOM SAMPLING
app.post('/api/tests/release-random', async (req, res) => {
    try {
        const {
            testName,
            courseId,
            durationMinutes,
            releaseOption,
            scheduledDate,
            scheduledTime,
            totalQuestions,
            difficultyDistribution,
            selectedPoolIds,
            createdBy,
            endOption,
            endDate,
            endTime,
            // 🔴 NEW FIELDS FROM FRONTEND
            customPoolDistribution=false,
            poolQuestionMap={}
        } = req.body;

        if (!testName || !courseId || !durationMinutes || !createdBy || selectedPoolIds.length === 0) {
            return res.status(400).send({ message: "Missing required test parameters." });
        }

        // 1. Fetch ALL relevant questions from the selected pools
        if (selectedPoolIds.length > 10) {
            return res.status(400).send({ message: "Please select 10 or fewer pools for question filtering (Firestore limit)." });
        }

        const questionsSnapshot = await db.collection('questions')
            .where('courseId', '==', courseId)
            .where('poolId', 'in', selectedPoolIds) // Filter by selected pools
            .get();

        const allQuestions = questionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        let selectedQuestionIds = [];

        // 🔴 CHANGED: Robust check - triggers if flag is true OR if map data exists
        if (customPoolDistribution === true || (poolQuestionMap && Object.keys(poolQuestionMap).length > 0)) {
            console.log("Using Custom Granular Distribution");

            // VALIDATION: Ensure map exists if custom distribution is on
            if (!poolQuestionMap || Object.keys(poolQuestionMap).length === 0) {
                 return res.status(400).send({ message: "Custom distribution selected but no question configuration provided." });
            }

            // Iterate through the map provided by frontend
            for (const [poolId, counts] of Object.entries(poolQuestionMap)) {
                // Get questions belonging to this specific pool
                const poolQs = allQuestions.filter(q => q.poolId === poolId);
                
                // Helper to select questions for a specific difficulty
                const pickQuestions = (difficulty, count) => {
                    const dKey = difficulty.toLowerCase();
                    const available = poolQs.filter(q => q.difficulty === difficulty || q.difficulty?.toLowerCase() === dKey);
                    
                    if (available.length < count) {
                        throw new Error(`Not enough '${difficulty}' questions in pool ${poolId}. Required: ${count}, Available: ${available.length}`);
                    }
                    return shuffleArray(available).slice(0, count).map(q => q.id);
                };

                try {
                    selectedQuestionIds.push(...pickQuestions('Easy', Number(counts.easy || 0)));
                    selectedQuestionIds.push(...pickQuestions('Medium', Number(counts.medium || 0)));
                    selectedQuestionIds.push(...pickQuestions('Hard', Number(counts.hard || 0)));
                } catch (err) {
                    return res.status(400).send({ message: err.message });
                }
            }
        } else {
            // 🔴 EXISTING LOGIC: GLOBAL PERCENTAGE DISTRIBUTION
            console.log("Using Global Percentage Distribution");
            
            // Validate total percentage
            const totalPercentage = difficultyDistribution.easy + difficultyDistribution.medium + difficultyDistribution.hard;
            if (totalPercentage !== 100) {
                return res.status(400).send({ message: "Difficulty percentages must sum to 100." });
            }

            if (allQuestions.length < totalQuestions) {
                return res.status(400).send({ message: `Insufficient questions (${allQuestions.length} available in selected pools) to generate a test of ${totalQuestions} questions.` });
            }

            // Calculate required counts for each difficulty
            const requiredCounts = {
                easy: Math.round(totalQuestions * (difficultyDistribution.easy / 100)),
                medium: Math.round(totalQuestions * (difficultyDistribution.medium / 100)),
                hard: Math.round(totalQuestions * (difficultyDistribution.hard / 100))
            };

            // Fix rounding errors
            let currentTotal = requiredCounts.easy + requiredCounts.medium + requiredCounts.hard;
            if (currentTotal > totalQuestions) requiredCounts.easy -= (currentTotal - totalQuestions);
            else if (currentTotal < totalQuestions) requiredCounts.easy += (totalQuestions - currentTotal);

            const questionsByDifficulty = {
                easy: allQuestions.filter(q => q.difficulty?.toLowerCase() === 'easy'),
                medium: allQuestions.filter(q => q.difficulty?.toLowerCase() === 'medium'),
                hard: allQuestions.filter(q => q.difficulty?.toLowerCase() === 'hard')
            };

            for (const [difficulty, requiredCount] of Object.entries(requiredCounts)) {
                const availableQuestions = questionsByDifficulty[difficulty];
                if (requiredCount > availableQuestions.length) {
                    return res.status(400).send({
                        message: `Not enough ${difficulty} questions. Required: ${requiredCount}, Available: ${availableQuestions.length} in selected pools.`
                    });
                }
                const sampled = shuffleArray(availableQuestions).slice(0, requiredCount);
                selectedQuestionIds.push(...sampled.map(q => q.id));
            }
        }
        // 🔴 END CHANGED LOGIC

        if (selectedQuestionIds.length === 0) {
             return res.status(400).send({ message: "Configuration resulted in 0 questions selected." });
        }
        
        // Final shuffle of the complete list so questions from different pools are mixed
        shuffleArray(selectedQuestionIds);





        // 4. Create the Test Document in Firestore
        const testData = {
            testName,
            courseId,
            durationMinutes: parseInt(durationMinutes),
            totalQuestions: Number(totalQuestions),
            questionConfig: {
                selectedPoolIds,
                difficultyDistribution,
                customPoolDistribution: Boolean(customPoolDistribution),
                poolQuestionMap: poolQuestionMap || {},
                totalQuestions
            },
            sourcePoolIds: selectedPoolIds,
            status: releaseOption === 'now' ? 'active' : 'scheduled',
            createdBy,
            createdAt: new Date().toISOString()
        };

        if (releaseOption === 'schedule') {
            testData.scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
        }

        if (endOption === 'schedule' && endDate && endTime) {
            testData.scheduledEnd = new Date(`${endDate}T${endTime}`).toISOString();
        }

        await db.collection("tests").add(testData);

        res.status(201).send({ message: 'Test released successfully!' });

    } catch (error) {
        console.error("Error releasing test with random questions:", error);
        res.status(500).send({ message: 'Failed to release test: ' + error.message });
    }
});

        // Faculty Route: Release a Test - WHOLE POOL RELEASE
app.post('/api/tests/release-whole-pool', async (req, res) => {
    try {
        const {
            testName,
            courseId,
            durationMinutes,
            releaseOption,
            scheduledDate,
            scheduledTime,
            selectedPoolIds,
            createdBy,
            endOption,          // <<< NEW
            endDate,            // <<< NEW
            endTime             // <<< NEW
        } = req.body;

        if (!testName || !courseId || !durationMinutes || !selectedPoolIds || selectedPoolIds.length === 0) {
            return res.status(400).send({ message: "Missing required fields for whole pool release." });
        }

        // 1. Fetch ALL questions from the selected pools
        const questionsSnapshot = await db.collection('questions')
            .where('courseId', '==', courseId)
            .where('poolId', 'in', selectedPoolIds)
            .get();

        const questionIds = questionsSnapshot.docs.map(doc => doc.id);

        if (questionIds.length === 0) {
            return res.status(400).send({ message: "No questions found in the selected pool(s)." });
        }

        shuffleArray(questionIds);

        // 2. Create the Test Document in Firestore
        const testData = {
            testName,
            courseId,
            durationMinutes: parseInt(durationMinutes),
            questionIds,
            totalQuestions: questionIds.length, 

            sourcePoolIds: selectedPoolIds,
            status: releaseOption === 'now' ? 'active' : 'scheduled',
            createdBy,
            createdAt: new Date().toISOString()
        };

        if (releaseOption === 'schedule') {
            testData.scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
        }

        // --- NEW: Handle Scheduled End Time ---
        if (endOption === 'schedule' && endDate && endTime) {
            testData.scheduledEnd = new Date(`${endDate}T${endTime}`).toISOString();
        }
        // ------------------------------------

        await db.collection("tests").add(testData);

        res.status(201).send({ message: 'Test released successfully by including all questions from selected pool(s)!' });

    } catch (error) {
        console.error("Error releasing whole pool test:", error);
        res.status(500).send({ message: 'Failed to release test: ' + error.message });
    }
});


// --- STUDENT/TEST ROUTES (MODIFIED for scheduledEnd check) ---

// Student Route: Get available tests for a student
app.post('/api/tests/available', async (req, res) => {
    try {
        const { studentId } = req.body;
        const now = new Date();

        const testsSnapshot = await db.collection('tests').get();
        const availableTests = [];

        for (const doc of testsSnapshot.docs) {
            const testData = doc.data();
            const test = {
                id: doc.id,
                ...testData,
                questionCount: testData.questionIds ? testData.questionIds.length : 0
            };

            // 1. Check for scheduled START and update to active (Existing logic)
            if (test.scheduledFor) {
                const scheduledTime = new Date(test.scheduledFor);

                if (test.status === 'scheduled' && scheduledTime <= now) {
                    await doc.ref.update({ status: 'active' });
                    test.status = 'active';
                }
            }

            // 2. Check for scheduled END and update to inactive (NEW logic)
            if (test.scheduledEnd) {
                const scheduledEndTime = new Date(test.scheduledEnd);

                if (test.status === 'active' && scheduledEndTime <= now) {
                    await doc.ref.update({ status: 'inactive' });
                    test.status = 'inactive';
                }
            }

            // 3. Check if student has taken the test
            let hasTakenTest = false;
            const studentTestsSnapshot = await db.collection('studentTests')
                .where('studentId', '==', studentId)
                .where('originalTestId', '==', test.id)
                .where('status', 'in', ['completed', 'in-progress'])
                .get();

            if (studentTestsSnapshot.docs.some(d => d.data().status === 'completed')) {
                hasTakenTest = true;
            }

            // 4. ONLY make test available if ACTIVE and NOT taken
            if (test.status === 'active' && !hasTakenTest) {
                availableTests.push({
                    id: test.id,
                    testName: test.testName,
                    courseId: test.courseId,
                    durationMinutes: test.durationMinutes || test.duration,
                    status: test.status,
                    scheduledFor: test.scheduledFor,
                    scheduledEnd: test.scheduledEnd, // Include scheduledEnd
                    questionCount: testData.questionConfig?.totalQuestions
                        || testData.questionIds?.length
                        || 0

                });
            }
        }

        res.status(200).send(availableTests);

    } catch (error) {
        console.error("Error fetching available tests:", error);
        res.status(500).send({ message: 'Failed to fetch available tests' });
    }
});


// Student Route: Get test history (unchanged)
app.post('/api/tests/history', async (req, res) => {
    try {
        const { studentId } = req.body;

        const testsSnapshot = await db.collection('studentTests')
            .where('studentId', '==', studentId)
            .where('status', '==', 'completed')
            .get();

        const history = {};

        testsSnapshot.forEach(doc => {
            const test = doc.data();
            const courseId = test.courseId;

            if (!history[courseId]) {
                history[courseId] = [];
            }

            history[courseId].push({
                testId: doc.id,
                testName: test.testName || 'Unnamed Test',
                score: test.score || 0,
                completedAt: test.endTime ? new Date(test.endTime).toISOString() : new Date().toISOString(),
                totalQuestions: test.questions ? test.questions.length : 0,
                originalTestId: test.originalTestId // Required for history/missed checks
            });
        });

        res.status(200).send(history);
    } catch (error) {
        console.error("Error fetching test history:", error);
        res.status(500).send({ message: 'Failed to fetch test history' });
    }
});

// Student Route: Start a specific faculty-created test (MODIFIED for scheduledEnd check)
app.post('/api/tests/start-specific', async (req, res) => {
    try {
        const { studentId, testId } = req.body;

        // 1. Check existing attempts (unchanged)
        const existingTestsSnapshot = await db.collection('studentTests')
            .where('studentId', '==', studentId)
            .where('originalTestId', '==', testId)
            .where('status', 'in', ['completed', 'in-progress'])
            .get();

        if (!existingTestsSnapshot.empty) {
            const inProgressTestDoc = existingTestsSnapshot.docs.find(doc => doc.data().status === 'in-progress');
            if (inProgressTestDoc) {
    const testData = inProgressTestDoc.data();
    // Return EVERYTHING needed to resume: questions, existing answers, and the original start time
    return res.status(200).send({
        testId: inProgressTestDoc.id,
        questions: testData.questions.map(({ correctOptionIndex, ...rest }) => rest),
        answers: testData.answers || {}, // Send back saved progress
        startTime: testData.startTime,   // Send back original start time
        durationMinutes: testData.durationMinutes,
        testName: testData.testName
    });
}
            return res.status(400).send({ message: 'You have already taken this test.' });
        }

        // 2. Check main test status
        const testDoc = await db.collection('tests').doc(testId).get();
        if (!testDoc.exists) {
            return res.status(404).send({ message: 'Test not found.' });
        }

        const test = testDoc.data();

        // --- NEW: Disallow start if scheduled end time has passed ---
        if (test.scheduledEnd && new Date(test.scheduledEnd) <= new Date()) {
            // Force status update to inactive in case the job didn't run, but still block start
            await testDoc.ref.update({ status: 'inactive' });
            return res.status(400).send({ message: 'Test has expired and can no longer be started.' });
        }

        if (test.status !== 'active') {
            return res.status(400).send({ message: 'Test is not available (either scheduled or inactive).' });
        }
        /* ======================================================
   ✅ WHOLE-POOL TESTS — MUST RUN FIRST
   ====================================================== */
if (Array.isArray(test.questionIds)) {

    const docs = await Promise.all(
        test.questionIds.map(id =>
            db.collection('questions').doc(id).get()
        )
    );

    const questions = docs
        .filter(d => d.exists)
        .map(d => ({ id: d.id, ...d.data() }));

    if (questions.length === 0) {
        return res.status(400).send({ message: 'No questions found for this test.' });
    }

    const studentTestDoc = {
        studentId,
        originalTestId: testId,
        testName: test.testName,
        courseId: test.courseId,
        durationMinutes: test.durationMinutes,
        startTime: new Date().toISOString(),
        status: 'in-progress',
        questions,
        answers: {}
    };

    const testRef = await db.collection('studentTests').add(studentTestDoc);

    const questionsForStudent = questions.map(
        ({ correctOptionIndex, ...rest }) => rest
    );

    return res.status(201).send({
        testId: testRef.id,
        questions: questionsForStudent,
        startTime: studentTestDoc.startTime,
        durationMinutes: studentTestDoc.durationMinutes,
        testName: studentTestDoc.testName
    });
}
if (!test.questionConfig && !Array.isArray(test.questionIds)) {
    return res.status(400).send({
        message: 'Invalid test configuration.'
    });
}



        // -------------------------------------------------------------
if (
    test.questionConfig?.selectedPoolIds &&
    test.questionConfig.selectedPoolIds.length > 10
) {
    return res.status(400).send({
        message: 'Too many pools selected. Maximum allowed is 10.'
    });
}


// 🔑 Generate UNIQUE questions for this student at start time

const usedQuestionIds = new Set();
const cfg = test.questionConfig;

const questionsSnapshot = await db.collection('questions')
    .where('courseId', '==', test.courseId)
    .where('poolId', 'in', cfg.selectedPoolIds)
    .get();

const allQuestions = questionsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
}));

// 🔐 STRICT VALIDATION — RUN ONCE
if (cfg.customPoolDistribution) {
    const expected = Object.values(cfg.poolQuestionMap || {}).reduce(
        (sum, c) => sum + (c.easy || 0) + (c.medium || 0) + (c.hard || 0),
        0
    );

    if (expected !== cfg.totalQuestions) {
        return res.status(400).send({
            message: `Total questions (${cfg.totalQuestions}) does not match pool distribution sum (${expected})`
        });
    }
}

// helper for pool-wise
const pickFromPool = (poolId, difficulty, count) => {
    const pool = allQuestions.filter(q =>
        q.poolId === poolId &&
        q.difficulty?.toLowerCase() === difficulty &&
        !usedQuestionIds.has(q.id)
    );

    if (pool.length < count) {
        throw new Error(`Not enough ${difficulty} questions in pool ${poolId}`);
    }

    const selected = shuffleArray(pool).slice(0, count);
    selected.forEach(q => usedQuestionIds.add(q.id));
    return selected;
};

// helper for percentage mode
const pick = (difficulty, count) => {
    const pool = allQuestions.filter(q =>
        q.difficulty?.toLowerCase() === difficulty &&
        !usedQuestionIds.has(q.id)
    );

    const selected = shuffleArray(pool).slice(0, count);
    selected.forEach(q => usedQuestionIds.add(q.id));
    return selected;
};

let shuffledQuestions = [];

// MODE A: custom pool-wise
if (cfg.customPoolDistribution) {
    for (const [poolId, counts] of Object.entries(cfg.poolQuestionMap)) {
        shuffledQuestions.push(
            ...pickFromPool(poolId, 'easy', counts.easy || 0),
            ...pickFromPool(poolId, 'medium', counts.medium || 0),
            ...pickFromPool(poolId, 'hard', counts.hard || 0)
        );
    }
}
// MODE B: percentage
else {
    const tq = cfg.totalQuestions;
    const dist = cfg.difficultyDistribution;

    shuffledQuestions.push(
        ...pick('easy', Math.round(tq * dist.easy / 100)),
        ...pick('medium', Math.round(tq * dist.medium / 100)),
        ...pick('hard', Math.round(tq * dist.hard / 100))
    );
}

shuffleArray(shuffledQuestions);









        const studentTestDoc = {
            studentId,
            originalTestId: testId,
            testName: test.testName,
            courseId: test.courseId,
            durationMinutes: test.durationMinutes || test.duration,
            startTime: new Date().toISOString(),
            status: 'in-progress',
            questions: shuffledQuestions,
            answers: {}
        };

        const testRef = await db.collection('studentTests').add(studentTestDoc);

        const questionsForStudent = shuffledQuestions.map(({ correctOptionIndex, ...rest }) => rest);

        res.status(201).send({
            testId: testRef.id,
            questions: questionsForStudent,
            startTime: studentTestDoc.startTime,
            durationMinutes: studentTestDoc.durationMinutes,
            testName: studentTestDoc.testName
        });

    } catch (error) {
        console.error("Error starting specific test:", error);
        res.status(500).send({ message: 'Failed to start test' });
    }
});

// --- NEW: REAL-TIME PROGRESS SAVING ---
app.post('/api/tests/save-progress', async (req, res) => {
    try {
        const { testId, answers } = req.body;
        if (!testId) return res.status(400).send({ message: "Test ID missing." });

        await db.collection('studentTests').doc(testId).update({
            answers: answers || {},
            lastUpdated: new Date().toISOString()
        });

        res.status(200).send({ message: "Progress synced." });
    } catch (error) {
        console.error("Error syncing progress:", error);
        res.status(500).send({ message: "Sync failed." });
    }
});

// Student Route: Submit a test (unchanged)
app.post('/api/tests/submit', async (req, res) => {
    try {
        const { testId, answers } = req.body;

        const testRef = db.collection('studentTests').doc(testId);
        const testDoc = await testRef.get();

        if (!testDoc.exists) {
            return res.status(404).send({ message: 'Test not found.' });
        }

        const testData = testDoc.data();
        if (testData.status === 'completed') {
            return res.status(400).send({ message: 'This test has already been submitted.' });
        }

        const questions = testData.questions;

        let score = 0;
        let topicAnalysis = {};

        questions.forEach(q => {
            const studentAnswerIndex = answers[q.id];
            const correctAnswerIndex = q.correctOptionIndex;
            const topic = q.topic;

            if (!topicAnalysis[topic]) {
                topicAnalysis[topic] = { correct: 0, total: 0 };
            }

            topicAnalysis[topic].total += 1;

            if (studentAnswerIndex !== undefined && Number(studentAnswerIndex) === Number(correctAnswerIndex)) {
                score++;
                topicAnalysis[topic].correct += 1;
            }
        });

        const totalQuestions = questions.length;
        const finalScore = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

        await testRef.update({
            status: 'completed',
            endTime: new Date().toISOString(),
            answers,
            score: finalScore,
            analysis: topicAnalysis
        });

        res.status(200).send({
            message: 'Test submitted successfully!',
            score: finalScore,
            analysis: topicAnalysis
        });

    } catch (error) {
        console.error("Error submitting test:", error);
        res.status(500).send({ message: 'Failed to submit test' });
    }
});

// Student/Faculty Route: Get results for a specific test (unchanged)
app.get('/api/results/:testId', async (req, res) => {
    try {
        const { testId } = req.params;
        const testRef = db.collection('studentTests').doc(testId);
        const doc = await testRef.get();

        if (!doc.exists) {
            return res.status(404).send({ message: 'Test result not found.' });
        }

        res.status(200).send(doc.data());

    } catch (error) {
        console.error("Error fetching results:", error);
        res.status(500).send({ message: 'Failed to fetch results' });
    }
});


// --- ANALYTICS ROUTES (unchanged) ---

// Faculty Route: Get course-level analytics
app.get('/api/faculty/course-analysis/:courseId', async (req, res) => {
    try {
        const { courseId } = req.params;

        const testsSnapshot = await db.collection('tests').where('courseId', '==', courseId).get();
        const testIds = testsSnapshot.docs.map(doc => doc.id);

        const analytics = {
            courseId, totalTests: testIds.length, totalAttempts: 0, averageScore: 0, passRate: 0, topicPerformance: {}, studentPerformance: []
        };

        if (testIds.length === 0) {
            return res.status(200).send(analytics);
        }

        if (testIds.length > 10) {
            // WARNING: Cannot use 'in' query on more than 10 test IDs. This simplified code skips detailed performance.
            console.warn("Too many tests (>10), aggregation might be incomplete.");
        }

        const studentTestsSnapshot = await db.collection('studentTests')
            .where('originalTestId', 'in', testIds)
            .where('status', '==', 'completed')
            .get();

        analytics.totalAttempts = studentTestsSnapshot.size;

        if (studentTestsSnapshot.size === 0) {
            return res.status(200).send(analytics);
        }

        const studentIds = new Set();
        studentTestsSnapshot.forEach(doc => studentIds.add(doc.data().studentId));

        const userProfilesMap = await fetchUserProfiles(Array.from(studentIds)); // Profile lookup

        let totalScore = 0;
        let passCount = 0;
        const studentMap = new Map();

        studentTestsSnapshot.forEach(doc => {
            const testData = doc.data();
            const score = testData.score || 0;
            const studentId = testData.studentId;
            const profile = userProfilesMap.get(studentId) || {};

            totalScore += score;
            if (score >= 50) passCount++;

            if (!studentMap.has(studentId)) {
                studentMap.set(studentId, {
                    studentId: studentId,
                    studentName: profile.name || `User ID: ${studentId.substring(0, 8)}`,
                    studentRollNo: profile.rollNo,
                    attempts: 0,
                    averageScore: 0,
                    totalScore: 0,
                    bestScore: 0,
                    lastAttempt: null
                });
            }

            const student = studentMap.get(studentId);
            student.attempts++;
            student.totalScore += score;
            student.averageScore = student.totalScore / student.attempts;
            student.bestScore = Math.max(student.bestScore, score);

            // Aggregate topic performance
            if (testData.analysis) {
                Object.entries(testData.analysis).forEach(([topic, data]) => {
                    if (!analytics.topicPerformance[topic]) {
                        analytics.topicPerformance[topic] = { topic, totalQuestions: 0, correctAnswers: 0, averageScore: 0 };
                    }
                    analytics.topicPerformance[topic].totalQuestions += data.total;
                    analytics.topicPerformance[topic].correctAnswers += data.correct;
                    analytics.topicPerformance[topic].averageScore = (analytics.topicPerformance[topic].correctAnswers / analytics.topicPerformance[topic].totalQuestions) * 100;
                });
            }
        });

        analytics.averageScore = totalScore / studentTestsSnapshot.size;
        analytics.passRate = (passCount / studentTestsSnapshot.size) * 100;
        analytics.studentPerformance = Array.from(studentMap.values());

        res.status(200).send(analytics);
    } catch (error) {
        console.error("Error fetching course analytics:", error);
        res.status(500).send({ message: 'Failed to fetch course analytics' });
    }
});
// Faculty Route: Get scores for a specific test
app.get('/api/faculty/test-scores/:testId', async (req, res) => {
    try {
        const { testId } = req.params;

        const snapshot = await db.collection('studentTests')
            .where('originalTestId', '==', testId)
            .where('status', '==', 'completed')
            .get();

        if (snapshot.empty) {
            return res.status(200).send([]);
        }

        const studentIds = snapshot.docs.map(d => d.data().studentId);
        const userProfiles = await fetchUserProfiles(studentIds);

        const results = snapshot.docs.map(doc => {
            const data = doc.data();
            const profile = userProfiles.get(data.studentId) || {};

            return {
                studentId: data.studentId,
                studentName: profile.name || 'Student',
                studentRollNo: profile.rollNo || null,
                score: data.score || 0,
                completedAt: data.endTime
            };
        });

        res.status(200).send(results);

    } catch (error) {
        console.error('Error fetching test scores:', error);
        res.status(500).send({ message: 'Failed to fetch test scores' });
    }
});


// Faculty Route: Get individual student analysis for a course (unchanged)
app.get('/api/faculty/student-analysis/:courseId/:studentId', async (req, res) => {
    try {
        const { courseId, studentId } = req.params;

        const userDoc = await db.collection('users').doc(studentId).get();
        const profile = userDoc.exists ? userDoc.data() : {};

        const studentTestsSnapshot = await db.collection('studentTests')
            .where('studentId', '==', studentId)
            .where('courseId', '==', courseId)
            .where('status', '==', 'completed')
            .get();

        const studentAnalysis = {
            studentId,
            courseId,
            totalTests: studentTestsSnapshot.size,
            averageScore: 0,
            improvementTrend: [],
            topicWeaknesses: [],
            topicStrengths: [],
            studentName: profile.name || `User ID: ${studentId.substring(0, 8)}`,
            studentRollNo: profile.rollNo
        };

        let totalScore = 0;
        const tests = [];

        studentTestsSnapshot.forEach(doc => {
            const testData = doc.data();
            const score = testData.score || 0;
            totalScore += score;

            tests.push({
                testId: doc.id,
                testName: testData.testName,
                score: score,
                completedAt: testData.endTime,
                analysis: testData.analysis || {}
            });
        });

        studentAnalysis.averageScore = studentTestsSnapshot.size > 0 ? totalScore / studentTestsSnapshot.size : 0;
        studentAnalysis.tests = tests.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

        // Calculate improvement trend (last 5 tests)
        const recentTests = studentAnalysis.tests.slice(0, 5).reverse();
        studentAnalysis.improvementTrend = recentTests.map((test, index) => ({
            test: test.testName,
            score: test.score,
            attempt: index + 1
        }));

        // Identify strengths and weaknesses
        const topicPerformance = {};
        tests.forEach(test => {
            if (test.analysis) {
                Object.entries(test.analysis).forEach(([topic, data]) => {
                    if (!topicPerformance[topic]) { topicPerformance[topic] = { topic, totalQuestions: 0, correctAnswers: 0, tests: 0 }; }
                    topicPerformance[topic].totalQuestions += data.total;
                    topicPerformance[topic].correctAnswers += data.correct;
                    topicPerformance[topic].tests++;
                });
            }
        });

        const topicsArray = Object.values(topicPerformance).map(topic => ({
            ...topic,
            percentage: (topic.correctAnswers / topic.totalQuestions) * 100
        }));

        topicsArray.sort((a, b) => a.percentage - b.percentage);

        studentAnalysis.topicWeaknesses = topicsArray.slice(0, 3);
        studentAnalysis.topicStrengths = topicsArray.slice(-3).reverse();

        res.status(200).send(studentAnalysis);
    } catch (error) {
        console.error("Error fetching student analytics:", error);
        res.status(500).send({ message: 'Failed to fetch student analytics' });
    }
});



// Student Route: Get details (questions) for an un-attempted, expired test
app.get('/api/tests/missed-details/:testId', async (req, res) => {
    try {
        const { testId } = req.params;
        const testDoc = await db.collection('tests').doc(testId).get(); // Fetches from main 'tests' collection

        if (!testDoc.exists) {
            return res.status(404).send({ message: 'Test not found.' });
        }

        const testData = testDoc.data();

        // Basic check to ensure it's not currently active (should be caught by frontend logic anyway)
        if (testData.status === 'active') {
            return res.status(400).send({ message: 'Test is still active or scheduled. Cannot view analysis yet.' });
        }
        // 🔒 Firestore safety check for random tests
if (
    testData.questionConfig &&
    testData.questionConfig.selectedPoolIds &&
    testData.questionConfig.selectedPoolIds.length > 10
) {
    return res.status(400).send({
        message: 'Cannot load missed test details: too many pools.'
    });
}


        let questions = [];

if (testData.questionIds) {
  // Whole-pool test (old behavior)
  const docs = await Promise.all(
    testData.questionIds.map(id => db.collection('questions').doc(id).get())
  );
  docs.forEach(d => d.exists && questions.push({ id: d.id, ...d.data() }));
}
else if (testData.questionConfig) {
    return res.status(400).send({
        message: 'Cannot review missed random tests because question sets are student-specific.'
    });
}



        // Construct the review data in a format consistent with 'studentTests' results for the frontend ReviewScreen.jsx
        res.status(200).send({
            testName: testData.testName,
            status: 'missed', // Custom status for the frontend
            questions: questions,
            answers: {}, // No student answers to display
            score: 0,
            analysis: {}, // No score/analysis for missed test, but ReviewScreen expects it
            durationMinutes: testData.durationMinutes,
            // You can add more fields if ReviewScreen needs them
        });

    } catch (error) {
        console.error("Error fetching missed test details:", error);
        res.status(500).send({ message: 'Failed to fetch missed test details' });
    }
});

// --- START THE SERVER ---

app.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`  BACKEND STATUS: RUNNING`);
    console.log(`  Local Access:   http://localhost:${PORT}`);
    console.log(`  Network Access: http://172.29.23.168:${PORT}`);
    console.log(`==============================================\n`);
});