import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { supabase } from '../lib/supabase';
import XummService from '../lib/xumm'; // Import XummService

const PENDING_PAYLOAD_KEY = 'pendingPayloadUuid';

const Auth = () => {
  const [loading, setLoading] = useState(false);
  const [payloadUuid, setPayloadUuid] = useState(null);

  // This effect checks for a pending payload when the app starts/re-opens.
  useEffect(() => {
    const resumePendingLogin = async () => {
      const pendingUuid = await AsyncStorage.getItem(PENDING_PAYLOAD_KEY);
      if (pendingUuid) {
        console.log('Resuming login for pending payload:', pendingUuid);
        setLoading(true);
        setPayloadUuid(pendingUuid);
        pollForSignInResult(pendingUuid);
      }
    };
    resumePendingLogin();
  }, []);

  const createUserSession = async (xrplAddress) => {
    try {
      // setLoading is already true from the polling process
      const uniqueEmail = `${xrplAddress.toLowerCase()}@xrpl.local`;
      const password = 'xrpl-auth-' + xrplAddress; // Simple password based on address

      console.log('Creating session for:', uniqueEmail);

      let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: uniqueEmail,
        password: password,
      });

      if (signInError) {
        console.log('Sign in failed, trying sign up:', signInError.message);

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: uniqueEmail,
          password: password,
        });

        if (signUpError) {
          console.error('Sign up failed:', signUpError);
          Alert.alert('Authentication Error', 'Failed to create user session. Please try again.');
          await AsyncStorage.removeItem(PENDING_PAYLOAD_KEY); // Clean up on failure
          setLoading(false);
          return;
        }

        signInData = signUpData;
      }

      if (signInData?.user) {
        console.log('User session created:', signInData.user.id);
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: signInData.user.id,
            xrpl_address: xrplAddress,
          });

        if (profileError) {
          console.error('Profile update error:', profileError);
        }

        console.log('Authentication successful, navigating to profile...');
        await AsyncStorage.removeItem(PENDING_PAYLOAD_KEY); // Clean up on success
        router.replace('/profile');
      }
    } catch (error) {
      console.error('Session creation error:', error);
      Alert.alert('Authentication Error', 'Failed to authenticate. Please try again.');
      await AsyncStorage.removeItem(PENDING_PAYLOAD_KEY);
    } finally {
      setLoading(false);
      setPayloadUuid(null);
    }
  };

  const handleXummLogin = async () => {
    if (loading) return; // Prevent multiple login attempts

    try {
      setLoading(true);

      const result = await XummService.createSignInRequest();

      if (result.success) {
        await AsyncStorage.setItem(PENDING_PAYLOAD_KEY, result.uuid); // Store UUID
        setPayloadUuid(result.uuid);

        const opened = await Linking.openURL(result.deeplink);
        if (opened) {
          pollForSignInResult(result.uuid);
        } else {
           Alert.alert(
            'XUMM Not Found',
            'Could not open the XUMM app. Please ensure it is installed.',
             [
                { text: 'OK', onPress: async () => {
                  setLoading(false);
                  await AsyncStorage.removeItem(PENDING_PAYLOAD_KEY);
                } }
             ]
           );
        }
      } else {
        Alert.alert('Login Error', result.error || 'Could not create a sign-in request.');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error during XUMM login:', error);
      Alert.alert('Login Error', 'An unexpected error occurred.');
      setLoading(false);
    }
  };

  const pollForSignInResult = async (uuid) => {
    const maxAttempts = 60; // Poll for 5 minutes (5-second intervals)
    let attempts = 0;

    const cleanup = async () => {
      setLoading(false);
      setPayloadUuid(null);
      await AsyncStorage.removeItem(PENDING_PAYLOAD_KEY);
    };

    const poll = async () => {
      const currentPayloadUuid = await AsyncStorage.getItem(PENDING_PAYLOAD_KEY);
      if (currentPayloadUuid !== uuid) {
        console.log("Polling stopped: a new login process has started or it was cancelled.");
        return;
      }

      if (attempts >= maxAttempts) {
        await cleanup();
        Alert.alert('Timeout', 'The wallet sign-in request timed out.');
        return;
      }

      try {
        const payloadStatus = await XummService.checkPayloadStatus(uuid);

        // checkPayloadStatus returns an object with `success: false` on a network/server error,
        // or the full payload object from the backend on success.
        if (payloadStatus.success === false) {
          // This indicates a network or fetch error from our service. We should retry.
          console.warn('Polling check failed, retrying in 5s...', payloadStatus.error);
          attempts++;
          setTimeout(poll, 5000);
          return;
        }

        // If we get here, we have a valid payload status object.
        const { meta, response } = payloadStatus;

        if (meta.signed) {
          console.log('Payload signed successfully. Creating session for account:', response.account);
          // Stop polling and proceed to create the session.
          // createUserSession will handle cleanup and navigation.
          await createUserSession(response.account);
          return;
        }

        if (meta.cancelled) {
          console.log('Payload was cancelled by the user.');
          await cleanup();
          Alert.alert('Cancelled', 'The sign-in request was cancelled in the wallet.');
          return;
        }
        
        if (meta.expired) {
            console.log('Payload has expired.');
            await cleanup();
            Alert.alert('Login Expired', 'The sign-in request has expired.');
            return;
        }

        // If it's not signed, cancelled, or expired, we assume it's still pending.
        console.log('Payload is still pending. Polling again in 5s.');
        attempts++;
        setTimeout(poll, 5000);
        
      } catch (error) {
        // This catches any unexpected critical exceptions during the process.
        console.error('Critical error during polling:', error);
        attempts++;
        setTimeout(poll, 5000); // Retry on critical errors too.
      }
    };

    // Start the first poll after 1 second
    setTimeout(poll, 1000);
  };
  
  const handleCancelLogin = async () => {
    console.log("User cancelled pending login.");
    if (payloadUuid) {
      // This will fire and forget, which is fine.
      XummService.disconnect(payloadUuid);
    }
    setLoading(false);
    setPayloadUuid(null);
    await AsyncStorage.removeItem(PENDING_PAYLOAD_KEY);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Waiting for XUMM login...</Text>
          <Text style={styles.loadingSubText}>Please check your XUMM app to sign the request.</Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelLogin}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to RippleFund</Text>
        <Text style={styles.subtitle}>Secure, transparent, and efficient micro-lending powered by the XRP Ledger.</Text>
        
        <TouchableOpacity style={styles.xummButton} onPress={handleXummLogin} disabled={loading}>
          <Text style={styles.xummButtonText}>Login with XUMM</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  loadingSubText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 48,
    lineHeight: 24,
  },
  xummButton: {
    backgroundColor: '#007bff',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  xummButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    marginTop: 24,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelButtonText: {
    color: '#6c757d',
    fontSize: 16,
    fontWeight: '500',
  },
  footerText: {
    marginTop: 48,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});

export default Auth;