// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import LoginScreen from './components/Login.jsx';
import StudentDashboard from './components/StudentDashboard.jsx';
import FacultyDashboard from './components/FacultyDashboard.jsx';
import AdminDashboard from './components/AdminDashboard.jsx'; 
import './style.css';

const App = () => {
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const userDocRef = doc(db, 'users', currentUser.uid);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists()) {
                    // --- FIX: Correctly merge user data while preserving Firebase methods ---
                    // This creates a new object that inherits from the Firebase User object's prototype,
                    // ensuring methods like getIdToken() are available. Then, it copies properties
                    // from both the auth object and the Firestore document into it.
                    const combinedData = Object.create(Object.getPrototypeOf(currentUser));
                    Object.assign(combinedData, currentUser, userDoc.data());
                    
                    setUserData(combinedData);
                } else {
                    console.error("Auth successful, but no Firestore user document found.");
                    setUserData(null);
                }
            } else {
                setUserData(null);
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Error signing out: ', error);
        }
    };
    
    const renderDashboard = () => {
        if (!userData) {
            return <LoginScreen />;
        }

        switch (userData.role) {
            case 'admin':
                return <AdminDashboard user={userData} onLogout={handleLogout} />;
            case 'faculty':
                return <FacultyDashboard user={userData} onLogout={handleLogout} />;
            case 'student':
                return <StudentDashboard user={userData} onLogout={handleLogout} />;
            default:
                console.error(`Unknown role: "${userData.role}". Rendering LoginScreen.`);
                return <LoginScreen />;
        }
    };
    
    return (
        <>
            {isLoading 
                ? <div className="loading-screen"><h1>Loading...</h1></div>
                : renderDashboard() 
            }
        </>
    );
};

export default App;

