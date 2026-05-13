import React, { useState } from 'react';
import axios from 'axios';
import logo from '../assets/logo/logo_viseo.jpeg';
import { Link, useNavigate } from 'react-router-dom';
import API_BASE_URL from '../config';

const Login = ({ onLoginSuccess }) => {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [idError, setIdError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const navigate = useNavigate();

    const validateIdentifier = () => {
        if (!identifier) {
            setIdError('L\'identifiant est requis');
            return false;
        }
        setIdError('');
        return true;
    };

    const validatePassword = () => {
        if (!password) {
            setPasswordError('Mot de passe obligatoire');
            return false;
        }
        if (password.length < 6) {
            setPasswordError('Le mot de passe doit contenir au moins 6 caractères');
            return false;
        }
        setPasswordError('');
        return true;
    };

    const handlePasswordToggle = () => {
        setIsPasswordVisible(!isPasswordVisible);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const isIdentifierValid = validateIdentifier();
        const isPasswordValid = validatePassword();

        if (!isIdentifierValid || !isPasswordValid) {
            return;
        }

        setIsLoading(true);
        setPasswordError('');
        setIdError('');

        try {
            const response = await axios.post(`${API_BASE_URL}/token/`, {
            username: identifier,
            password: password,
            });
            localStorage.setItem('authToken', response.data.access);
            setIsSuccess(true);
            setTimeout(() => {
            onLoginSuccess(response.data.access);
            navigate('/');
            }, 2000);
        } catch (error) {
            if (error.response) {
            if (error.response.status === 401) {
                setPasswordError('Identifiant ou mot de passe incorrect.');
            } else {
                setPasswordError(`Erreur: ${error.response.status}. Veuillez réessayer.`);
            }
            } else if (error.request) {
            setPasswordError('Erreur de réseau. Impossible de joindre le serveur.');
            } else {
            setPasswordError('Une erreur inattendue est survenue.');
            }
            setIsLoading(false);
        }
        };


    const inputGroupClasses = (error) => `relative mb-6 ${error ? 'text-red-500' : ''}`;
    const inputClasses = (error) => `w-full bg-white border ${error ? 'border-red-500 bg-red-50' : 'border-gray-300'} rounded-lg py-4 px-3.5 text-gray-900 placeholder-transparent focus:outline-none focus:border-indigo-600`;
    const labelClasses = (error) => `absolute left-3.5 -top-3 text-sm ${error ? 'text-red-500' : 'text-gray-600'} bg-white px-1 transition-all`;
    const errorMessageClasses = (error) => `text-xs text-red-500 mt-1 ${error ? 'opacity-100' : 'opacity-0'}`;

    return (
        <div class="bg-cyan-50 flex items-center justify-center min-h-[100vh] min-w-[100vw] w-full">
            <div className="w-full max-w-md">
                <div className={`bg-white rounded-2xl p-10 shadow-lg border border-gray-100 relative ${isSuccess ? 'hidden' : 'block'}`}>
                    <div className="text-center mb-8">
                        <div className="flex justify-center mb-5">
                            <img src={logo} alt="Viseo Logo" className="w-1/4 h-auto rounded-2xl" />
                        </div>
                        <h1 className="text-2xl font-semibold text-gray-800 mb-2">Viseo Livraison</h1>
                        <p className="text-sm text-gray-500">Bienvenue à nouveau ! Merci de vous connecter pour poursuivre.</p>
                    </div>
                    
                    <form noValidate onSubmit={handleSubmit}>
                        <div className={inputGroupClasses(idError)}>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                required
                                autoComplete="username"
                                placeholder="Identifiant"
                                className={inputClasses(idError)}
                                value={identifier}
                                onChange={(e) => {
                                    setIdentifier(e.target.value);
                                    setIdError('');
                                }}
                            />
                            <label htmlFor="username" className={labelClasses(idError)}>Identifiant</label>
                            <span className={errorMessageClasses(idError)}>{idError || '\u00A0'}</span>
                        </div>
                        <div className={inputGroupClasses(passwordError)}>
                            <input
                                type={isPasswordVisible ? 'text' : 'password'}
                                id="password"
                                name="password"
                                required
                                autoComplete="current-password"
                                placeholder="Mot de passe"
                                className={inputClasses(passwordError)}
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setPasswordError('');
                                }}
                            />
                            <label htmlFor="password" className={labelClasses(passwordError)}>Mot de passe</label>
                            <button type="button" className="absolute right-2 mt-4 ml-2 p-0 bg-transparent hover:bg-transparent border-none" onClick={handlePasswordToggle}>
                                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                            </button>
                            <span className={errorMessageClasses(passwordError)}>{passwordError || '\u00A0'}</span>
                        </div>

                       <div className="flex justify-between items-center -mt-4 mb-6">
                            <label className="flex items-center text-sm text-gray-600">
                                <input
                                type="checkbox"
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <span className="ml-2">Se souvenir de moi</span>
                            </label>
                            <button type="button" className="text-sm font-semibold text-indigo-600 hover:underline mb-1 ml-2">Mot de passe oublié ?</button>
                        </div>
                        <button type="submit" className="w-full bg-indigo-600 text-white rounded-md py-3 font-semibold hover:bg-indigo-700 transition-colors disabled:bg-gray-400" disabled={isLoading}>
                            {isLoading ? 'Connexion...' : 'Se connecter'}
                        </button>
                    </form>

                    <div className="flex items-center my-6">
                        <hr className="flex-grow border-t border-gray-300" />
                        <span className="px-4 text-sm text-gray-500">ou continuer avec</span>
                        <hr className="flex-grow border-t border-gray-300" />
                    </div>

                    <div className="flex gap-3">
                        <button type="button" className="flex-1 bg-white border border-gray-300 rounded-md py-2.5 px-4 text-sm font-medium text-gray-700 flex items-center justify-.center gap-2 hover:bg-gray-50">
                            <svg className="w-5 h-5" viewBox="0 0 16 16">
                                <path fill="#4285F4" d="M14.9 8.161c0-.476-.039-.954-.118-1.421H8.021v2.681h3.833a3.321 3.321 0 01-1.431 2.161v1.785h2.3c1.349-1.25 2.177-3.103 2.177-5.206z"/>
                                <path fill="#34A853" d="M8.021 15c1.951 0 3.57-.65 4.761-1.754l-2.3-1.785c-.653.447-1.477.707-2.461.707-1.887 0-3.487-1.274-4.057-2.991H1.617V11.1C2.8 13.481 5.282 15 8.021 15z"/>
                                <path fill="#FBBC05" d="M3.964 9.177a4.97 4.97 0 010-2.354V4.9H1.617a8.284 8.284 0 000 7.623l2.347-1.346z"/>
                                <path fill="#EA4335" d="M8.021 3.177c1.064 0 2.02.375 2.75 1.111l2.041-2.041C11.616 1.016 9.97.446 8.021.446c-2.739 0-5.221 1.519-6.404 3.9l2.347 1.346c.57-1.717 2.17-2.515 4.057-2.515z"/>
                            </svg>
                            Google
                        </button>
                        
                        <button type="button" className="flex-1 bg-white border border-gray-300 rounded-md py-2.5 px-4 text-sm font-medium text-gray-700 flex items-center justify-center gap-2 hover:bg-gray-50">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="#b47d7dbd" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2 4h12v8H2z" fill="#b47d7dbd"/>
                                <text x="11" y="11" fontFamily="Arial, sans-serif" fontSize="10" fontWeight="bold" fill="#FFFFFF" textAnchor="middle">odoo</text>
                            </svg>
                            Odoo
                        </button>
                    </div>

                    <div className="text-center mt-6">
                        <span className="text-sm text-gray-600">Vous n’avez pas de compte ?</span>
                        <Link to="/register" className="text-sm font-semibold text-indigo-600 hover:underline"> S’inscrire</Link>
                    </div>
                </div>
                <div className={`text-center p-8 bg-white rounded-2xl shadow-lg ${isSuccess ? 'block' : 'hidden'}`}>
                    <div className="flex justify-center mb-4">
                        <svg className="w-12 h-12 text-indigo-600" fill="none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="12" fill="currentColor"/>
                            <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800">Bon retour parmi nous !</h3>
                    <p className="text-sm text-gray-500">Redirection vers votre tableau de bord...</p>
                </div>
            </div>
        </div>
    );
};

export default Login;