// app/login.js
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import logo from '../assets/images/logo_viseo.jpeg';
const API_BASE_URL = 'http://10.68.163.2/api/match';

export default function LoginScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLargeDevice = width >= 768;

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [idError, setIdError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const passwordInputRef = useRef(null);
  const logoSize = Math.min(width * 0.35, 100);
  const inputHeight = isLargeDevice ? 58 : 50;
  const buttonHeight = isLargeDevice ? 54 : 48;
  const fontSizeTitle = isLargeDevice ? 26 : 22;
  const fontSizeBase = isLargeDevice ? 16 : 14;
  const containerPadding = width * 0.08;

  const validateIdentifier = () => {
    if (!identifier.trim()) {
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

  const handleLogin = async () => {
    const isIdValid = validateIdentifier();
    const isPassValid = validatePassword();

    if (!isIdValid || !isPassValid) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifiant: identifier.trim(),
          password: password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // ✅ Redirection vers DashboardScreen (route = /DashboardScreen)
        router.replace('/DashboardScreen');
      } else {
        const errorMsg = data.detail || 'Identifiant ou mot de passe incorrect';
        setIdError(errorMsg);
        setPasswordError('');
      }
    } catch (error) {
      console.error('Erreur réseau :', error);
      Alert.alert('Erreur', 'Impossible de contacter le serveur. Vérifiez l’IP et le réseau.');
      setIdError('Serveur inaccessible');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.content, { paddingHorizontal: containerPadding }]}>
          <Image
            source={logo}
            style={[styles.logo, { width: logoSize, height: logoSize, borderRadius: logoSize / 8 }]}
            resizeMode="contain"
          />
          <Text style={[styles.title, { fontSize: fontSizeTitle, marginTop: 20 }]}>
            Viseo Livraison
          </Text>
          <Text style={[styles.subtitle, { fontSize: fontSizeBase * 0.95, marginTop: 6, textAlign: 'center' }]}>
            Bienvenue à nouveau !
          </Text>
          <View style={[styles.inputGroup, { marginTop: 32 }]}>
            <TextInput
              style={[
                styles.input,
                { height: inputHeight, fontSize: fontSizeBase, paddingHorizontal: 16 },
                idError ? styles.inputError : null,
              ]}
              placeholderTextColor={idError ? '#ef4444' : '#9ca3af'}
              value={identifier}
              onChangeText={(text) => {
                setIdentifier(text);
                if (idError) setIdError('');
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
            />
            <Text
              style={[
                styles.floatingLabel,
                { fontSize: fontSizeBase * 0.85, top: -10, left: 12 },
                idError ? styles.labelError : null,
              ]}
            >
              Identifiant
            </Text>
            {idError ? (
              <Text style={[styles.errorText, { fontSize: fontSizeBase * 0.85, marginTop: 6 }]}>{idError}</Text>
            ) : null}
          </View>

          <View style={[styles.inputGroup, { marginTop: 20 }]}>
            <TextInput
              ref={passwordInputRef}
              style={[
                styles.input,
                { height: inputHeight, fontSize: fontSizeBase, paddingHorizontal: 16 },
                passwordError ? styles.inputError : null,
              ]}
              placeholderTextColor={passwordError ? '#ef4444' : '#9ca3af'}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (passwordError) setPasswordError('');
              }}
              secureTextEntry={!isPasswordVisible}
              autoCorrect={false}
              returnKeyType="done"
            />
            <Text
              style={[
                styles.floatingLabel,
                { fontSize: fontSizeBase * 0.85, top: -10, left: 12 },
                passwordError ? styles.labelError : null,
              ]}
            >
              Mot de passe
            </Text>
            <TouchableOpacity
              style={styles.togglePassword}
              onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            >
              <Text style={[styles.toggleIcon, { fontSize: fontSizeBase + 2 }]}>👁️</Text>
            </TouchableOpacity>
            {passwordError ? (
              <Text style={[styles.errorText, { fontSize: fontSizeBase * 0.85, marginTop: 6 }]}>{passwordError}</Text>
            ) : null}
          </View>

          {/* Footer */}
          <View style={styles.footerRow}>
            <View style={styles.rememberMe}>
              <View style={styles.checkbox} />
              <Text style={[styles.rememberText, { fontSize: fontSizeBase, marginLeft: 8 }]}>Se souvenir de moi</Text>
            </View>
            <TouchableOpacity>
              <Text style={[styles.forgotPassword, { fontSize: fontSizeBase }]}>Mot de passe oublié ?</Text>
            </TouchableOpacity>
          </View>

          {/* Bouton */}
          <TouchableOpacity
            style={[
              styles.loginButton,
              { height: buttonHeight, borderRadius: 12, marginTop: 28 },
              isLoading && styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.loginButtonText, { fontSize: fontSizeBase + 2 }]}>Se connecter</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ecfeff',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  logo: {
    alignSelf: 'center',
  },
  title: {
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  subtitle: {
    color: '#6b7280',
    textAlign: 'center',
  },
  inputGroup: {
    width: '100%',
    position: 'relative',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    color: '#111827',
    width: '100%',
  },
  inputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  floatingLabel: {
    position: 'absolute',
    backgroundColor: '#ecfeff',
    paddingHorizontal: 4,
    fontWeight: '500',
    color: '#6b7280',
  },
  labelError: {
    color: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
  },
  togglePassword: {
    position: 'absolute',
    right: 12,
    top: 15,
  },
  toggleIcon: {
    color: '#9ca3af',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 16,
  },
  rememberMe: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 4,
  },
  rememberText: {
    color: '#4b5563',
  },
  forgotPassword: {
    fontWeight: '600',
    color: '#4f46e5',
  },
  loginButton: {
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  loginButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  loginButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});