// frontend/src/components/Login.js
import React, { useState } from 'react';
// The following imports are now correctly grouped
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth} from '../firebase.js';

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    

 const handleAuthAction = async (e) => {
    e.preventDefault();
    setError('');
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        setError(err.message);
    }
};

    return (
        <div className="auth-container">
            <div className="auth-card amrita-style">
                <h1 className="portal-title"><span>AMRITA</span></h1>
                <p className="portal-subtitle">PLACEMENT DRIVE</p>
                <h2 style={{fontSize: '1.5rem', marginBottom: '1.5rem', color: '#1f2937'}}>
                    Login
                </h2>
                <form onSubmit={handleAuthAction}>
                    
                    <div className="input-group">
                        <label htmlFor="email">Email Address</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>
                    
                    {error && <p className="error-message">{error}</p>}
                    <button type="submit" className="btn-login">
                        LOGIN
                    </button>
                </form>

            </div>
        </div>
    );
};

export default LoginScreen;