import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Text } from 'react-native';
import 'react-native-reanimated';
import 'react-native-url-polyfill/auto';

import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Replace with your actual Stripe publishable key
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session ? session.user.id : 'undefined');
    });
    
    // Cleanup the subscription on unmount
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  if (!loaded) {
    return null;
  }

  if (!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith('pk_')) {
     console.error("Stripe key is not set or invalid. Please check your environment variables.");
     // Render a helpful message for the developer
     return <Text>Error: Stripe key not configured. Check EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY.</Text>;
  }

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
        </StripeProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
