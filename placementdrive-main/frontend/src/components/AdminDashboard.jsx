import React, { useState } from 'react';

// With the proxy, we no longer need the full API_URL. We can use relative paths.
// const API_URL = 'http://localhost:5000'; // This line is no longer needed.

const AdminDashboard = ({ user, onLogout }) => {
    // ... (all your existing state variables)
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('student');
    const [uploadFile, setUploadFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState('');
    const [bulkUploadError, setBulkUploadError] = useState('');

    const getAuthToken = async () => {
        if (!user || typeof user.getIdToken !== 'function') {
            throw new Error("User not authenticated correctly.");
        }
        return await user.getIdToken();
    };


    const isValidStudentEmail = (email) => {
    return email.toLowerCase().endsWith('@bl.students.amrita.edu');
    };

    const validateCSVContent = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            
            const emailIndex = headers.indexOf('email');
            const roleIndex = headers.indexOf('role');
            
            if (emailIndex === -1 || roleIndex === -1) {
                reject(new Error('CSV must contain "email" and "role" columns'));
                return;
            }
            
            const errors = [];
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                
                const cells = lines[i].split(',');
                const email = cells[emailIndex]?.trim();
                const role = cells[roleIndex]?.trim().toLowerCase();
                
                if (role === 'student' && email && !isValidStudentEmail(email)) {
                    errors.push(`Row ${i}: Student email "${email}" must end with @bl.students.amrita.edu`);
                }
            }
            
            if (errors.length > 0) {
                reject(new Error(errors.join('\n')));
            } else {
                resolve();
            }
        };
        reader.readAsText(file);
    });
};


    const handleAddUser = async (e) => {
        e.preventDefault();

        if (role === 'student' && !isValidStudentEmail(email)) {
        setMessage('Error: Student email must end with @bl.students.amrita.edu');
        return;
    }

        setIsSubmitting(true);
        setMessage('');

        

        try {
            const token = await getAuthToken();
            // --- FIX: Use the relative path, which will be caught by the proxy ---
            const response = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name, email, password, role }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to create user.');

            setMessage(result.message);
            setName('');
            setEmail('');
            setPassword('');
            setRole('student');

        } catch (error) {
            setMessage(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

   const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
        setBulkUploadError('Error: Please select a file.'); // CHANGED: setMessage → setBulkUploadError
        return;
    }
    
    setIsSubmitting(true);
    setBulkUploadError(''); // CHANGED: clear bulk upload error instead of global message
    
    // Validate CSV
    try {
        await validateCSVContent(uploadFile);
    } catch (error) {
        setBulkUploadError(`Validation Error:\n${error.message}`); // CHANGED: use bulkUploadError
        setIsSubmitting(false);
        return;
    }
    
    const formData = new FormData();
    formData.append('usersFile', uploadFile);

    try {
        const token = await getAuthToken();
        const response = await fetch('/api/admin/upload-users', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server responded with ${response.status}: ${errorText}`);
        }

        const result = await response.json();

        let formattedMessage = result.message;
        if (result.errors && result.errors.length > 0) {
            formattedMessage += `\nErrors:\n- ${result.errors.join('\n- ')}`;
        }
        setBulkUploadError(formattedMessage); // CHANGED: show bulk upload result here
        
        setUploadFile(null);
        if(document.getElementById('file-upload-input')) {
            document.getElementById('file-upload-input').value = '';
        }

    } catch (error) {
        setBulkUploadError(`Error: ${error.message}`); // CHANGED: use bulkUploadError
    } finally {
        setIsSubmitting(false);
    }
};
    // ... (rest of your component code: downloadCsvTemplate and the return JSX)
    const downloadCsvTemplate = () => {
        const headers = ['name', 'email', 'password', 'role'];
        const exampleRow = ['John Student', 'john.student@example.com', 'strongPassword123', 'student'];
        const exampleRow2 = ['Jane Faculty', 'jane.faculty@example.com', 'anotherPassword456', 'faculty'];
        const csvContent = [headers.join(','), exampleRow.join(','), exampleRow2.join(',')].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'UserUploadTemplate.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="app-container">
            <nav className="navbar">
                <h1>Admin Dashboard</h1>
                <button onClick={onLogout} className="btn btn-danger">Logout</button>
            </nav>
            <main className="main-content">
                {message && (
                    <div className={`message ${message.toLowerCase().includes('error') || message.toLowerCase().includes('failed') ? 'error' : 'success'}`} style={{ whiteSpace: 'pre-wrap' }}>
                        {message}
                    </div>
                )}
                <div className="card">
                    <h3>Add Single User</h3>
                    <form onSubmit={handleAddUser}>
                        <div className="input-group">
                            <label>Full Name</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., John Doe" required />
                        </div>
                        <div className="input-group">
                            <label>Email</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g., user@example.com" required />
                        </div>
                        <div className="input-group">
                            <label>Password</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 characters" required />
                        </div>
                        <div className="input-group">
                            <label>Role</label>
                            <select value={role} onChange={e => setRole(e.target.value)}>
                                <option value="student">Student</option>
                                <option value="faculty">Faculty</option>
                            </select>
                        </div>
                        <button type="submit" disabled={isSubmitting} className="btn btn-success btn-full">
                            {isSubmitting ? 'Creating...' : 'Create User'}
                        </button>
                    </form>
                </div>
                <div className="card" style={{marginTop: '2rem'}}>
                    <h3>Bulk Upload Users (.csv)</h3>
                     <p>
                        Required headers: <strong>name, email, password, role</strong>.
                        <span 
                            onClick={downloadCsvTemplate} 
                            style={{ color: 'var(--primary-color)', cursor: 'pointer', textDecoration: 'underline', marginLeft: '5px' }}
                        >
                            Download Template
                        </span>
                    </p>
                    {bulkUploadError && (
        <div className={`message ${bulkUploadError.toLowerCase().includes('error') || bulkUploadError.toLowerCase().includes('validation') ? 'error' : 'success'}`} 
             style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>
            {bulkUploadError}
        </div>
    )}
                   <form onSubmit={handleFileUpload}>
        <div className="input-group">
            <input 
                id="file-upload-input"
                type="file" 
                accept=".csv" 
                onChange={(e) => {
                    setUploadFile(e.target.files[0]);
                    setBulkUploadError(''); // Clear error when new file is selected
                }} 
                required 
            />
        </div>
        <button type="submit" disabled={isSubmitting || !uploadFile} className="btn btn-primary">
            {isSubmitting ? 'Uploading...' : 'Upload Users CSV'}
        </button>
    </form>
</div>
            </main>
        </div>
    );
};

export default AdminDashboard;