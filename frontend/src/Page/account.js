import React, { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/logo/logo_viseo.jpeg';

const CreateAccount = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [department, setDepartment] = useState('');

    const [usernameError, setUsernameError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordConfirmError, setPasswordConfirmError] = useState('');
    const [departmentError, setDepartmentError] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [apiError, setApiError] = useState('');

    const navigate = useNavigate();

    const validateForm = () => {
        let isValid = true;
        setUsernameError('');
        setPasswordError('');
        setPasswordConfirmError('');
        setDepartmentError('');

        if (!username) {
            setUsernameError("Le nom d'utilisateur est requis");
            isValid = false;
        }

        if (!password) {
            setPasswordError('Mot de passe obligatoire');
            isValid = false;
        } else if (password.length < 6) {
            setPasswordError('Le mot de passe doit contenir au moins 6 caractères');
            isValid = false;
        }

        if (!passwordConfirm) {
            setPasswordConfirmError('Veuillez confirmer le mot de passe');
            isValid = false;
        } else if (password !== passwordConfirm) {
            setPasswordConfirmError('Les mots de passe ne correspondent pas');
            isValid = false;
        }

        if (!department) {
            setDepartmentError('Le département est requis');
            isValid = false;
        }

        return isValid;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setApiError('');

        if (!validateForm()) {
            return;
        }

        setIsLoading(true);
        try {
            await axios.post('/api/livraison/create_user/', {
                username: username,
                password: password,
                department_name: department,
            });
            setIsSuccess(true);
            setTimeout(() => {
                navigate('/login');
            }, 2000);
        } catch (error) {
            if (error.response && error.response.data && error.response.data.detail) {
                setApiError(error.response.data.detail);
            } else if (error.response && error.response.status === 400) {
                const errors = error.response.data;
                if (errors.username) setUsernameError(errors.username.join(' '));
                setApiError('Veuillez corriger les erreurs ci-dessus.');
            }
            else {
                setApiError('Échec de la création du compte. L\'utilisateur existe peut-être déjà.');
            }
            setIsLoading(false);
        }
    };

    const inputGroupClasses = (error) => `relative mb-6 ${error ? 'text-red-500' : ''}`;
    const inputClasses = (error) => `w-full bg-white border ${error ? 'border-red-500 bg-red-50' : 'border-gray-300'} rounded-lg py-4 px-3.5 text-gray-900 placeholder-transparent focus:outline-none focus:border-indigo-600`;
    const labelClasses = (error) => `absolute left-3.5 -top-3 text-sm ${error ? 'text-red-500' : 'text-gray-600'} bg-white px-1 transition-all`;
    const errorMessageClasses = (error) => `text-xs text-red-500 mt-1 ${error ? 'opacity-100' : 'opacity-0'}`;

    return (
        <div className="bg-blue-50 min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className={`bg-white rounded-2xl px-10 py-6 shadow-lg border border-gray-100 relative ${isSuccess ? 'hidden' : 'block'}`}>
                    <div className="text-center mb-8">
                        <div className="flex justify-center mb-5">
                            <img src={logo} alt="Viseo Logo" className="w-1/6 h-auto rounded-2xl" />
                        </div>
                        <h1 className="text-2xl font-semibold text-gray-800 mb-2">Créer un Compte</h1>
                        <p className="text-sm text-gray-500">Rejoignez notre plateforme logistique en remplissant ce formulaire.</p>
                    </div>
                    
                    <form noValidate onSubmit={handleSubmit}>
                        <p className="text-red-500 text-center mb-4 min-h-[1.2em]" style={{visibility: apiError && !isSuccess ? 'visible' : 'hidden' }}>{apiError || '\u00A0'}</p>
                        
                        <div className={inputGroupClasses(usernameError)}>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                required
                                autoComplete="username"
                                placeholder="Nom d'utilisateur"
                                className={inputClasses(usernameError)}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                            <label htmlFor="username" className={labelClasses(usernameError)}>Nom d'utilisateur</label>
                            <span className={errorMessageClasses(usernameError)}>{usernameError || '\u00A0'}</span>
                        </div>

                        <div className={inputGroupClasses(passwordError)}>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                required
                                autoComplete="new-password"
                                placeholder="Mot de passe"
                                className={inputClasses(passwordError)}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <label htmlFor="password" className={labelClasses(passwordError)}>Mot de passe</label>
                            <span className={errorMessageClasses(passwordError)}>{passwordError || '\u00A0'}</span>
                        </div>

                        <div className={inputGroupClasses(passwordConfirmError)}>
                            <input
                                type="password"
                                id="passwordConfirm"
                                name="passwordConfirm"
                                required
                                autoComplete="new-password"
                                placeholder="Confirmer le mot de passe"
                                className={inputClasses(passwordConfirmError)}
                                value={passwordConfirm}
                                onChange={(e) => setPasswordConfirm(e.target.value)}
                            />
                            <label htmlFor="passwordConfirm" className={labelClasses(passwordConfirmError)}>Confirmer le mot de passe</label>
                            <span className={errorMessageClasses(passwordConfirmError)}>{passwordConfirmError || '\u00A0'}</span>
                        </div>

                        <div className={inputGroupClasses(departmentError)}>
                            <input
                                type="text"
                                id="department"
                                name="department"
                                required
                                placeholder="Département"
                                className={inputClasses(departmentError)}
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                            />
                            <label htmlFor="department" className={labelClasses(departmentError)}>Département</label>
                            <span className={errorMessageClasses(departmentError)}>{departmentError || '\u00A0'}</span>
                        </div>
                        <div className="flex gap-4">
                            <button type="submit" className="w-full bg-indigo-600 text-white rounded-md py-3 font-semibold hover:bg-indigo-700 transition-colors disabled:bg-gray-400" disabled={isLoading}>
                                {isLoading ? 'Création...' : 'Créer le compte'}
                            </button>
                            <button type="button" className="w-full bg-gray-200 text-gray-800 rounded-md py-3 font-semibold hover:bg-gray-300 transition-colors" onClick={() => navigate(-1)}>
                                Annuler
                            </button>
                        </div>
                    </form>

                    <div className="text-center mt-6">
                        <span className="text-sm text-gray-600">Vous avez déjà un compte ? </span>
                        <Link to="/login" className="text-sm font-semibold text-indigo-600 hover:underline">Se connecter</Link>
                    </div>
                </div>
                
                <div className={`text-center p-8 bg-white rounded-2xl shadow-lg ${isSuccess ? 'block' : 'hidden'}`}>
                    <div className="flex justify-center mb-4">
                        <svg className="w-12 h-12 text-indigo-600" fill="none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="12" fill="currentColor"/>
                            <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800">Compte créé avec succès !</h3>
                    <p className="text-sm text-gray-500">Redirection vers la page de connexion...</p>
                </div>
            </div>
        </div>
    );
};

export default CreateAccount;
